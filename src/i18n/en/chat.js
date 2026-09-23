// English dictionary — chat surface: composer, message chrome, attachments,
// message actions. Add keys here when translating src/components/ChatInput.jsx,
// src/components/ChatMessage.jsx, src/components/CompactedBanner.jsx and
// src/components/DropZoneOverlay.jsx. Addressed as `chat.<key>`.
//
// Rules for every dictionary file:
//  - English values must stay byte-identical to the strings that shipped before
//    localisation, because the UI tests assert on them.
//  - Use {placeholders} for values that change; never build sentences by
//    concatenating fragments.
//  - One key per user-visible string; keep the wording stable across releases.
export default {
  // The composer: textarea, send/stop controls and the "@" command menu. The
  // file drop overlay lives here too — it is the drag target for the composer.
  composer: {
    placeholder: "Ask Corez...",
    placeholderStreaming: "Corez is generating...",
    ariaMessage: "Message Corez",
    ariaStreaming: "Corez is generating",
    attachFiles: "Attach files",
    sendMessage: "Send Message",
    imageLoading: "Image still loading...",
    stopGeneration: "Stop Generation",
    commandsLabel: "Commands",
    suggestionLabel: "{label}: {description}",
    commands: {
      website: "Create a website or web page",
      game: "Create a playable game",
      research: "Deep research: multi-item web search + PDF report",
      image: "Generate an AI image or artwork",
    },
    dropZone: {
      label: "Drop files here to attach",
      title: "Drop any file here",
      subtitle:
        "Attach code, images, documents, or data directly to your conversation",
      typeCode: "Code (.js, .py, .html, .css...)",
      typeImages: "Images (.png, .jpg, .svg...)",
      typeText: "Text (.md, .json, .csv...)",
      typeAny: "Any file",
    },
  },

  // Attachment chips in the composer and the attachment row on a sent message.
  attachments: {
    label: "Attached files",
    fileTitle: "{name} ({size})",
    uploading: "(uploading...)",
    loading: "(loading...)",
    remove: "Remove {name}",
    removeTitle: "Remove attachment",
  },

  // Everything the assistant message itself renders: code blocks, images,
  // email cards and the compacted-history banner.
  message: {
    attachedCodeBlock: "Attached code block ({count} lines)",
    code: {
      openPreview: "Open preview",
      openCanvasPreview: "Open Canvas Preview",
      runLive: "Run app live in preview canvas",
      revise: "Revise",
      reviseTitle: "Ask AI to revise this code",
      copyTitle: "Copy code",
    },
    image: {
      viewFullscreen: "View fullscreen",
      viewFullscreenAria: "View fullscreen: {alt}",
      imageFallback: "image",
      fullscreen: "Fullscreen",
      fullscreenPreview: "Fullscreen Image Preview",
      generatedImage: "Generated Image",
      copy: "Copy image",
      copyImage: "Copy Image",
      copied: "Copied Image",
      copiedToClipboard: "Image copied to clipboard",
      copyToClipboard: "Copy image to clipboard",
      download: "Download image",
      exitFullscreen: "Exit fullscreen",
      exitFullscreenTitle: "Exit fullscreen (Esc)",
      exitFullscreenLabel: "Exit Fullscreen",
    },
    email: {
      edit: "Edit email",
      editAction: "Edit",
      cancelEditing: "Cancel editing",
      save: "Save email",
      copy: "Copy email",
      copied: "Email copied",
      recipients: "Recipients",
      subject: "Subject",
      subjectPlaceholder: "Email subject",
      message: "Message",
    },
    compacted: {
      badge: "Compacted {count} messages",
      summaryLine: "{count} earlier messages summarized",
      collapse: "Collapse",
      showFullHistory: "Show full history",
      inSessionOnly: "(in-session only — refresh may lose older content)",
      retrievable: "(retrievable)",
    },
  },

  // The response action bar under an assistant message.
  actions: {
    label: "Message actions",
    copyResponse: "Copy response",
    responseCopied: "Response copied",
    rateResponse: "Rate response",
    changeRating: "Change rating",
    rateThisResponse: "Rate this response",
    goodResponse: "Good response",
    badResponse: "Bad response",
    goodResponseChange: "Good response (click to change)",
    badResponseChange: "Bad response (click to change)",
    shareResponse: "Share response",
    shareTitle: "COREZ AI Response",
  },
};
