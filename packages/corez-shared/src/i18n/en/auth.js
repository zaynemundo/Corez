// English dictionary — account pages: sign in, sign up, password reset and the
// payment status screens. Add keys here when translating src/pages/Login.jsx and
// src/pages/PaymentStatus.jsx. Addressed as `auth.<key>`.
export default {
  // Labels, placeholders, toggles and policy links shared by every auth mode.
  common: {
    emailLabel: "Email",
    passwordLabel: "Password",
    newPasswordLabel: "New Password",
    emailPlaceholder: "you@corez.pro",
    passwordPlaceholder: "••••••••",
    showPassword: "Show password",
    hidePassword: "Hide password",
    login: "Login",
    signUpTab: "Sign Up",
    pleaseWait: "Please wait…",
    backToLogin: "Back to login",
    authenticationModes: "Authentication modes",
    policiesNav: "Policies and cookie settings",
    privacyPolicy: "Privacy Policy",
    terms: "Terms",
    cookies: "Cookies",
    refunds: "Refunds",
    cookieSettings: "Cookie settings",
  },

  login: {
    subtitle: "Sign in to your account",
    forgotPassword: "Forgot password?",
    noAccount: "Don't have an account? ",
    signUpLink: "Sign up",
    legalNote: "Corez is built on a few promises you can read in full.",
  },

  signup: {
    subtitle: "Create your account",
    submit: "Create Account",
    alreadyHaveAccount: "Already have an account? ",
    consentError:
      "Please accept the Terms and Conditions and the Privacy Policy to create an account.",
    legalNote: "By creating an account you agree to our policies below.",
    // The consent sentence is split around its two policy links in the
    // component; each fragment is a complete phrase.
    consentIntro: "I am 16 or older and I accept the ",
    consentTerms: "Terms and Conditions",
    consentAnd: " and the ",
    consentPrivacy: "Privacy Policy",
    consentEnd: ".",
  },

  forgot: {
    subtitle: "Reset your password",
    submit: "Send reset link",
    sent: "If that email exists, a reset link has been sent.",
    remembered: "Remembered?",
    resend: "Resend email",
  },

  reset: {
    subtitle: "Set a new password",
    submit: "Reset password",
    success: "Password has been reset. You can now login.",
  },

  // Payment status screen shown after a Ziina checkout.
  status: {
    brandPayment: "Corez — Payment",
    verifying: "Verifying payment…",
    success: "Payment successful ✓",
    issue: "Payment issue",
    checking: "Checking your subscription…",
    verifyFailedSupport: "Verification failed. Please contact support.",
    verifyFailed: "Verification failed",
    planYearly:
      "Verified — {plan} active. {amount} AED / year. Valid until {end}.",
    planMonthly:
      "Verified — {plan} active. {amount} AED / month. Renews on {end}.",
    paymentStatus:
      "Payment status: {status}. Please complete payment on Ziina and try again.",
    yearFromNow: "365 days from now",
    monthFromNow: "30 days from now",
    goToCorez: "Go to Corez",
    refresh: "Refresh",
    footerNote:
      "Standard 18.36 AED / month • Premium 27.54 AED / month • Billed monthly via Ziina • Cancel anytime",
  },
};
