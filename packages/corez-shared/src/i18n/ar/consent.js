// Arabic dictionary — mirror of src/i18n/en/consent.js.
export default {
  // The fixed banner shown before a decision is recorded.
  banner: {
    regionLabel: "الموافقة على ملفات تعريف الارتباط",
    title: "اختيارك أنت، لا الافتراضي",
    preferences: "التفضيلات",
    acceptAll: "قبول الكل",
    bodyIntro:
      "يحافظ التخزين الضروري للغاية على تسجيل دخولك. تبقى التحليلات والوسائط الخارجية معطّلة ما لم تسمح بها. اقرأ ",
    cookiePolicy: "سياسة ملفات تعريف الارتباط",
    bodyOr: " أو ",
    privacyPolicy: "سياسة الخصوصية",
    bodyEnd: ".",
  },

  // Actions shared by the banner and the preferences dialog.
  actions: {
    rejectNonEssential: "رفض غير الضروري",
  },

  // Per-category state inside the preferences dialog.
  preferences: {
    alwaysOn: "مفعّل دائماً",
    allowed: "مسموح",
    blocked: "محظور",
  },

  dialog: {
    title: "تفضيلات ملفات تعريف الارتباط",
    version: "الإصدار {version} · يمكنك تغيير هذا في أي وقت",
    gpc: "يرسل متصفحك إشارة التحكم العالمي بالخصوصية أو عدم التتبع، لذا تبقى التحليلات معطّلة حتى لو سمحت بها هنا.",
    footNone: "لن يُستخدم سوى التخزين الضروري للغاية.",
    footOne: "{count} فئة اختيارية مسموح بها.",
    footOther: "{count} فئات اختيارية مسموح بها.",
    saved: "تم حفظ التفضيلات.",
    withdraw: "سحب الموافقة",
    save: "حفظ الخيارات",
    footPolicyIntro: " التفاصيل في ",
    footPolicyLink: "سياسة ملفات تعريف الارتباط",
    footPolicyEnd: ".",
  },
};
