// Arabic dictionary — app shell, sidebar and shared strings.
// Mirror of src/i18n/en/common.js; the dictionary integrity test fails when a
// key is missing, extra, still in English, or drops a {placeholder}.
export default {
  shell: {
    closeSidebar: "إغلاق الشريط الجانبي",
    openSidebar: "فتح الشريط الجانبي",
    streamingElsewhere: "يتم توليد الرد في محادثة أخرى",
    respondingIn: "جارٍ الرد في «{title}»…",
    anotherChat: "محادثة أخرى",
    view: "عرض",
    responding: "Corez يرد الآن",
    untitledApplication: "تطبيق بدون عنوان",
  },

  // شاشة المحادثة الجديدة: اسم العلامة والسؤال فوق مربع الكتابة، وشبكة الأوامر تحته.
  // كل خلية تُدرج أحد أوامر Corez نفسها (@website، @game، @image، @research).
  newChat: {
    title: "ما الذي سنبنيه اليوم؟",
    startersLabel: "أوامر Corez",
    starterWebsite: "أنشئ تطبيقاً أو موقعاً",
    starterGame: "أنشئ لعبة",
    starterImage: "ولّد صورة",
    starterResearch: "ابحث في موضوع",
  },

  // Announced by the thinking indicator's live region while a build runs.
  phase: {
    planning: "التخطيط للبناء…",
    swarmPlanning: "تخطيط جماعي…",
    building: "جارٍ البناء…",
    continuing: "متابعة كتابة الملف…",
    verifying: "جارٍ التحقق…",
    repairing: "إصلاح ما وجده التحقق…",
    reviewing: "مراجعة النتيجة…",
    resuming: "إعادة الاتصال — استئناف البناء…",
    waitingForBuild: "لا يزال البناء جارياً…",
    retrying: "خدمة الذكاء الاصطناعي مشغولة — إعادة المحاولة…",
    done: "تم.",
  },

  // لوحة التفكير المباشرة: يظهر تفكير النموذج هنا قبل بدء الإجابة.
  thinking: {
    label: "التفكير",
    working: "جارٍ العمل…",
    thoughtForSeconds: "فكّر لمدة {seconds} ثانية",
  },

  // شاشة المواقع: كل صفحة نشرها هذا الحساب، مع الإجراءين اللذين تحتاجهما صفحة
  // منشورة — تعديلها بالذكاء الاصطناعي أو إزالتها.
  sites: {
    title: "المواقع",
    subtitle: "كل ما نشرته. افتح موقعاً أو عدّله أو أزله.",
    backToChat: "العودة إلى المحادثة",
    refresh: "تحديث",
    retry: "إعادة المحاولة",
    loading: "جارٍ تحميل مواقعك المنشورة…",
    empty: "لا يوجد شيء منشور بعد",
    emptyHint:
      "انشر إبداعاً من لوحة المعاينة وسيظهر هنا جاهزاً للتعديل.",
    openTitle: "فتح {url} في تبويب جديد",
    copy: "نسخ الرابط",
    copied: "تم نسخ الرابط",
    edit: "تعديل",
    editChatTitle: "تعديل {title}",
    editChatHeading: "ما الذي نغيّره؟",
    editChatHint:
      "الموقع المنشور مفتوح في المعاينة ومحمّل في هذه المحادثة. أخبر Corez بما تريد تغييره.",
    editChatPrompt: "حدّث هذا الموقع المنشور: ",
    editChatError: "تعذّر فتح محادثة التعديل. حاول مرة أخرى.",
    homePage: "الرئيسية",
    cancel: "إلغاء",
    unpublish: "إلغاء النشر",
    confirmUnpublish: "اضغط مرة أخرى لإلغاء النشر",
    removing: "جارٍ الإزالة…",
    removeError: "تعذّر إلغاء نشر هذه الصفحة.",
    pagesCount: "{count} صفحات",
    truncated: "بعض الصفحات الأقدم غير مدرجة هنا.",
    // زيارات الموقع المنشور: العدّ ذاتي المصدر وبلا ملفات تعريف ارتباط،
    // واللوحة تقول ذلك صراحةً كي يثق المالك في الأرقام.
    analytics: {
      title: "تحليلات الموقع",
      open: "التحليلات",
      close: "إغلاق التحليلات",
      loading: "جارٍ تحميل التحليلات…",
      retry: "إعادة المحاولة",
      error: "تعذّر تحميل التحليلات.",
      rangeLabel: "الفترة الزمنية",
      range7: "٧ أيام",
      range30: "٣٠ يوماً",
      range90: "٩٠ يوماً",
      views: "مشاهدات الصفحات",
      visitors: "زوار فريدون",
      returning: "الزوار العائدون",
      perVisitor: "صفحات / زائر",
      change: "{change}% مقارنةً بـ{days} يوماً السابقة",
      chartSummary:
        "{from} – {to}: {views} مشاهدة. أكثر يوم نشاطاً: {day} ({count} مشاهدة).",
      chartSummaryEmpty: "{from} – {to}: لا مشاهدات بعد.",
      topPages: "أكثر الصفحات زيارة",
      sources: "المصادر",
      countries: "الدول",
      devices: "الأجهزة",
      direct: "مباشر",
      internal: "داخلي",
      other: "أخرى",
      unknown: "غير معروف",
      desktop: "حاسوب",
      mobile: "هاتف",
      tablet: "جهاز لوحي",
      empty: "لا مشاهدات بعد",
      emptyHint:
        "لا تُحتسب زياراتك من المتصفح الذي سجّلت الدخول منه. افتح رابط الموقع في نافذة خاصة أو أرسله إلى شخص آخر لترى الزيارات تظهر.",
      trackingSince: "التتبّع منذ {date}",
      privacy:
        "تحليلات ذاتية المصدر وبلا ملفات تعريف ارتباط. تُستثنى الزيارات الآلية وزياراتك أنت؛ ويُحفظ ارتباط الزائر {days} يوماً.",
      disabled: "الجمع متوقف على هذا النشر؛ لا تزال البيانات السابقة معروضة.",
      rowLabel: "{label}: {views} مشاهدة ({percent}%)",
    },
  },

  sidebar: {
    collapse: "طي الشريط الجانبي",
    newChat: "محادثة جديدة",
    newChatTitle: "جلسة محادثة جديدة",
    sites: "المواقع",
    sitesTitle: "المواقع المنشورة — افتحها أو عدّلها",
    pinned: "المثبتة",
    collapsePinned: "طي المثبتة",
    expandPinned: "توسيع المثبتة",
    pin: "تثبيت",
    unpin: "إلغاء التثبيت",
    projects: "المشاريع",
    newProject: "مشروع جديد",
    collapseProjects: "طي المشاريع",
    expandProjects: "توسيع المشاريع",
    projectNamePlaceholder: "اسم المشروع",
    projectOptions: "خيارات المشروع",
    optionsForProject: "خيارات مشروع {name}",
    openProject: "فتح مشروع {name}",
    renameProject: "إعادة تسمية",
    deleteProject: "حذف",
    moveToProject: "نقل إلى مشروع",
    noProject: "بدون مشروع",
    newChatInProject: "محادثة جديدة في {name}",
    emptyProject: "لا توجد محادثات بعد",
    chats: "الأحدث",
    collapseChats: "طي المحادثات الأخيرة",
    expandChats: "توسيع المحادثات الأخيرة",
    chatOptions: "خيارات المحادثة",
    optionsFor: "خيارات {title}",
    openConversation: "فتح المحادثة {title}",
    delete: "حذف",
    openSettings: "فتح الإعدادات",
    settings: "الإعدادات",
    guest: "زائر",
    primaryNavigation: "التنقل الرئيسي",
    searchChats: "البحث في المحادثات",
    searchPlaceholder: "ابحث في محادثاتك",
    searchEmpty: "لا توجد محادثات",
    untitledChat: "محادثة بلا عنوان",
  },

  action: {
    copy: "نسخ",
    copied: "تم النسخ",
    close: "إغلاق",
    cancel: "إلغاء",
    save: "حفظ",
    retry: "إعادة المحاولة",
    download: "تنزيل",
    dismiss: "تجاهل",
    open: "فتح",
  },

  // Click-to-load third-party embeds (used inside chat messages).
  embed: {
    notAllowed: "هذا التضمين من مزوّد غير مسموح به، لذلك لم يتم تحميله.",
    cookieNotice:
      "تحميل تضمين {provider} سيتيح لـ{provider} تعيين ملفات تعريف الارتباط ومعرفة عنوان IP الخاص بك. يبقى محظوراً حتى تختار تحميله.",
    load: "تحميل التضمين",
    alwaysAllow: "السماح دائماً بالتضمينات",
  },

  status: {
    loading: "جارٍ التحميل…",
    loadingCorez: "جارٍ تحميل Corez…",
    sessionFailedTitle: "تعذّر التحقق من جلستك",
    sessionFailedBody:
      "لم يتمكن Corez من الوصول إلى الخادم، لذا لا يعرف ما إذا كنت مسجّلاً للدخول. لم يُفقد أي شيء — حاول مرة أخرى.",
  },

  error: {
    generic: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  },
};
