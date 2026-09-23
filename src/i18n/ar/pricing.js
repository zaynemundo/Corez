// Arabic dictionary — pricing page and plan copy. Mirror of
// src/i18n/en/pricing.js; the dictionary integrity test fails when a key is
// missing, extra, still in English, or drops a {placeholder}. Addressed as
// `pricing.<key>`.
export default {
  // Page chrome: navigation, hero, billing toggle, cards, footer.
  page: {
    backToCorez: "العودة إلى Corez",
    signIn: "تسجيل الدخول",
    title: "خطط تنمو معك",
    subtitle:
      "ابدأ مجاناً، وارتقِ عندما تحتاج إلى المزيد. تشمل جميع الخطط المعاينة المباشرة والنشر بنقرة واحدة وفواتير شهرية عبر Ziina. إلغاء في أي وقت.",
    billingInterval: "دورة الفواتير",
    monthly: "شهري",
    yearly: "سنوي",
    saveYearly: "وفّر 20%",
    periodEnd: "نهاية الفترة",
    mostPopular: "الأكثر شعبية",
    current: "الحالية",
    currentPlan: "الخطة الحالية",
    scheduled: "مجدول",
    downgrade: "تخفيض الخطة",
    processing: "جارٍ المعالجة…",
    billedYearly: "فواتير سنوية • {amount} AED / سنة",
    secureCheckout: "دفع آمن عبر Ziina •",
    monthlyCancel: "شهري • إلغاء في أي وقت",
    continuePayment: "متابعة الدفع",
    keepPlan: "الاحتفاظ بـ{plan}",
    privacyPolicy: "سياسة الخصوصية",
    terms: "الشروط والأحكام",
    cookiePolicy: "سياسة ملفات تعريف الارتباط",
    refundPolicy: "سياسة الاسترداد",
    cookieSettings: "إعدادات ملفات تعريف الارتباط",
  },

  // Banners for an unfinished checkout or a scheduled downgrade. The sentence is
  // split around the emphasised plan names in the component; the order of the
  // fragments matches the English so the sentence reads naturally in both.
  pending: {
    intro: "لم تكتمل عملية دفع لخطة ",
    middle: " — وما زلت على خطة ",
    end: " حتى تُكملها أو تُلغيها.",
  },

  scheduled: {
    intro: "من المقرر تخفيض الخطة إلى ",
    on: " بتاريخ ",
    end: " — وتبقى على خطة ",
    until: " حتى ذلك الحين.",
  },

  // Plan names, descriptions, features and CTAs. Shared feature copy lives in
  // `features` so the same English string has one key.
  plans: {
    intervalForever: "للأبد",
    intervalMonth: "/ شهر",
    free: {
      name: "مجاني",
      desc: "مثالية لاستكشاف Corez",
      cta: "ابدأ مجاناً",
      generations: "20 عملية توليد / شهر",
      projects: "مشروع واحد",
      badge: "النشر مع شارة «صُنع باستخدام Corez»",
      support: "دعم المجتمع",
    },
    standard: {
      name: "القياسي",
      desc: "الأكثر شعبية بين المبدعين",
      cta: "الترقية إلى القياسي",
      generations: "200 عملية توليد / شهر",
      projects: "10 مشاريع",
      priorityQueue: "أولوية في قائمة الانتظار",
      support: "دعم الخطة القياسية",
    },
    premium: {
      name: "المميز",
      desc: "قوة كاملة للمحترفين",
      cta: "انتقل إلى المميز",
      generations: "عمليات توليد غير محدودة",
      projects: "مشاريع غير محدودة",
      prioritySupport: "دعم ذو أولوية",
      earlyAccess: "وصول مبكر إلى النماذج الجديدة",
      customDomains: "نطاقات مخصصة (قريباً)",
    },
    features: {
      badgeFree: "النشر بدون شارة",
      customSlug: "مسار URL مخصص",
    },
  },

  // Browser confirm/alert copy for checkout, downgrade and cancellation.
  dialogs: {
    downgradeFree:
      "هل تريد التخفيض إلى الخطة المجانية؟ ستحتفظ بخطتك الحالية حتى نهاية الفترة، ثم تنتقل إلى الخطة المجانية.",
    downgrade:
      "هل تريد التخفيض إلى {target}؟ ستحتفظ بـ{current} حتى نهاية الفترة، ثم تنتقل إلى {target}.",
    downgradeScheduled: "مجدول التخفيض إلى {target} بعد الفترة الحالية",
    downgradeFailed: "فشل جدولة التخفيض",
    paymentFound: "تم العثور على دفعة مكتملة — تم تفعيل {plan}",
    checkoutFailed: "فشل إتمام الدفع",
    paymentVerified: "تم التحقق من الدفع — تم تفعيل الخطة",
    checkoutUnavailable:
      "لم تعد عملية الدفع هذه متاحة — يرجى المحاولة مرة أخرى.",
    resumeFailed: "تعذّر استئناف الدفع",
    cancelPending:
      "هل تريد إلغاء هذه الدفعة المعلّقة؟ ستبقى خطتك الحالية دون تغيير.",
    paymentCompleted: "اكتمل الدفع على Ziina — تم تفعيل الخطة.",
    cancelPendingFailed: "فشل إلغاء الدفعة المعلّقة",
    failed: "فشل",
    keepPlan: "هل تريد الاحتفاظ بالخطة الحالية؟ سيُلغى التخفيض المجدول.",
    downgradeCanceled: "أُلغي التخفيض المجدول — سيتم الاحتفاظ بـ{plan}",
  },
};
