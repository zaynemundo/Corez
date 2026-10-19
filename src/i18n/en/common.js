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
    responding: "Corez is responding",
    untitledApplication: "Untitled Application",
  },

  // The new-chat screen: the wordmark and the question above the composer, and
  // the command grid under it. Each cell inserts one of CoreZ's own commands
  // (@website, @game, @image, @research) — real tokens rather than borrowed
  // sample sentences, so the grid teaches the product's actual vocabulary.
  newChat: {
    title: "What are we building today?",
    startersLabel: "Corez commands",
    starterWebsite: "Build an app or website",
    starterGame: "Create a game",
    starterImage: "Generate an image",
    starterResearch: "Research a topic",
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

  // Live reasoning panel: the model's thinking streams here before the answer
  // starts, so a long generation shows progress instead of only a spinner.
  thinking: {
    label: "Thinking",
    // Live status shown while the model works but has not streamed any
    // reasoning yet. It is replaced by the reasoning itself the moment the
    // first thinking event arrives.
    working: "Working…",
    // Shown on a finished message once the thinking duration is known. The
    // panel renders only when the gateway returns real reasoning — there is
    // no placeholder text when it does not.
    thoughtForSeconds: "Thought for {seconds}s",
  },

  sidebar: {
    collapse: "Collapse Sidebar",
    newChat: "New Chat",
    newChatTitle: "New Chat Session",
    pinned: "Pinned",
    collapsePinned: "Collapse pinned",
    expandPinned: "Expand pinned",
    pin: "Pin",
    unpin: "Unpin",
    projects: "Projects",
    newProject: "New Project",
    collapseProjects: "Collapse projects",
    expandProjects: "Expand projects",
    projectNamePlaceholder: "Project name",
    projectOptions: "Project options",
    optionsForProject: "Options for project {name}",
    openProject: "Open project {name}",
    renameProject: "Rename",
    deleteProject: "Delete",
    moveToProject: "Move to project",
    noProject: "No project",
    newChatInProject: "New chat in {name}",
    emptyProject: "No chats yet",
    chats: "Recents",
    collapseChats: "Collapse chats",
    expandChats: "Expand chats",
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
