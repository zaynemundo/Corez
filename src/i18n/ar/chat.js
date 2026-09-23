// Arabic dictionary — mirror of src/i18n/en/chat.js.
// Terminology follows docs/i18n-arabic-glossary.md: محادثة، معاينة، اللوحة،
// الشيفرة، نسخ، حفظ، حذف.
export default {
  // The composer: textarea, send/stop controls and the "@" command menu.
  composer: {
    placeholder: "اسأل Corez…",
    placeholderStreaming: "Corez يولّد الآن…",
    ariaMessage: "رسالة إلى Corez",
    ariaStreaming: "Corez يولّد الآن",
    attachFiles: "إرفاق ملفات",
    sendMessage: "إرسال رسالة",
    imageLoading: "الصورة قيد التحميل…",
    stopGeneration: "إيقاف التوليد",
    commandsLabel: "الأوامر",
    suggestionLabel: "{label} — {description}",
    commands: {
      website: "إنشاء موقع أو صفحة ويب",
      game: "إنشاء لعبة قابلة للعب",
      research: "بحث معمّق: بحث ويب متعدد النتائج + تقرير PDF",
      image: "توليد صورة أو عمل فني بالذكاء الاصطناعي",
    },
    dropZone: {
      label: "أفلت الملفات هنا لإرفاقها",
      title: "أفلت أي ملف هنا",
      subtitle:
        "أرفق الشيفرة أو الصور أو المستندات أو البيانات مباشرة بمحادثتك",
      typeCode: "الشيفرة (.js، .py، .html، .css…)",
      typeImages: "الصور (.png، .jpg، .svg…)",
      typeText: "النصوص (.md، .json، .csv…)",
      typeAny: "أي ملف",
    },
  },

  // Attachment chips in the composer and the attachment row on a sent message.
  attachments: {
    label: "الملفات المرفقة",
    fileTitle: "{name} — {size}",
    uploading: "(جارٍ الرفع…)",
    loading: "(جارٍ التحميل…)",
    remove: "إزالة {name}",
    removeTitle: "إزالة المرفق",
  },

  // Everything the assistant message itself renders.
  message: {
    attachedCodeBlock: "كتلة شيفرة مرفقة ({count} من الأسطر)",
    code: {
      openPreview: "فتح المعاينة",
      openCanvasPreview: "فتح معاينة اللوحة",
      runLive: "تشغيل التطبيق مباشرة في لوحة المعاينة",
      revise: "تحسين",
      reviseTitle: "اطلب من الذكاء الاصطناعي تحسين هذه الشيفرة",
      copyTitle: "نسخ الشيفرة",
    },
    image: {
      viewFullscreen: "عرض بملء الشاشة",
      viewFullscreenAria: "عرض بملء الشاشة: {alt}",
      imageFallback: "صورة",
      fullscreen: "ملء الشاشة",
      fullscreenPreview: "معاينة الصورة بملء الشاشة",
      generatedImage: "صورة مولّدة",
      copy: "نسخ الصورة",
      copyImage: "نسخ الصورة",
      copied: "تم نسخ الصورة",
      copiedToClipboard: "تم نسخ الصورة إلى الحافظة",
      copyToClipboard: "نسخ الصورة إلى الحافظة",
      download: "تنزيل الصورة",
      exitFullscreen: "الخروج من ملء الشاشة",
      exitFullscreenTitle: "الخروج من ملء الشاشة (Esc)",
      exitFullscreenLabel: "الخروج من ملء الشاشة",
    },
    email: {
      edit: "تعديل البريد",
      editAction: "تعديل",
      cancelEditing: "إلغاء التعديل",
      save: "حفظ البريد",
      copy: "نسخ البريد",
      copied: "تم نسخ البريد",
      recipients: "المستلمون",
      subject: "الموضوع",
      subjectPlaceholder: "موضوع البريد",
      message: "الرسالة",
    },
    compacted: {
      badge: "تم ضغط {count} من الرسائل",
      summaryLine: "تم تلخيص {count} من الرسائل السابقة",
      collapse: "طي",
      showFullHistory: "عرض السجل الكامل",
      inSessionOnly: "(في الجلسة فقط — قد يؤدي التحديث إلى فقدان محتوى أقدم)",
      retrievable: "(قابل للاسترجاع)",
    },
  },

  // The response action bar under an assistant message.
  actions: {
    label: "إجراءات الرسالة",
    copyResponse: "نسخ الرد",
    responseCopied: "تم نسخ الرد",
    rateResponse: "تقييم الرد",
    changeRating: "تغيير التقييم",
    rateThisResponse: "قيّم هذا الرد",
    goodResponse: "رد جيد",
    badResponse: "رد سيئ",
    goodResponseChange: "رد جيد (اضغط للتغيير)",
    badResponseChange: "رد سيئ (اضغط للتغيير)",
    shareResponse: "مشاركة الرد",
    shareTitle: "رد COREZ AI",
  },
};
