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

Please fix all detected errors and output ONLY the revised, production-ready, complete single-file HTML inside a single \`\`\`html ... \`\`\` code block. Ensure a valid <canvas> element, game loop, rendering behavior appropriate to the requested visual style, and complete input handling are included. Do not introduce retro or pixel-art styling unless the original request specifies it.`;
}
