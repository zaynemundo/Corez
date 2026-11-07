// The composer has two shapes: a one-row pill while the prompt fits beside the
// attach and send controls, and a grid with the controls on their own bottom
// row once it wraps. Deciding which shape is needed must not depend on the
// shape currently painted: the multiline textarea is much wider, so a prompt
// that only just wrapped fits again there, and the two layouts keep
// contradicting each other. On a long prompt that showed up as the composer
// jumping between the shapes on every keystroke (and getting stuck with one
// line of text above a control row).
//
// Both shapes therefore compare the same number: the prompt's single-line
// width, measured with the textarea's real font, against the width the
// textarea gets beside the controls. That measurement is identical in both
// layouts, so a prompt crosses the line once and the composer stays there.

/** Slack that keeps a prompt one pixel from the edge out of the wrapped shape. */
export const COMPOSER_MULTILINE_TOLERANCE_PX = 2;

let measureCanvas = null;

/**
 * Width of `text` on one line in `font` (a canvas font string), or null when
 * the environment cannot measure (jsdom, SSR).
 */
export function measureSingleLineWidth(text, font) {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const context =
    typeof measureCanvas.getContext === "function"
      ? measureCanvas.getContext("2d")
      : null;
  if (!context) return null;
  if (font) context.font = font;
  const width = context.measureText(String(text ?? "")).width;
  return Number.isFinite(width) ? width : null;
}

/**
 * The composer's row geometry: the width the prompt gets when the controls sit
 * in the same row, and the font its text is drawn with. Derived from the form
 * and its controls, so the value is the same whichever shape is rendered.
 */
export function readComposerMetrics(textarea) {
  const form = textarea?.closest?.("form.input-box");
  if (!form) return null;
  const formStyle = getComputedStyle(form);
  const textareaStyle = getComputedStyle(textarea);
  const gap = Number.parseFloat(formStyle.columnGap) || 0;
  const paddingLeft = Number.parseFloat(formStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(formStyle.paddingRight) || 0;
  const attach = form.querySelector(".attach-btn");
  const actions = form.querySelector(".input-actions-bar");
  const controlsWidth =
    (attach?.offsetWidth || 0) + (actions?.offsetWidth || 0);
  const rowWidth =
    form.clientWidth - paddingLeft - paddingRight - controlsWidth - gap * 2;
  const font = [
    textareaStyle.fontStyle,
    textareaStyle.fontWeight,
    textareaStyle.fontSize,
    textareaStyle.fontFamily,
  ]
    .filter((part) => Boolean(part))
    .join(" ");
  return { rowWidth, font };
}

/**
 * Which shape the prompt needs.
 *
 * - "single": it fits on one line beside the controls
 * - "multiline": it wraps, or carries an explicit line break
 * - "unknown": the environment cannot measure (no canvas, no layout yet, or no
 *   measureLineWidth), so the caller keeps the current shape instead of
 *   guessing from a layout that may be about to change.
 *
 * measureLineWidth is required on purpose: the caller owns the font the prompt
 * is actually drawn with, and this module's canvas carries the previous font
 * between calls, so a silent fallback would measure with the wrong one.
 */
export function decideComposerLayout({
  text,
  rowWidth,
  measureLineWidth,
  tolerance = COMPOSER_MULTILINE_TOLERANCE_PX,
}) {
  const value = String(text ?? "");
  if (value.includes("\n")) return "multiline";
  // A trailing collapsible space or tab hangs past the line end instead of
  // wrapping the line, so it must not push the composer into the wrapped shape
  // on its own. Non-breaking whitespace does not hang and stays measured.
  const measurable = value.replace(/[ \t]+$/u, "");
  if (!measurable) return "single";
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return "unknown";
  if (typeof measureLineWidth !== "function") return "unknown";
  const width = measureLineWidth(measurable);
  if (!Number.isFinite(width) || width < 0) return "unknown";
  return width > rowWidth - tolerance ? "multiline" : "single";
}