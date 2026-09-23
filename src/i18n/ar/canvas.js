// Arabic dictionary — mirror of src/i18n/en/canvas.js.
// Live preview canvas and the game/preview shell. The dictionary integrity test
// fails when a key is missing, extra, still in English, or drops a {placeholder}.
export default {
  // Canvas header: view-mode toggle, device selector, action icons and the
  // preview iframe's accessible name.
  header: {
    source: "الشيفرة",
    preview: "معاينة",
    viewSource: "عرض الشيفرة المصدرية",
    backToPreview: "العودة إلى المعاينة",
    desktopView: "عرض شاشة سطح المكتب",
    laptopView: "عرض الحاسوب المحمول (1366 × 768)",
    tableView: "عرض الجهاز اللوحي (768 × 1024)",
    mobileView: "عرض الجوال (375 × 812)",
    reloadPreview: "إعادة تحميل المعاينة",
    copySource: "نسخ الشيفرة المصدرية",
    downloadZip: "تنزيل الموقع (.zip)",
    downloadHtml: "تنزيل ملف .html",
    exportPrint: "تصدير إلى PDF / طباعة",
    toggleFullscreen: "تبديل ملء الشاشة",
    closePreview: "إغلاق المعاينة",
    iframeTitle: "معاينة مباشرة للتطبيق ({device})",
    sourceEditor: "محرر الشيفرة المصدرية",
    device: {
      desktop: "سطح المكتب",
      laptop: "حاسوب محمول",
      tablet: "جهاز لوحي",
      mobile: "جوال",
    },
  },

  // Empty / streaming states in the canvas body.
  empty: {
    building: "تصميم وبناء مباشر…",
    buildingDetail:
      "بث المكوّنات البصرية وتخطيطات الواجهة والمنطق إلى لوحة المعاينة.",
    noApp: "لا يوجد تطبيق نشط قيد التشغيل",
    intro: "اطلب من Corez بناء تطبيق أو اضغط ",
    runPreview: "«تشغيل المعاينة»",
    end: " على أي كتلة شيفرة.",
  },

  // Multi-page completeness banner shown above the preview.
  validation: {
    incomplete: "موقع غير مكتمل",
    publishingBlocked: "النشر متوقف حتى يتم الإصلاح.",
  },

  // Runtime failure banner reported by the preview iframe.
  error: {
    kindCsp: "محظور بواسطة سياسة الأمان",
    kindResource: "فشل تحميل أحد موارد المعاينة",
    kindUnhandledRejection: "رفض Promise غير معالج في المعاينة",
    kindRuntime: "خطأ وقت تشغيل المعاينة",
    messageFallback: "خطأ في المعاينة",
    copied: "تم النسخ ✓",
    dismiss: "تجاهل خطأ المعاينة",
  },

  // Publish flow: header button, share modal (link / QR / embed) and slug form.
  publish: {
    action: "نشر",
    publishing: "جارٍ النشر…",
    shareTitle: "انشر هذا الإنشاء وشارك الرابط",
    modalLabel: "شارك إنشاءك المنشور",
    shareIntro: "يمكن لأي شخص لديه هذا الرابط فتح ",
    shareEnd: ":",
    slugLockedIntro: "مسارات URL المخصصة متاحة في الخطتين القياسية والمميزة. ",
    slugLockedCta: "ترقية",
    slugLockedEnd: " لاختيار رابط مخصص.",
    badge:
      "الخطة المجانية: تعرض صفحتك المنشورة شارة صغيرة «صُنع باستخدام Corez». قم بالترقية ثم أعد النشر لإزالتها.",
    upgrade: "ترقية",
    tabLink: "رابط المشاركة",
    tabQr: "رمز QR",
    tabEmbed: "شيفرة التضمين",
    shareLinkLabel: "رابط المشاركة المنشور",
    copyLinkTitle: "نسخ الرابط",
    openNewTab: "فتح في تبويب جديد",
    slugLocked: "مسار URL المخصص مقفل (استُخدم التغيير لمرة واحدة)",
    slugLockedDetail: "إعادة النشر تحدّث هذا الرابط تلقائياً.",
    slugLabel: "تخصيص مسار URL:",
    slugOneTime: "تغيير لمرة واحدة",
    slugAriaLabel: "مسار URL مخصص",
    saveSlug: "حفظ المسار",
    slugUpgrade: "مسارات URL المخصصة متاحة في الخطتين القياسية والمميزة.",
    slugInvalid:
      "يجب أن يتكوّن المسار من 3 إلى 50 حرفاً بأحرف صغيرة وأرقام وشرطات مفردة.",
    slugUpdated: "تم تحديث الرابط بنجاح!",
    slugTaken: "المسار مستخدم بالفعل أو غير متاح. جرّب مساراً آخر.",
    slugFailed: "فشل تحديث المسار. يرجى المحاولة مرة أخرى.",
    qrAlt: "رمز QR يشير إلى {url}",
    qrScan: "امسح الرمز بكاميرا هاتفك لمعاينة مباشرة على الجوال.",
    embedLabel: "شيفرة HTML لتضمين iframe",
    embedCopy: "نسخ شيفرة التضمين",
    embedCopied: "تم نسخ شيفرة التضمين",
    privacy: "يُشارك هذا التطبيق فقط — وتبقى محادثتك خاصة.",
    errorIncomplete:
      "هذا الموقع غير مكتمل: {errors}. اطلب من Corez إصلاحه قبل النشر.",
    errorR2:
      "فشل النشر: مساحة R2 غير مهيأة على الخدمة المستضافة — تواصل مع الدعم.",
    errorWith: "فشل النشر: {error}",
    errorUnavailable:
      "فشل النشر. قد تكون الخدمة المستضافة غير متاحة — حاول مرة أخرى.",
    errorRetry: "فشل النشر. يرجى المحاولة مرة أخرى.",
  },

  // Secure game preview shell (sandbox status bar and error overlay).
  game: {
    loadingAssets: "جارٍ تحميل موارد اللعبة ({progress}%)…",
    ready: "اللعبة جاهزة للعب",
    over: "انتهت اللعبة ",
    overWithScore: "انتهت اللعبة - النتيجة: {score}",
    sandbox: "بيئة لعب آمنة ومعزولة",
    restart: "إعادة التشغيل",
    restartTitle: "إعادة تشغيل اللعبة",
    iframeTitle: "بيئة لعب آمنة ومعزولة من COREZ",
    errorTitle: "خطأ في وقت تشغيل اللعبة",
    retry: "إعادة محاولة اللعبة",
    runtimeError: "حدث خطأ داخل بيئة تشغيل اللعبة.",
  },

  // Top-level error boundary fallback.
  errorBoundary: {
    title: "حدث خطأ ما",
    detail: "حدث خطأ غير متوقع.",
    reload: "إعادة تحميل التطبيق",
  },
};
