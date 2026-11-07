// Arabic dictionary — account pages: sign in, sign up, password reset and the
// payment status screens. Mirror of src/i18n/en/auth.js; the dictionary
// integrity test fails when a key is missing, extra, still in English, or drops
// a {placeholder}. Addressed as `auth.<key>`.
export default {
  // Labels, placeholders, toggles and policy links shared by every auth mode.
  common: {
    emailLabel: "البريد الإلكتروني",
    passwordLabel: "كلمة المرور",
    newPasswordLabel: "كلمة مرور جديدة",
    emailPlaceholder: "name@corez.pro",
    passwordPlaceholder: "••••••••",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    login: "تسجيل الدخول",
    signUpTab: "إنشاء حساب",
    pleaseWait: "يرجى الانتظار…",
    backToLogin: "العودة إلى تسجيل الدخول",
    authenticationModes: "أوضاع المصادقة",
    policiesNav: "السياسات وإعدادات ملفات تعريف الارتباط",
    privacyPolicy: "سياسة الخصوصية",
    terms: "الشروط",
    cookies: "ملفات تعريف الارتباط",
    refunds: "الاسترداد",
    cookieSettings: "إعدادات ملفات تعريف الارتباط",
  },

  login: {
    subtitle: "سجّل الدخول إلى حسابك",
    forgotPassword: "هل نسيت كلمة المرور؟",
    noAccount: "ليس لديك حساب؟ ",
    signUpLink: "أنشئ حساباً",
    legalNote: "Corez مبني على بضعة وعود يمكنك قراءتها كاملة.",
  },

  signup: {
    subtitle: "أنشئ حسابك",
    submit: "إنشاء حساب",
    alreadyHaveAccount: "لديك حساب بالفعل؟ ",
    consentError:
      "يرجى قبول الشروط والأحكام وسياسة الخصوصية لإنشاء حساب.",
    legalNote: "بإنشاء حساب فإنك توافق على سياساتنا أدناه.",
    consentIntro: "أُقرّ بأن عمري 16 عاماً أو أكثر وأوافق على ",
    consentTerms: "الشروط والأحكام",
    consentAnd: " و",
    consentPrivacy: "سياسة الخصوصية",
    consentEnd: ".",
  },

  forgot: {
    subtitle: "إعادة تعيين كلمة المرور",
    submit: "إرسال رابط إعادة التعيين",
    sent: "إذا كان هذا البريد الإلكتروني موجوداً، فقد أُرسل رابط إعادة التعيين.",
    remembered: "تذكرت كلمة المرور؟",
    resend: "إعادة إرسال البريد",
  },

  reset: {
    subtitle: "تعيين كلمة مرور جديدة",
    submit: "إعادة تعيين كلمة المرور",
    success: "تمت إعادة تعيين كلمة المرور. يمكنك الآن تسجيل الدخول.",
  },

  // Payment status screen shown after a Ziina checkout.
  status: {
    brandPayment: "Corez — الدفع",
    verifying: "جارٍ التحقق من الدفع…",
    success: "تم الدفع بنجاح ✓",
    issue: "مشكلة في الدفع",
    checking: "جارٍ التحقق من اشتراكك…",
    verifyFailedSupport: "فشل التحقق. يرجى التواصل مع الدعم.",
    verifyFailed: "فشل التحقق",
    planYearly:
      "تم التحقق — خطة {plan} مفعّلة. {amount} AED / سنة. سارية حتى {end}.",
    planMonthly:
      "تم التحقق — خطة {plan} مفعّلة. {amount} AED / شهر. تتجدد في {end}.",
    paymentStatus:
      "حالة الدفع: {status}. يرجى إكمال الدفع عبر Ziina والمحاولة مرة أخرى.",
    yearFromNow: "بعد 365 يوماً من الآن",
    monthFromNow: "بعد 30 يوماً من الآن",
    goToCorez: "الانتقال إلى Corez",
    refresh: "تحديث",
    footerNote:
      "القياسي 18.36 AED / شهر • المميز 27.54 AED / شهر • فواتير شهرية عبر Ziina • إلغاء في أي وقت",
  },
};
