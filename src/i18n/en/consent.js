// English dictionary — cookie consent banner, consent checkbox and the legal
// page chrome (headings and navigation; the policy bodies themselves stay in
// their published language). Addressed as `consent.<key>`.
export default {
  // The fixed banner shown before a decision is recorded.
  banner: {
    regionLabel: "Cookie consent",
    title: "Your choice, not our default",
    preferences: "Preferences",
    acceptAll: "Accept all",
    // The body sentence is split around its two policy links in the component.
    bodyIntro:
      "Strictly necessary storage keeps you signed in. Analytics and external media stay switched off unless you allow them. Read the ",
    cookiePolicy: "Cookie Policy",
    bodyOr: " or the ",
    privacyPolicy: "Privacy Policy",
    bodyEnd: ".",
  },

  // Actions shared by the banner and the preferences dialog.
  actions: {
    rejectNonEssential: "Reject non-essential",
  },

  // Per-category state inside the preferences dialog.
  preferences: {
    alwaysOn: "Always on",
    allowed: "Allowed",
    blocked: "Blocked",
  },

  dialog: {
    title: "Cookie preferences",
    version: "Version {version} · you can change this at any time",
    gpc: "Your browser is sending a Global Privacy Control or Do Not Track signal, so analytics stays off even if you allow it here.",
    footNone: "Only strictly necessary storage will be used.",
    footOne: "{count} optional category allowed.",
    footOther: "{count} optional categories allowed.",
    saved: "Preferences saved.",
    withdraw: "Withdraw consent",
    save: "Save choices",
    // The closing line is split around its policy link in the component.
    footPolicyIntro: " Details are in the ",
    footPolicyLink: "Cookie Policy",
    footPolicyEnd: ".",
  },
};
