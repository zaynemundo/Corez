// English dictionary — settings dialog. Add keys here when translating
// src/components/SettingsModal.jsx. Addressed as `settings.<key>`.
export default {
  // Language control (Settings → General). The labels themselves are always
  // shown in their own language, so they are not translated.
  languageSection: "Language",
  language: "Interface language",
  languageHint: "Arabic switches the whole interface to right-to-left.",

  // Dialog chrome shared by every category.
  dialog: {
    close: "Close settings",
  },

  // The category tabs.
  tabs: {
    general: "General",
    billing: "Billing",
    publishing: "Publishing",
    privacy: "Privacy",
    label: "Settings categories",
  },

  general: {
    account: "Account",
    signedIn: "Signed in to Corez",
    appearance: "Appearance",
    switchToLightMode: "Switch to light mode",
    switchToDarkMode: "Switch to dark mode",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    switchToLight: "Switch to light",
    switchToDark: "Switch to dark",
  },

  billing: {
    title: "Plan & Billing",
    usageTitle: "Usage this month",
    metricUsed: "{metric} used",
    resets: "Resets {date}",
    notMetered:
      "Usage is not metered on this deployment, so nothing is capped.",
    unlimited: " / unlimited",
    limitSuffix: " / {limit}",
    limitUsed: "You have used up a limit on this plan.",
    limitNear: "You are close to a limit on this plan.",
    comparePlans: "Compare plans",
    planExpired: "{plan} (expired)",
    planScheduled: "{plan} (scheduled)",
    downgradeScheduled:
      "Scheduled to downgrade to {plan} on {date} — you keep {current} until then",
    freeForever: "Free forever — upgrade anytime",
    expiredOn: "Expired on {date} — renew to continue",
    renewsOn: "Renews on {date} • Monthly via Ziina",
    monthlyCancel: "Monthly via Ziina • Cancel anytime",
    badgeExpired: "Expired",
    badgeScheduled: "Scheduled",
    badgeActive: "Active",
    keepPlan: "Keep {plan}",
    confirmKeep: "Keep current plan? Cancel scheduled downgrade.",
    // Split around the emphasised plan name in the component.
    downgradeIntro: "Will downgrade to ",
    downgradeOn: " on {date}",
    downgradeCanceled: "Scheduled downgrade canceled — keeping {plan}",
    failed: "Failed",
    managePlan: "Manage plan",
    managePlanLabel: "Manage plan — go to pricing page",
    manageSub: "View pricing • Upgrade or downgrade • Monthly via Ziina",
    viewPricing: "View pricing",
  },

  publishing: {
    title: "Published pages",
    lede: "Everything you have published to a public link. Removing a page takes the link offline immediately — the creation stays in its chat.",
    checking: "Checking your published pages…",
    tryAgain: "Try again",
    empty: "Nothing published yet. Publish from the preview pane and the link will appear here.",
    openTitle: "Open corez.pro{url}",
    pagesSuffix: " · {count} pages",
    dateSuffix: " · {date}",
    badgeSuffix: " · shows the Made with Corez badge",
    removeLabel: "Remove published page {title}",
    removing: "Removing…",
    remove: "Remove",
    removeFailed: "Could not remove that page.",
    truncated:
      "You have more published pages than can be listed at once — the oldest are not shown here.",
    confirmRemove:
      "Remove the published page “{title}”?\n\nThe public link corez.pro{url} stops working immediately. The creation itself stays in its chat.",
  },

  privacy: {
    title: "Privacy & Cookies",
    openPreferences: "Open cookie preferences",
    cookieSettings: "Cookie settings",
    changeAllowed: "Change what is allowed",
    privacyPolicy: "Privacy Policy",
    terms: "Terms",
    cookies: "Cookies",
    refunds: "Refunds",
  },

  footer: {
    clearHistory: "Clear history",
    logOut: "Log out",
  },
};
