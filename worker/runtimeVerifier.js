// Browser Run runtime verification for generated artifacts.
//
// Structural checks cannot tell whether a page actually executes: a Three.js
// scene can pass every static rule and still fail because the global runtime
// was never loaded. This module opens the generated HTML in a real Browser Run
// session, captures uncaught errors / WebGL availability, and returns a
// bounded report that the creation harness can turn into repair failures.

/* global document, window */
import puppeteer from "@cloudflare/puppeteer";

const THREE_CDN_SCRIPT =
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const THREE_REFERENCE_PATTERN =
  /(?:window\.THREE\b|\bTHREE\s*\.|new\s+THREE\b|@react-three\/|from\s+['"]three['"])/;
const RUNTIME_SURFACE_PATTERN =
  /<canvas|<script|THREE|WebGL|requestAnimationFrame|getContext|document\.|addEventListener/i;
const PRIVATE_HOST_PATTERN =
  /^(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;
const MAX_HTML_CHARS = 2_000_000;
const MAX_ERROR_CHARS = 600;
const MAX_ERRORS = 20;

export function needsRuntimeCheck(code) {
  const text = String(code || "");
  if (!text || text.length > MAX_HTML_CHARS) return false;
  return RUNTIME_SURFACE_PATTERN.test(text);
}

export function needsThreeRuntime(code) {
  return THREE_REFERENCE_PATTERN.test(String(code || ""));
}

export function prepareRuntimeHtml(code) {
  const html = String(code || "");
  if (!needsThreeRuntime(html)) return html;
  if (/<script[^>]+src=["'][^"']*three(?:\.min)?\.js/i.test(html)) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /<head[^>]*>/i,
      (match) => `${match}\n  ${THREE_CDN_SCRIPT}`,
    );
  }
  return `${THREE_CDN_SCRIPT}\n${html}`;
}

function bounded(value) {
  return String(value || "").slice(0, MAX_ERROR_CHARS);
}

function pushError(list, message) {
  if (!message || list.length >= MAX_ERRORS) return;
  const text = bounded(message);
  if (!list.includes(text)) list.push(text);
}

function isPrivateUrl(rawUrl) {
  if (!/^https?:/i.test(rawUrl)) return true;
  try {
    const host = new URL(rawUrl).hostname;
    return PRIVATE_HOST_PATTERN.test(host);
  } catch {
    return true;
  }
}

async function inspectPage(page, html) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pushError(pageErrors, error?.message || error));
  page.on("console", (message) => {
    if (message.type?.() === "error") {
      pushError(consoleErrors, message.text?.());
    }
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (isPrivateUrl(request.url())) {
      request.abort().catch(() => {});
      return;
    }
    request.continue().catch(() => {});
  });
  await page.setContent(html, {
    waitUntil: "networkidle2",
    timeout: 15_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 900));
  const state = await page.evaluate(() => {
    let webgl;
    try {
      const probe = document.createElement("canvas");
      webgl = Boolean(
        probe.getContext("webgl2") ||
          probe.getContext("webgl") ||
          probe.getContext("experimental-webgl"),
      );
    } catch (error) {
      webgl = String(error?.message || error);
    }
    return {
      three: typeof window.THREE,
      webgl,
      canvasCount: document.querySelectorAll("canvas").length,
      canvasVisible: Array.from(document.querySelectorAll("canvas")).some(
        (element) => element.width > 0 && element.height > 0,
      ),
      bodyText: String(document.body?.innerText || "").slice(0, 900),
      title: String(document.title || "").slice(0, 160),
      hasFallbackText: /webgl\s*unavailable|webgl is not available/i.test(
        String(document.body?.innerText || ""),
      ),
    };
  });
  return { pageErrors, consoleErrors, state };
}

function buildFailures({ pageErrors, consoleErrors, state, html }) {
  const failures = [];
  pageErrors.forEach((message) => {
    failures.push({
      code: "runtime-error",
      detail: `Uncaught browser error: ${message}`,
    });
  });
  consoleErrors.forEach((message) => {
    if (/uncaught|three|webgl|shader|typeerror|referenceerror/i.test(message)) {
      failures.push({
        code: "runtime-console-error",
        detail: `Browser console error: ${message}`,
      });
    }
  });
  if (needsThreeRuntime(html) && state.three !== "object") {
    failures.push({
      code: "runtime-three-missing",
      detail:
        "The page uses THREE, but the initialised browser has no global THREE object.",
    });
  }
  if (
    (needsThreeRuntime(html) ||
      /webgl|shader|THREE/i.test(html) ||
      (/canvas/i.test(html) && /3d|three/i.test(html))) &&
    state.webgl !== true
  ) {
    failures.push({
      code: "runtime-webgl-unavailable",
      detail:
        "The initialised browser could not create a WebGL context, so a WebGL page cannot render.",
    });
  }
  if (state.hasFallbackText) {
    failures.push({
      code: "runtime-fallback-active",
      detail:
        'The page rendered its "WebGL unavailable" fallback instead of the interactive scene.',
    });
  }
  return failures;
}

export async function runRuntimeVerification(
  env,
  html,
  { includeScreenshot = false, timeoutMs = 25_000 } = {},
) {
  if (!env?.BROWSER || typeof env.BROWSER !== "object") {
    return {
      checked: false,
      skipped: true,
      reason: "Browser Run is not configured.",
      failures: [],
    };
  }
  if (!needsRuntimeCheck(html)) {
    return {
      checked: false,
      skipped: true,
      reason: "No executable runtime surface detected.",
      failures: [],
    };
  }
  const source = prepareRuntimeHtml(html);
  const startedAt = Date.now();
  let browser = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    const inspection = await Promise.race([
      inspectPage(page, source),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Runtime verification timed out.")),
          timeoutMs,
        ),
      ),
    ]);
    const failures = buildFailures({ ...inspection, html: source });
    let screenshot = null;
    if (includeScreenshot) {
      try {
        screenshot = await page.screenshot({
          type: "jpeg",
          quality: 55,
          encoding: "base64",
          fullPage: false,
        });
      } catch {
        screenshot = null;
      }
    }
    return {
      checked: true,
      passed: failures.length === 0,
      failures,
      pageErrors: inspection.pageErrors,
      consoleErrors: inspection.consoleErrors,
      state: inspection.state,
      screenshot: includeScreenshot
        ? screenshot
          ? `data:image/jpeg;base64,${screenshot}`
          : null
        : undefined,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      checked: false,
      skipped: true,
      reason: bounded(error?.message || error),
      failures: [],
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export function runtimeSummary(result) {
  if (!result) return "not run";
  if (result.skipped) return `skipped: ${result.reason || "unavailable"}`;
  return result.passed
    ? `passed in ${result.durationMs}ms`
    : `failed: ${result.failures.map((failure) => failure.detail).join(" | ")}`;
}
