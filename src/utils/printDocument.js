/**
 * Browsers stamp every printed page with their own chrome — the date, the
 * document title, the URL and page numbers. For a generated page saved as
 * PDF that chrome is noise *inside* the user's document, and the print
 * dialog's "Headers and footers" checkbox is easy to miss. Neutralise it in
 * the printable copy instead: zero page margins drop the browser chrome,
 * and body padding keeps content off the paper edge.
 */
const PRINT_RESET_CSS =
  "<style data-corez-print>@page{margin:0}body{padding:12mm;box-sizing:border-box}</style>";

export function injectPrintReset(html) {
  if (!html || typeof html !== "string") return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${PRINT_RESET_CSS}</head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /(<html[^>]*>)/i,
      `$1<head>${PRINT_RESET_CSS}</head>`,
    );
  }
  return `<head>${PRINT_RESET_CSS}</head>${html}`;
}

/**
 * Print an HTML document (Save as PDF) without touching the preview iframe.
 *
 * The preview runs sandboxed WITHOUT `allow-modals` on purpose — generated
 * pages must never be able to pop alert()/confirm() dialogs over the app —
 * but that also blocks `iframe.contentWindow.print()`: the spec silently
 * ignores print() in a modal-blocked frame, so the canvas "Export to PDF /
 * Print" button did nothing. Instead this renders the same source into a
 * temporary same-origin, unsandboxed iframe (a blob: URL inherits the app
 * origin) and prints that. The frame is invisible, never intercepts input,
 * and is removed on `afterprint` (plus a safety timeout).
 *
 * @param {string} sourceHtml raw page source (repaired before printing)
 * @returns {boolean} true when a print was attempted
 */
export function printHtmlDocument(sourceHtml) {
  if (!sourceHtml || typeof sourceHtml !== "string") return false;
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }
  let frame = null;
  let url = null;
  const cleanup = () => {
    try {
      window.removeEventListener("afterprint", cleanup);
    } catch {}
    try {
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    } catch {}
    try {
      if (url && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    } catch {}
    frame = null;
    url = null;
  };
  try {
    // The printable copy gets the header/footer reset; the preview and the
    // downloaded source are untouched.
    const blob = new Blob([injectPrintReset(sourceHtml)], {
      type: "text/html",
    });
    if (typeof URL.createObjectURL !== "function") return false;
    url = URL.createObjectURL(blob);
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    // Same recipe as print.js: positioned off-screen with no size. The print
    // layout is independent of the on-screen box, so the full document
    // prints while the frame never flashes or takes a tap target.
    frame.style.cssText =
      "border:0;position:absolute;width:0;height:0;right:0;bottom:0;";
    frame.src = url;
    frame.onload = () => {
      let printed = false;
      try {
        const target = frame ? frame.contentWindow : null;
        if (target && typeof target.print === "function") {
          target.focus();
          target.print();
          printed = true;
        }
      } catch {}
      if (!printed) {
        // No printable frame (should not happen outside tests): fall back to
        // printing the app rather than doing nothing at all.
        try {
          window.print();
        } catch {}
      }
    };
    window.addEventListener("afterprint", cleanup);
    document.body.appendChild(frame);
    // afterprint does not fire when the dialog is never shown (blocked
    // popups, headless runs): never leak the frame or the blob URL.
    setTimeout(cleanup, 120000);
    return true;
  } catch {
    cleanup();
    return false;
  }
}
