// English dictionary — app shell, sidebar and everything shared by more than
// one screen. Addressed as `common.<key>`, with one grouping object per area of
// the shell.
//
// Rules for every dictionary file:
//  - English values must stay byte-identical to the strings that shipped before
//    localisation, because the UI tests assert on them.
//  - Use {placeholders} for values that change; never build sentences by
//    concatenating fragments.
//  - One key per user-visible string; keep the wording stable across releases.
export default {
  shell: {
    closeSidebar: "Close sidebar",
    openSidebar: "Open Sidebar",
    streamingElsewhere: "Response streaming in another chat",
    respondingIn: "Responding in “{title}”…",
    anotherChat: "another chat",
    view: "View",
    startNewConversation: "Start a new conversation",
    responding: "Corez is responding",
    untitledApplication: "Untitled Application",
    expandStream: "Click to expand response stream",
    collapseStream: "Click to collapse response stream",
    expandResponse: "Expand response",
    collapseResponse: "Collapse response",
  },

  // Announced by the thinking indicator's live region while a build runs.
  phase: {
    planning: "Planning the build…",
    swarmPlanning: "Swarm planning…",
    building: "Building…",
    continuing: "Continuing the file…",
    verifying: "Verifying…",
    repairing: "Fixing what verification found…",
    reviewing: "Reviewing the result…",
    resuming: "Reconnecting — resuming your build…",
    waitingForBuild: "Your build is still running…",
    retrying: "The AI service is busy — retrying…",
    done: "Done.",
  },

  sidebar: {
    collapse: "Collapse Sidebar",
    newChat: "New Chat",
    newChatTitle: "New Chat Session",
    chats: "Chats",
    chatOptions: "Chat options",
    optionsFor: "Options for {title}",
    openConversation: "Open conversation {title}",
    delete: "Delete",
    openSettings: "Open settings",
    settings: "Settings",
    guest: "Guest",
  },

  // Actions and status text shared by several screens (buttons, toasts).
  action: {
    copy: "Copy",
    copied: "Copied",
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    retry: "Retry",
    download: "Download",
    dismiss: "Dismiss",
    open: "Open",
  },

  // Click-to-load third-party embeds (used inside chat messages).
  embed: {
    notAllowed: "This embed is not from an allowed provider, so it was not loaded.",
    cookieNotice:
      "Loading this {provider} embed would let {provider} set cookies and see your IP address. It stays blocked until you choose to load it.",
    load: "Load embed",
    alwaysAllow: "Always allow embeds",
  },

  status: {
    loading: "Loading…",
    loadingCorez: "Loading Corez…",
    sessionFailedTitle: "We couldn't check your session",
    sessionFailedBody:
      "Corez could not reach the server, so it doesn't know whether you are signed in. Nothing was lost — try again.",
  },

  error: {
    generic: "Something went wrong. Please try again.",
  },
};
