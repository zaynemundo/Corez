/**
 * Automated Browser & Game HTML Testing Module
 * Evaluates generated game HTML using DOM parsing and headless browser inspection.
 * Captures syntax, console, canvas initialisation, inputs, and asset loading errors for automated repair passes.
 */

import { JSDOM } from "jsdom";

export async function testGameHtml(
  htmlContent,
  assetManifest = {},
  options = {},
) {
  const errors = [];
  const warnings = [];

  if (!htmlContent || typeof htmlContent !== "string" || !htmlContent.trim()) {
    return {
      passed: false,
      errors: ["Game HTML content is empty or null."],
      warnings: [],
    };
  }

  // 1. Basic HTML Structure check
  if (
    !htmlContent.includes("<!DOCTYPE html>") &&
    !htmlContent.includes("<html")
  ) {
    errors.push("HTML does not contain a valid DOCTYPE or <html> declaration.");
  }

  let dom;
  try {
    // Scripts only execute when explicitly enabled (default: static analysis only).
    // External resources are never fetched by the tester (no SSRF surface).
    const executeScripts = options.executeScripts === true;
    dom = new JSDOM(htmlContent, {
      runScripts: executeScripts ? "dangerously" : undefined,
      virtualConsole: new (await import("jsdom")).VirtualConsole(),
    });
  } catch (err) {
    return {
      passed: false,
      errors: [`HTML Parsing Exception: ${err.message}`],
      warnings: [],
    };
  }

  const document = dom.window.document;

  // 2. Check for Canvas element
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    errors.push("No <canvas> element found in generated HTML.");
  } else {
    if (!canvas.width || !canvas.height) {
      warnings.push("<canvas> dimensions are missing or set to zero.");
    }
  }

  // 3. Check for Game Loop or Animation logic
  const scriptTags = Array.from(document.querySelectorAll("script"))
    .map((s) => s.textContent)
    .join("\n");
  const hasGameLoop =
    scriptTags.includes("requestAnimationFrame") ||
    scriptTags.includes("setInterval") ||
    scriptTags.includes("gameLoop") ||
    scriptTags.includes("update");
  if (!hasGameLoop) {
    warnings.push(
      "No explicit requestAnimationFrame or game loop pattern detected in scripts.",
    );
  }

  // 4. Check for Input Handling
  const hasKeyboard =
    scriptTags.includes("keydown") || scriptTags.includes("keyup");
  if (!hasKeyboard) {
    warnings.push("No keyboard input listeners (keydown/keyup) detected.");
  }

  // 5. Check for Asset Manifest references
  const assetKeys = assetManifest.assets
    ? assetManifest.assets.map((a) => a.id)
    : [];
  for (const assetId of assetKeys) {
    if (!scriptTags.includes(assetId) && !htmlContent.includes(assetId)) {
      warnings.push(
        `Asset ID "${assetId}" is defined in manifest but not referenced in game code.`,
      );
    }
  }

  // 6. Security Inspection: Check for unapproved external network requests
  const externalScripts = Array.from(
    document.querySelectorAll("script[src]"),
  ).map((s) => s.getAttribute("src"));
  for (const src of externalScripts) {
    if (src.startsWith("http://") || src.startsWith("https://")) {
      errors.push(
        `Security Warning: Unapproved external script loading detected from "${src}".`,
      );
    }
  }

  // 7. JavaScript syntax check: compile every inline classic script without
  // executing it. A game that cannot even parse can never be functional.
  // (Module scripts with import/export are skipped — single-file game builds
  // are classic scripts; the execution gate below covers the rest.)
  try {
    const { default: vm } = await import("node:vm");
    const inlineScripts = Array.from(document.querySelectorAll("script"))
      .filter((s) => !s.getAttribute("src"))
      .map((s) => s.textContent || "");
    inlineScripts.forEach((code, idx) => {
      if (!code.trim()) return;
      if (/^\s*(import\s|export\s)/m.test(code)) return;
      try {
        new vm.Script(code, { filename: `game-inline-${idx}.js` });
      } catch (err) {
        errors.push(`JavaScript syntax error in inline game script: ${err.message}`);
      }
    });
  } catch {
    // Non-node runtimes without node:vm keep the remaining static checks.
  }

  // 8. Functional execution gate (opt-in): actually boot the game headlessly,
  // click its start control, feed it input, and require a live render loop
  // with zero script errors. Pattern checks above pass dead games (a loop
  // that draws nothing, a start button wired to a crash); this does not.
  if (options.functional === true) {
    const functional = await runFunctionalGameCheck(htmlContent);
    for (const err of functional.errors) errors.push(err);
  }

  const passed = errors.length === 0;

  return {
    passed,
    errors,
    warnings,
    summary: passed
      ? "Automated browser testing passed cleanly."
      : `Testing failed with ${errors.length} error(s) and ${warnings.length} warning(s).`,
  };
}

export function generateRepairPrompt(originalPrompt, previousHtml, testResult) {
  return `The previous game HTML generation failed automated browser inspection.

Errors Detected:
${testResult.errors.map((e) => `- ${e}`).join("\n")}

${testResult.warnings.length > 0 ? `Warnings:\n${testResult.warnings.map((w) => `- ${w}`).join("\n")}` : ""}

Original Game Request:
"${originalPrompt}"

Please fix all detected errors and output ONLY the revised, production-ready, complete single-file HTML inside a single \`\`\`html ... \`\`\` code block. Ensure a valid <canvas> element, game loop, rendering behavior appropriate to the requested visual style, and complete input handling are included. The game must boot with zero console errors, expose a clickable start control, wire every input to visible on-screen effect, and include both a win path and a lose path with restart. Do not introduce retro or pixel-art styling unless the original request specifies it.`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function installDesktopStubs(window) {
  // Emulate the desktop Chrome the game will actually run in, so the
  // headless check never fails a game for APIs that exist in browsers.
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
  }
  if (window.Element && !window.Element.prototype.requestPointerLock) {
    window.Element.prototype.requestPointerLock = function () {};
  }
  if (!window.document.exitPointerLock) {
    window.document.exitPointerLock = function () {};
  }
  if (!window.AudioContext) {
    const paramStub = () => ({
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      value: 0,
    });
    window.AudioContext = class {
      constructor() {
        this.state = "suspended";
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.destination = {};
      }
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      createOscillator() {
        return {
          type: "",
          frequency: paramStub(),
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return { gain: paramStub(), connect() {} };
      }
      createBuffer() {
        return { getChannelData() { return new Float32Array(0); } };
      }
      createBufferSource() {
        return { buffer: null, connect() {}, start() {}, stop() {} };
      }
      createBiquadFilter() {
        return { type: "", frequency: paramStub(), Q: paramStub(), connect() {} };
      }
    };
  }
}

function installCanvasStub(window, drawCalls) {
  const gradientStub = { addColorStop() {} };
  const makeCtx = (canvasEl) => {
    const store = { canvas: canvasEl };
    return new Proxy(store, {
      get(t, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "then") return undefined;
        if (prop in t) return t[prop];
        return (...args) => {
          drawCalls.push(prop);
          void args;
          if (
            prop === "createLinearGradient" ||
            prop === "createRadialGradient" ||
            prop === "createPattern"
          )
            return gradientStub;
          if (prop === "measureText") return { width: 0 };
          if (prop === "getImageData")
            return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
          return undefined;
        };
      },
      set(t, prop, value) {
        t[prop] = value;
        return true;
      },
    });
  };
  if (window.HTMLCanvasElement) {
    window.HTMLCanvasElement.prototype.getContext = function () {
      if (!this.__corezCtx) this.__corezCtx = makeCtx(this);
      return this.__corezCtx;
    };
  }
}

function findStartControl(document) {
  const candidates = Array.from(
    document.querySelectorAll('button, a, [role="button"]'),
  );
  const match = candidates.find((el) => {
    const label = `${el.textContent || ""} ${el.id || ""} ${el.className || ""}`;
    return /\b(play|start|deploy|begin|retry)\b/i.test(label);
  });
  if (match) return match;
  // Click-to-start canvas games: the canvas itself is the start control.
  return document.querySelector("canvas");
}

/**
 * Headless functional check: boot the game, click start, feed it input, and
 * require a live render loop with zero script errors. Returns
 * { passed, errors }. Never throws — setup failures become error entries.
 */
export async function runFunctionalGameCheck(htmlContent) {
  const errors = [];
  let dom = null;
  try {
    const scriptErrors = [];
    const drawCalls = [];
    const { VirtualConsole } = await import("jsdom");
    // Swallow jsdom's own console forwarding: script failures are captured
    // deterministically through the window error listener below, so CI logs
    // stay clean while the signal is preserved.
    const quietConsole = new VirtualConsole();
    dom = new JSDOM(htmlContent, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: quietConsole,
      url: "https://localhost/",
      beforeParse(window) {
        window.__corezErrors = scriptErrors;
        window.addEventListener("error", (event) => {
          const msg =
            (event && (event.message ||
              (event.error && event.error.message))) ||
            "Unknown script error";
          scriptErrors.push(String(msg));
        });
        installDesktopStubs(window);
        installCanvasStub(window, drawCalls);
      },
    });

    const { window } = dom;
    const { document } = window;

    await sleep(250);

    const startControl = findStartControl(document);
    if (!startControl) {
      errors.push(
        "functional: no clickable start control found — the game cannot be started headlessly.",
      );
      return { passed: false, errors };
    }
    try {
      startControl.click();
    } catch (err) {
      errors.push(`functional: start control threw on click: ${err.message}`);
    }

    const dispatch = (type, init) => {
      try {
        if (type.startsWith("key")) {
          window.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, ...init }));
        } else if (type.startsWith("mouse") || type === "click") {
          const target = document.querySelector("canvas") || document.body;
          target.dispatchEvent(
            new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
          );
        } else if (type.startsWith("touch")) {
          const target = document.querySelector("canvas") || document.body;
          target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
        }
      } catch {
        // Input dispatch must never fail the check itself.
      }
    };
    dispatch("keydown", { code: "ArrowRight", key: "ArrowRight" });
    dispatch("keydown", { code: "Space", key: " " });
    dispatch("mousedown", { button: 0 });
    dispatch("touchstart", {});
    await sleep(500);
    dispatch("keyup", { code: "ArrowRight", key: "ArrowRight" });
    dispatch("keyup", { code: "Space", key: " " });

    const seen = new Set();
    for (const msg of scriptErrors) {
      const key = String(msg).slice(0, 200);
      if (!seen.has(key)) {
        seen.add(key);
        errors.push(`functional: game threw at runtime: ${key}`);
      }
      if (seen.size >= 3) break;
    }

    if (drawCalls.length === 0) {
      errors.push(
        "functional: render loop produced zero canvas draw calls after start and input — the game renders nothing.",
      );
    }

    return { passed: errors.length === 0, errors };
  } catch (err) {
    return { passed: false, errors: [`functional: harness setup failed: ${err.message}`] };
  } finally {
    try {
      if (dom) dom.window.close();
    } catch {
      // Ignore cleanup errors.
    }
  }
}
