// Arabic dictionary — mirror of src/i18n/en/settings.js.
export default {
  // Language control (Settings → General). The labels themselves are always
  // shown in their own language, so they are not translated.
  languageSection: "اللغة",
  language: "لغة الواجهة",
  languageHint: "اختيار العربية يحوّل الواجهة بالكامل إلى الاتجاه من اليمين إلى اليسار.",

  // Dialog chrome shared by every category.
  dialog: {
    close: "إغلاق الإعدادات",
  },

  // The category tabs.
  tabs: {
    general: "عام",
    billing: "الفواتير",
    publishing: "النشر",
    privacy: "الخصوصية",
    label: "فئات الإعدادات",
  },

  general: {
    account: "الحساب",
    signedIn: "مسجّل الدخول إلى Corez",
    appearance: "المظهر",
    switchToLightMode: "تبديل إلى الوضع الفاتح",
    switchToDarkMode: "تبديل إلى الوضع الداكن",
    lightMode: "الوضع الفاتح",
    darkMode: "الوضع الداكن",
    switchToLight: "بدّل إلى الوضع الفاتح",
    switchToDark: "بدّل إلى الوضع الداكن",
  },

  billing: {
    title: "الخطة والفواتير",
    addons: "حزم إضافية",
    addonsOneOff: "دفعة واحدة، بعملة AED",
    addonsLede:
      "سعة إضافية تُضاف إلى خطتك وتبقى حتى تستخدمها. كما تغطي الحزمة العمل بعد استنفاد الميزانية الشهرية للخطة.",
    paymentsNotConfigured:
      "لم تُهيَّأ المدفوعات على هذا النشر، لذا لا يمكن شراء الحزم من هنا.",
    buyTitle: "اشترِ {credits} {unit} مقابل {price}",
    notAvailableYet: "غير متاح بعد",
    opening: "جارٍ الفتح…",
    buy: "شراء",
    soon: "قريباً",
    purchaseSettledOne: "اكتملت {count} عملية شراء — أُضيفت النقاط.",
    purchaseSettledOther: "اكتملت {count} عمليات شراء — أُضيفت النقاط.",
    purchaseStartFailed: "تعذّر بدء عملية الشراء.",
    checkoutLinkMissing:
      "لم تُرجع صفحة الدفع رابط إتمام الشراء. لم يُخصم أي مبلغ — يرجى المحاولة مرة أخرى.",
    usageTitle: "الاستخدام هذا الشهر",
    metricUsed: "استخدام {metric}",
    resets: "يتجدد في {date}",
    notMetered:
      "لا يتم قياس الاستخدام على هذا النشر، لذا لا توجد حدود.",
    unlimited: " بلا حدود",
    limitSuffix: " من {limit}",
    limitUsed: "لقد استنفدت أحد حدود هذه الخطة.",
    limitNear: "أنت قريب من أحد حدود هذه الخطة.",
    buyPack: "اشترِ {credits} {unit}",
    comparePlans: "مقارنة الخطط",
    planExpired: "{plan} (منتهية)",
    planScheduled: "{plan} (مجدولة)",
    downgradeScheduled:
      "مجدول التخفيض إلى {plan} في {date} — وستحتفظ بـ{current} حتى ذلك الحين",
    freeForever: "مجاني للأبد — ترقية في أي وقت",
    expiredOn: "انتهت في {date} — جدّد للاستمرار",
    renewsOn: "يتجدد في {date} • شهرياً عبر Ziina",
    monthlyCancel: "شهرياً عبر Ziina • إلغاء في أي وقت",
    badgeExpired: "منتهية",
    badgeScheduled: "مجدولة",
    badgeActive: "نشطة",
    keepPlan: "الاحتفاظ بـ{plan}",
    confirmKeep: "هل تريد الاحتفاظ بالخطة الحالية؟ سيُلغى التخفيض المجدول.",
    downgradeIntro: "سيتم تخفيض الخطة إلى ",
    downgradeOn: " بتاريخ {date}",
    downgradeCanceled: "أُلغي التخفيض المجدول — سيتم الاحتفاظ بـ{plan}",
    failed: "فشل",
    managePlan: "إدارة الخطة",
    managePlanLabel: "إدارة الخطة — الانتقال إلى صفحة الأسعار",
    manageSub: "عرض الأسعار • ترقية أو تخفيض الخطة • شهرياً عبر Ziina",
    viewPricing: "عرض الأسعار",
  },

  publishing: {
    title: "الصفحات المنشورة",
    lede: "كل ما نشرته على رابط عام. إزالة أي صفحة تُوقف الرابط فوراً — ويبقى الإنشاء في محادثته.",
    checking: "جارٍ التحقق من صفحاتك المنشورة…",
    tryAgain: "حاول مرة أخرى",
    empty: "لم تنشر شيئاً بعد. انشر من لوحة المعاينة وسيظهر الرابط هنا.",
    openTitle: "فتح corez.pro{url}",
    pagesSuffix: " · {count} صفحات",
    dateSuffix: " · بتاريخ {date}",
    badgeSuffix: " · يعرض شارة «صُنع باستخدام Corez»",
    removeLabel: "إزالة الصفحة المنشورة {title}",
    removing: "جارٍ الإزالة…",
    remove: "إزالة",
    removeFailed: "تعذّرت إزالة هذه الصفحة.",
    truncated:
      "لديك صفحات منشورة أكثر مما يمكن عرضه دفعة واحدة — الأقدم منها غير معروضة هنا.",
    confirmRemove:
      "إزالة الصفحة المنشورة «{title}»؟\n\nسيتوقف الرابط العام corez.pro{url} عن العمل فوراً. ويبقى الإنشاء نفسه في محادثته.",
  },

  privacy: {
    title: "الخصوصية وملفات تعريف الارتباط",
    openPreferences: "فتح تفضيلات ملفات تعريف الارتباط",
    cookieSettings: "إعدادات ملفات تعريف الارتباط",
    changeAllowed: "تغيير ما هو مسموح",
    privacyPolicy: "سياسة الخصوصية",
    terms: "الشروط",
    cookies: "ملفات تعريف الارتباط",
    refunds: "الاسترداد",
  },

  footer: {
    clearHistory: "مسح السجل",
    logOut: "تسجيل الخروج",
  },
};
