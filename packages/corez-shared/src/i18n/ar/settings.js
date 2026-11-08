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

  // فئات التبويبات. كانت الصفحات المنشورة فئة («النشر») هنا؛ أصبحت لها شاشة
  // المواقع الآن، فلا شيء يُضبط في الإعدادات وحُذفت مفاتيحها مع التبويب.
  tabs: {
    general: "عام",
    billing: "الفواتير",
    privacy: "الخصوصية",
    label: "فئات الإعدادات",
  },

  general: {
    account: "الحساب",
    signedIn: "مسجّل الدخول إلى Corez",
    appearance: "المظهر",
    lightMode: "الوضع الفاتح",
    darkMode: "الوضع الداكن",
  },

  // قائمة المظهر (الإعدادات → عام). صفّا الوضع الفاتح والداكن والسمات المخصصة
  // المحفوظة مجموعة واحدة، وتُنشأ السمات المخصصة من المحادثة.
  theme: {
    label: "السمة",
    customBadge: "مخصصة",
    createHint: "أنشئ سمتك الخاصة: اكتب @theme في المحادثة.",
    limitHint: "{used} من {max} سمات مخصصة — احذف واحدة لإفساح المجال.",
    deleteLabel: "حذف {name}",
    confirmDelete: "هل تريد حذف السمة {name}؟ لا يمكن التراجع عن ذلك.",
    deleteFailed: "تعذّر حذف السمة. حاول مرة أخرى.",
  },

  billing: {
    title: "الخطة والفواتير",
    usageTitle: "الاستخدام هذا الشهر",
    metricUsed: "استخدام {metric}",
    resets: "يتجدد في {date}",
    notMetered:
      "لا يتم قياس الاستخدام على هذا النشر، لذا لا توجد حدود.",
    unlimited: " بلا حدود",
    limitSuffix: " من {limit}",
    limitUsed: "لقد استنفدت أحد حدود هذه الخطة.",
    limitNear: "أنت قريب من أحد حدود هذه الخطة.",
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
