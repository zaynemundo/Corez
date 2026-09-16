import { parse } from "acorn";

/**
 * Real JavaScript syntax checking for delivered artifacts.
 *
 * The structural verifier counts braces across the whole document with a ±10
 * tolerance, so a game can ship with a single missing "}" and still pass — the
 * preview then dies with "SyntaxError: missing } in compound statement" and the
 * user sees a broken creation. Parsing each inline script catches every syntax
 * error (unbalanced blocks, stray tokens, truncated continuations) and reports
 * the line number the browser would report, so the harness repair prompt is
 * precise.
 *
 * Only inline JavaScript is parsed: external scripts (nothing to parse),
 * JSON/importmap blocks and JSX/TS templates (`type="text/babel"`) are skipped,
 * because those are not plain ECMAScript and would produce false failures.
 */

const SCRIPT_BLOCK_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

const JS_SCRIPT_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
]);

const NON_JS_SCRIPT_TYPE_PATTERN =
  /(json|babel|jsx|tsx|typescript|template|importmap|speculationrules|plain|html)/i;

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * @returns {Array<{message: string, line: number|null, column: number|null}>}
 */
export function findInlineScriptSyntaxErrors(html, { maxErrors = 3 } = {}) {
  const content = String(html || "");
  if (!content.trim()) return [];

  const errors = [];
  SCRIPT_BLOCK_PATTERN.lastIndex = 0;
  let match;
  while (
    (match = SCRIPT_BLOCK_PATTERN.exec(content)) !== null &&
    errors.length < maxErrors
  ) {
    const attributes = match[1] || "";
    const code = match[2] || "";
    if (!code.trim()) continue;
    if (/\bsrc\s*=/i.test(attributes)) continue;

    const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']*)["']/i);
    const type = (typeMatch?.[1] || "").trim().toLowerCase();
    if (!JS_SCRIPT_TYPES.has(type)) continue;
    if (NON_JS_SCRIPT_TYPE_PATTERN.test(type)) continue;

    const codeOffset = match[0].indexOf(code);
    const startLine = lineAt(
      content,
      match.index + (codeOffset >= 0 ? codeOffset : 0),
    );

    try {
      parse(code, {
        ecmaVersion: "latest",
        sourceType: type === "module" ? "module" : "script",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
      });
    } catch (error) {
      const relativeLine = Number(error?.loc?.line) || null;
      errors.push({
        message: String(error?.message || "Invalid JavaScript"),
        line: relativeLine ? startLine + relativeLine - 1 : startLine,
        column: Number.isFinite(error?.loc?.column)
          ? Number(error.loc.column)
          : null,
      });
    }
  }
  return errors;
}
