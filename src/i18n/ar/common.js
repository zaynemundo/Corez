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
    startNewConversation: "ابدأ محادثة جديدة",
    responding: "Corez يرد الآن",
    untitledApplication: "تطبيق بدون عنوان",
    expandStream: "اضغط لتوسيع بث الرد",
    collapseStream: "اضغط لطي بث الرد",
    expandResponse: "توسيع الرد",
    collapseResponse: "طي الرد",
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

  sidebar: {
    collapse: "طي الشريط الجانبي",
    newChat: "محادثة جديدة",
    newChatTitle: "جلسة محادثة جديدة",
    chats: "المحادثات",
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
