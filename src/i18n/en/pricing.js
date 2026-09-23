// English dictionary — pricing page and plan copy. Add keys here when
// translating src/pages/Pricing.jsx. Addressed as `pricing.<key>`.
export default {
  // Page chrome: navigation, hero, billing toggle, cards, footer.
  page: {
    backToCorez: "Back to Corez",
    signIn: "Sign in",
    title: "Plans that grow with you",
    subtitle:
      "Start free, upgrade when you need more. All plans include live preview, one-click publish and monthly billing via Ziina. Cancel anytime.",
    billingInterval: "Billing interval",
    monthly: "Monthly",
    yearly: "Yearly",
    saveYearly: "Save 20%",
    periodEnd: "period end",
    mostPopular: "Most popular",
    current: "Current",
    currentPlan: "Current plan",
    scheduled: "Scheduled",
    downgrade: "Downgrade",
    processing: "Processing…",
    billedYearly: "Billed yearly • {amount} AED / year",
    secureCheckout: "Secure checkout via Ziina •",
    monthlyCancel: "Monthly • Cancel anytime",
    continuePayment: "Continue payment",
    keepPlan: "Keep {plan}",
    privacyPolicy: "Privacy Policy",
    terms: "Terms & Conditions",
    cookiePolicy: "Cookie Policy",
    refundPolicy: "Refund Policy",
    cookieSettings: "Cookie settings",
  },

  // Banners that a signed-in account sees while a checkout is unfinished or a
  // downgrade is scheduled. The sentences are split around the emphasised plan
  // names in the component, so each fragment stays a complete phrase and the
  // reading order is identical in both languages.
  pending: {
    intro: "An unfinished ",
    middle: " checkout is waiting — you still have ",
    end: " until you complete or cancel it.",
  },

  scheduled: {
    intro: "Scheduled to downgrade to ",
    on: " on ",
    end: " — you keep ",
    until: " until then.",
  },

  // Plan names, descriptions, features and CTAs. Shared feature copy lives in
  // `features` so the same English string has one key.
  plans: {
    intervalForever: "forever",
    intervalMonth: "/ month",
    free: {
      name: "Free",
      desc: "Perfect to explore Corez",
      cta: "Start for free",
      generations: "20 generations / month",
      projects: "1 project",
      badge: "Publish with a Made with Corez badge",
      support: "Community support",
    },
    standard: {
      name: "Standard",
      desc: "Most popular for creators",
      cta: "Upgrade to Standard",
      generations: "200 generations / month",
      projects: "10 projects",
      priorityQueue: "Priority queue",
      support: "Standard support",
    },
    premium: {
      name: "Premium",
      desc: "Full power for pros",
      cta: "Go Premium",
      generations: "Unlimited generations",
      projects: "Unlimited projects",
      prioritySupport: "Priority support",
      earlyAccess: "Early access to new models",
      customDomains: "Custom domains (soon)",
    },
    features: {
      badgeFree: "Badge-free publishing",
      customSlug: "Custom URL slug",
    },
  },

  // Browser confirm/alert copy for checkout, downgrade and cancellation.
  dialogs: {
    downgradeFree:
      "Downgrade to Free? You will keep current plan until period end, then switch to Free.",
    downgrade:
      "Downgrade to {target}? You will keep {current} until period end, then switch to {target}.",
    downgradeScheduled: "Scheduled to downgrade to {target} after current period",
    downgradeFailed: "Failed to schedule downgrade",
    paymentFound: "Payment found completed — {plan} activated",
    checkoutFailed: "Checkout failed",
    paymentVerified: "Payment verified — plan activated",
    checkoutUnavailable:
      "This checkout is no longer available — please try again.",
    resumeFailed: "Could not resume payment",
    cancelPending:
      "Cancel this pending payment? Your current plan stays unchanged.",
    paymentCompleted: "Payment had completed on Ziina — plan activated.",
    cancelPendingFailed: "Failed to cancel pending payment",
    failed: "Failed",
    keepPlan: "Keep current plan? Cancel scheduled downgrade.",
    downgradeCanceled: "Scheduled downgrade canceled — keeping {plan}",
  },
};
