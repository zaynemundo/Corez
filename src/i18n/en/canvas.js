// English dictionary — live preview canvas and the game/preview shell. Add keys
// here when translating src/components/CanvasPreview.jsx,
// src/components/SecureGamePreview.jsx and src/components/ErrorBoundary.jsx.
// Addressed as `canvas.<key>`.
//
// Rules for every dictionary file:
//  - English values must stay byte-identical to the strings that shipped before
//    localisation, because the UI tests assert on them.
//  - Use {placeholders} for values that change; never build sentences by
//    concatenating fragments.
//  - One key per user-visible string; keep the wording stable across releases.
//  - "Fullscreen"/"Exit Fullscreen" are reused from chat.message.image.* rather
//    than duplicated here (rule 8).
export default {
  // Canvas header: view-mode toggle, device selector, action icons and the
  // preview iframe's accessible name.
  header: {
    source: "Source",
    preview: "Preview",
    viewSource: "View source code",
    backToPreview: "Back to preview",
    desktopView: "Desktop Screen View",
    laptopView: "Laptop View (1366 × 768)",
    tableView: "Tablet View (768 × 1024)",
    mobileView: "Mobile View (375 × 812)",
    reloadPreview: "Reload Preview",
    copySource: "Copy Source Code",
    downloadZip: "Download Website (.zip)",
    downloadHtml: "Download .html file",
    exportPrint: "Export to PDF / Print",
    toggleFullscreen: "Toggle Fullscreen",
    closePreview: "Close Preview",
    iframeTitle: "Live Application Preview ({device})",
    sourceEditor: "Source code editor",
    device: {
      desktop: "Desktop",
      laptop: "Laptop",
      tablet: "Tablet",
      mobile: "Mobile",
    },
  },

  // Empty / streaming states in the canvas body.
  empty: {
    building: "Live Designing & Building...",
    buildingDetail:
      "Streaming visual components, layout shaders & logic into preview canvas.",
    noApp: "No Active App Running",
    // Split around the emphasised button name in the component.
    intro: "Ask Corez to build an application or click ",
    runPreview: "\"Run Preview\"",
    end: " on any code block.",
  },

  // Multi-page completeness banner shown above the preview.
  validation: {
    incomplete: "Incomplete site",
    publishingBlocked: "Publishing is blocked until fixed.",
  },

  // Runtime failure banner reported by the preview iframe.
  error: {
    kindCsp: "Blocked by security policy",
    kindResource: "Preview asset failed to load",
    kindUnhandledRejection: "Unhandled preview promise rejection",
    kindRuntime: "Preview runtime error",
    messageFallback: "Preview error",
    copied: "Copied ✓",
    dismiss: "Dismiss preview error",
  },

  // Publish flow: header button, share modal (link / QR / embed) and slug form.
  publish: {
    action: "Publish",
    publishing: "Publishing...",
    shareTitle: "Publish this creation and share the link",
    modalLabel: "Share your published creation",
    // Split around the emphasised creation title in the component.
    shareIntro: "Anyone with this link can open ",
    shareEnd: ":",
    slugLockedIntro:
      "Custom URL slugs are available on Standard and Premium plans. ",
    slugLockedCta: "Upgrade",
    slugLockedEnd: " to choose a custom link.",
    badge:
      "Free plan: your published page shows a small “Made with Corez” badge. Upgrade, then republish to remove it.",
    upgrade: "Upgrade",
    tabLink: "Share Link",
    tabQr: "QR Code",
    tabEmbed: "Embed Code",
    shareLinkLabel: "Published share link",
    copyLinkTitle: "Copy link",
    openNewTab: "Open in new tab",
    slugLocked: "Custom slug locked (1-time change used)",
    slugLockedDetail: "Republishing automatically updates this link.",
    slugLabel: "Customize URL slug:",
    slugOneTime: "1-time change",
    slugAriaLabel: "Custom slug",
    saveSlug: "Save Slug",
    slugUpgrade:
      "Custom URL slugs are available on Standard and Premium plans.",
    slugInvalid:
      "Slug must be 3-50 characters with lowercase letters, numbers, and single hyphens.",
    slugUpdated: "URL updated successfully!",
    slugTaken: "Slug already in use or unavailable. Try another.",
    slugFailed: "Failed to update slug. Please try again.",
    qrAlt: "QR code linking to {url}",
    qrScan: "Scan with your phone's camera to preview live on mobile.",
    embedLabel: "Embed iframe HTML",
    embedCopy: "Copy Embed Code",
    embedCopied: "Copied Embed Code",
    privacy: "Only this app is shared — your chat stays private.",
    errorIncomplete:
      "This site is incomplete: {errors}. Ask Corez to fix it before publishing.",
    errorR2:
      "Publishing failed: R2 storage is not configured on the hosted service — contact support.",
    errorWith: "Publishing failed: {error}",
    errorUnavailable:
      "Publishing failed. The hosted service may be unavailable — try again.",
    errorRetry: "Publishing failed. Please try again.",
  },

  // Secure game preview shell (sandbox status bar and error overlay).
  game: {
    loadingAssets: "Loading Game Assets ({progress}%)...",
    ready: "Game Ready to Play",
    over: "Game Over ",
    overWithScore: "Game Over - Score: {score}",
    sandbox: "Secure Game Sandbox",
    restart: "Restart",
    restartTitle: "Restart Game",
    iframeTitle: "COREZ Secure Game Sandbox",
    errorTitle: "Runtime Game Error",
    retry: "Retry Game",
    runtimeError: "An error occurred inside the game runtime.",
  },

  // Top-level error boundary fallback.
  errorBoundary: {
    title: "Something went wrong",
    detail: "An unexpected error occurred.",
    reload: "Reload Application",
  },
};
