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

  // شاشة المحادثة الجديدة: السؤال فوق مربع الكتابة وصفوف البدء تحته.
  // كل صف يُدرج أحد أوامر Corez نفسها (@website، @game، @image، @research).
  newChat: {
    title: "ما الذي سنبنيه اليوم؟",
    startersLabel: "ابدأ بأمر",
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

  sidebar: {
    collapse: "طي الشريط الجانبي",
    newChat: "محادثة جديدة",
    newChatTitle: "جلسة محادثة جديدة",
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
