/**
 * Native i18n provider.
 *
 * Key names mirror the web dictionaries (`src/i18n/en/*`) so the same
 * translation area files can replace this seed dictionary when the shared
 * package lands. Until then this holds only the strings the native shell
 * renders, in English and Arabic, with Arabic switching the layout to RTL.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";

export type LanguageId = "en" | "ar";

export const SUPPORTED_LANGUAGES: {
  id: LanguageId;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
}[] = [
  { id: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
];

const LANGUAGE_STORAGE_KEY = "corez_language";
const DEFAULT_LANGUAGE: LanguageId = "en";

type Dictionary = Record<string, string>;

const en: Dictionary = {
  "common.appName": "Corez",
  "common.status.loadingCorez": "Loading Corez…",
  "common.status.sessionFailedTitle": "Could not check your session",
  "common.status.sessionFailedBody":
    "Corez could not reach the server. Check your connection and try again.",
  "common.action.retry": "Try again",
  "common.action.cancel": "Cancel",
  "common.action.close": "Close",
  "auth.common.emailLabel": "Email",
  "auth.common.emailPlaceholder": "you@corez.pro",
  "auth.common.passwordLabel": "Password",
  "auth.common.passwordPlaceholder": "••••••••",
  "auth.common.showPassword": "Show password",
  "auth.common.hidePassword": "Hide password",
  "auth.common.login": "Login",
  "auth.common.signUpTab": "Sign Up",
  "auth.common.pleaseWait": "Please wait…",
  "auth.common.backToLogin": "Back to login",
  "auth.login.subtitle": "Sign in to your account",
  "auth.login.forgotPassword": "Forgot password?",
  "auth.login.noAccount": "Don't have an account?",
  "auth.login.signUpLink": "Sign up",
  "auth.signup.subtitle": "Create your account",
  "auth.signup.submit": "Create Account",
  "auth.signup.alreadyHaveAccount": "Already have an account?",
  "auth.signup.consentError":
    "Please accept the Terms and Privacy Policy to create an account.",
  "auth.errors.generic": "Something went wrong. Please try again.",
  "auth.errors.offline": "Could not reach Corez. Check your connection.",
  "shell.newChat": "New chat",
  "shell.settings": "Settings",
  "common.chat.mobileTag": "Mobile",
  "newChat.title": "What are we building today?",
  "chat.composer.placeholder": "Ask Corez…",
  "chat.composer.send": "Send",
  "chat.composer.stop": "Stop",
  "chat.history.title": "Chats",
  "chat.history.new": "New chat",
  "chat.history.loading": "Loading chats…",
  "chat.history.empty": "No chats yet",
  "chat.history.error": "Couldn't load chats. Tap to retry.",
  "chat.history.untitled": "Untitled chat",
  "chat.history.loadFailed": "Could not open this chat",
  "chat.history.pinned": "Pinned",
  "chat.history.recent": "Recent",
  "chat.history.actions": "Chat actions",
  "chat.history.rename": "Rename",
  "chat.history.renameTitle": "Rename chat",
  "chat.history.renamePlaceholder": "Chat title",
  "chat.history.save": "Save",
  "chat.history.pin": "Pin",
  "chat.history.unpin": "Unpin",
  "chat.history.delete": "Delete",
  "chat.history.deleteTitle": "Delete this chat?",
  "chat.history.deleteBody":
    "The conversation and its messages are removed permanently. Any published page from it is unpublished.",
  "chat.offline.chats": "Offline — showing saved chats.",
  "chat.offline.messages": "Offline — showing the saved copy of this chat.",
  "image.preview": "Image preview",
  "image.share": "Share",
  "image.shareFailed": "Could not share the image.",
  "image.copyLink": "Copy link",
  "image.copied": "Link copied",
  "image.copyFailed": "Could not copy the link.",
  "canvas.preview": "Preview",
  "canvas.previewTitle": "Preview canvas",
  "canvas.copy": "Copy",
  "canvas.copied": "HTML copied",
  "canvas.shareFile": "Share",
  "chat.code.revise": "Revise",
  "canvas.shared": "Shared",
  "canvas.failed": "Could not share the file.",
  "canvas.renderError": "This preview could not be rendered.",
  "canvas.publish": "Publish",
  "canvas.publishFailed": "Could not publish this page.",
  "canvas.linkCopied": "Link copied",
  "canvas.open": "Open",
  "canvas.copyLink": "Copy link",
  "canvas.shareLink": "Share link",
  "sites.title": "Published sites",
  "sites.subtitle": "Everything you have published from Corez.",
  "sites.loading": "Loading your published sites…",
  "sites.empty": "Nothing published yet",
  "sites.emptyHint": "Preview a generated page and tap Publish to create a public link.",
  "sites.loadFailed": "Could not load your published sites.",
  "sites.retry": "Try again",
  "sites.open": "Open",
  "sites.share": "Share",
  "sites.copy": "Copy link",
  "sites.copied": "Copied",
  "sites.remove": "Remove",
  "sites.removeTitle": "Unpublish this site?",
  "sites.removeBody": "The public link stops working immediately. The creation stays in its chat.",
  "sites.removed": "Page unpublished",
  "sites.changeUrl": "Change URL",
  "sites.changeUrlTitle": "Change the public URL",
  "sites.changeUrlHint": "Pick a new slug. The old link stops working; the page and its analytics stay the same.",
  "sites.newUrl": "New URL slug",
  "sites.urlInvalid": "Use 3–50 lowercase letters, numbers and single hyphens.",
  "sites.urlChanged": "URL updated:",
  "sites.saveUrl": "Save URL",
  "chat.share.action": "Share conversation",
  "chat.share.failed": "Could not create the share link.",
  "chat.share.empty": "Send a message before sharing this chat.",
  "shareChat.title": "Shared conversation",
  "shareChat.share": "Share link",
  "shareChat.loading": "Loading shared conversation…",
  "shareChat.unavailable": "This shared conversation is unavailable or was revoked.",
  "shareChat.openApp": "Open CoreZ",
  "shareChat.untitled": "Untitled conversation",
  "shareChat.snapshot": "A frozen snapshot — later messages are not included.",
  "shareChat.empty": "This conversation has no messages.",
  "shareChat.you": "User",
  "image.title": "Image studio",
  "image.subtitle": "Describe the image you want. The worker expands short prompts and falls back between providers automatically.",
  "image.placeholder": "A cinematic photo of a snow leopard on a rooftop at dusk…",
  "image.generate": "Generate image",
  "image.copyPrompt": "Copy prompt",
  "image.promptCopied": "Prompt copied",
  "image.failed": "Could not generate the image.",
  "image.saveFailed": "Could not save the image.",
  "image.result": "Generated image",
  "image.save": "Save / share",
  "image.recent": "Recent",
  "sites.stats": "Stats",
  "analytics.title": "Site analytics",
  "analytics.loading": "Loading traffic…",
  "analytics.loadFailed": "Could not load analytics.",
  "analytics.empty": "No traffic recorded in this window yet.",
  "analytics.collectionDisabled": "Analytics collection is currently disabled on this deployment.",
  "analytics.views": "Views",
  "analytics.visitors": "Visitors",
  "analytics.returning": "Returning visitors",
  "analytics.viewsPerVisitor": "Views per visitor",
  "analytics.dailyViews": "Daily views",
  "analytics.changeViews": "Views vs previous period: {value}",
  "analytics.changeVisitors": "Visitors vs previous period: {value}",
  "analytics.topPages": "Top pages",
  "analytics.sources": "Sources",
  "analytics.countries": "Countries",
  "analytics.devices": "Devices",
  "analytics.noBreakdown": "Nothing recorded yet.",
  "analytics.window": "{from} – {to}",
  "analytics.range.7": "7 days",
  "analytics.range.30": "30 days",
  "analytics.range.90": "90 days",
  "chat.code.plain": "code",
  "chat.code.copy": "Copy",
  "chat.code.copied": "Copied",
  "chat.attachments.add": "Add attachment",
  "chat.attachments.remove": "Remove attachment",
  "chat.attachments.camera": "Take photo",
  "chat.attachments.photos": "Choose photo",
  "chat.attachments.file": "Choose file",
  "chat.dictation.start": "Dictate",
  "chat.dictation.stop": "Stop dictation",
  "chat.dictation.transcribing": "Transcribing…",
  "chat.thinking.label": "Thinking",
  "chat.thinking.working": "Working…",
  "chat.thinking.thoughtForSeconds": "Thought for {seconds}s",
  "chat.error.streamIncomplete": "The response was cut off. Try again.",
  "chat.error.empty": "Corez returned no content for that message.",
  "home.starters.website": "Build an app or website",
  "home.starters.game": "Create a game",
  "home.starters.image": "Generate an image",
  "home.starters.research": "Research a topic",
  "home.starters.conversation": "Start a conversation",
  "conversation.title": "New conversation",
  "conversation.subtitle": "Two AI friends reply to you together. Give them names and personalities.",
  "conversation.persona": "Persona {number}",
  "conversation.name": "Name",
  "conversation.personality": "Personality",
  "conversation.start": "Start conversation",
  "conversation.hint": "Tip: mention @john or @scarlett to get just one reply.",
  "conversation.nameRequired": "Both personas need a name.",
  "conversation.failed": "Could not start the conversation.",
  "conversation.defaultTitle": "New Conversation",
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.customThemes": "Custom themes",
  "settings.customThemesHint": "Describe a look in chat with @theme to design one.",
  "settings.themeLoadFailed": "Could not load your custom themes.",
  "settings.themeDelete": "Delete",
  "settings.themeDeleteTitle": "Delete this theme?",
  "settings.themeDeleteBody": "The saved theme is removed permanently.",
  "theme.proposal.subtitle": "A theme designed for CoreZ",
  "theme.proposal.useColors": "Use colors",
  "theme.proposal.useBackgrounds": "Colors + art",
  "theme.proposal.expired": "This proposal expired — run @theme again.",
  "theme.proposal.limit": "You already have two custom themes. Delete one in Settings → Appearance.",
  "theme.proposal.saved": "Applied — switch themes in Settings → Appearance.",
  "theme.proposal.failed": "Could not save this theme.",
  "theme.proposal.backgroundsUnavailable": "Background artwork isn't available for this proposal.",
  "theme.proposal.desktopArt": "Desktop background artwork",
  "theme.proposal.mobileArt": "Mobile background artwork",
  "settings.language": "Language",
  "settings.signOut": "Sign out",
};

const ar: Dictionary = {
  "common.appName": "كوريز",
  "common.status.loadingCorez": "جارٍ تحميل كوريز…",
  "common.status.sessionFailedTitle": "تعذّر التحقق من جلستك",
  "common.status.sessionFailedBody":
    "تعذّر على كوريز الوصول إلى الخادم. تحقق من اتصالك وحاول مرة أخرى.",
  "common.action.retry": "إعادة المحاولة",
  "common.action.cancel": "إلغاء",
  "common.action.close": "إغلاق",
  "auth.common.emailLabel": "البريد الإلكتروني",
  "auth.common.emailPlaceholder": "you@corez.pro",
  "auth.common.passwordLabel": "كلمة المرور",
  "auth.common.passwordPlaceholder": "••••••••",
  "auth.common.showPassword": "إظهار كلمة المرور",
  "auth.common.hidePassword": "إخفاء كلمة المرور",
  "auth.common.login": "تسجيل الدخول",
  "auth.common.signUpTab": "إنشاء حساب",
  "auth.common.pleaseWait": "يرجى الانتظار…",
  "auth.common.backToLogin": "العودة لتسجيل الدخول",
  "auth.login.subtitle": "سجّل الدخول إلى حسابك",
  "auth.login.forgotPassword": "هل نسيت كلمة المرور؟",
  "auth.login.noAccount": "ليس لديك حساب؟",
  "auth.login.signUpLink": "أنشئ حسابًا",
  "auth.signup.subtitle": "أنشئ حسابك",
  "auth.signup.submit": "إنشاء الحساب",
  "auth.signup.alreadyHaveAccount": "لديك حساب بالفعل؟",
  "auth.signup.consentError":
    "يرجى قبول الشروط وسياسة الخصوصية لإنشاء حساب.",
  "auth.errors.generic": "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  "auth.errors.offline": "تعذّر الوصول إلى كوريز. تحقق من اتصالك.",
  "shell.newChat": "محادثة جديدة",
  "shell.settings": "الإعدادات",
  "common.chat.mobileTag": "الجوال",
  "newChat.title": "ماذا سنبني اليوم؟",
  "chat.composer.placeholder": "اسأل كوريز…",
  "chat.composer.send": "إرسال",
  "chat.composer.stop": "إيقاف",
  "chat.history.title": "المحادثات",
  "chat.history.new": "محادثة جديدة",
  "chat.history.loading": "جارٍ تحميل المحادثات…",
  "chat.history.empty": "لا توجد محادثات بعد",
  "chat.history.error": "تعذّر تحميل المحادثات. اضغط لإعادة المحاولة.",
  "chat.history.untitled": "محادثة بلا عنوان",
  "chat.history.loadFailed": "تعذّر فتح هذه المحادثة",
  "chat.history.pinned": "المثبتة",
  "chat.history.recent": "الأحدث",
  "chat.history.actions": "إجراءات المحادثة",
  "chat.history.rename": "إعادة تسمية",
  "chat.history.renameTitle": "إعادة تسمية المحادثة",
  "chat.history.renamePlaceholder": "عنوان المحادثة",
  "chat.history.save": "حفظ",
  "chat.history.pin": "تثبيت",
  "chat.history.unpin": "إلغاء التثبيت",
  "chat.history.delete": "حذف",
  "chat.history.deleteTitle": "حذف هذه المحادثة؟",
  "chat.history.deleteBody":
    "ستُحذف المحادثة ورسائلها نهائيًا، وستُلغى نشر أي صفحة ناتجة عنها.",
  "chat.offline.chats": "غير متصل — تُعرض المحادثات المحفوظة.",
  "chat.offline.messages": "غير متصل — تُعرض نسخة محفوظة من هذه المحادثة.",
  "image.preview": "معاينة الصورة",
  "image.share": "مشاركة",
  "image.shareFailed": "تعذّرت مشاركة الصورة.",
  "image.copyLink": "نسخ الرابط",
  "image.copied": "تم نسخ الرابط",
  "image.copyFailed": "تعذّر نسخ الرابط.",
  "canvas.preview": "معاينة",
  "canvas.previewTitle": "معاينة الرسم",
  "canvas.copy": "نسخ",
  "canvas.copied": "تم نسخ HTML",
  "canvas.shareFile": "مشاركة",
  "chat.code.revise": "تعديل",
  "canvas.shared": "تمت المشاركة",
  "canvas.failed": "تعذّرت مشاركة الملف.",
  "canvas.renderError": "تعذّر عرض هذه المعاينة.",
  "canvas.publish": "نشر",
  "canvas.publishFailed": "تعذّر نشر هذه الصفحة.",
  "canvas.linkCopied": "تم نسخ الرابط",
  "canvas.open": "فتح",
  "canvas.copyLink": "نسخ الرابط",
  "canvas.shareLink": "مشاركة الرابط",
  "sites.title": "المواقع المنشورة",
  "sites.subtitle": "كل ما نشرته من كوريز.",
  "sites.loading": "جارٍ تحميل مواقعك المنشورة…",
  "sites.empty": "لا يوجد شيء منشور بعد",
  "sites.emptyHint": "عاين صفحة مولّدة واضغط نشر لإنشاء رابط عام.",
  "sites.loadFailed": "تعذّر تحميل مواقعك المنشورة.",
  "sites.retry": "إعادة المحاولة",
  "sites.open": "فتح",
  "sites.share": "مشاركة",
  "sites.copy": "نسخ الرابط",
  "sites.copied": "تم النسخ",
  "sites.remove": "إزالة",
  "sites.removeTitle": "إلغاء نشر هذا الموقع؟",
  "sites.removeBody": "سيتوقف الرابط العام فورًا، ويبقى الإنشاء في محادثته.",
  "sites.removed": "تم إلغاء نشر الصفحة",
  "sites.changeUrl": "تغيير الرابط",
  "sites.changeUrlTitle": "تغيير الرابط العام",
  "sites.changeUrlHint": "اختر معرّفًا جديدًا. سيتوقف الرابط القديم عن العمل، وتبقى الصفحة وإحصاءاتها كما هي.",
  "sites.newUrl": "معرّف الرابط الجديد",
  "sites.urlInvalid": "استخدم 3–50 حرفًا لاتينيًا صغيرًا وأرقامًا وشرطات مفردة.",
  "sites.urlChanged": "تم تحديث الرابط:",
  "sites.saveUrl": "حفظ الرابط",
  "chat.share.action": "مشاركة المحادثة",
  "chat.share.failed": "تعذّر إنشاء رابط المشاركة.",
  "chat.share.empty": "أرسل رسالة قبل مشاركة هذه المحادثة.",
  "shareChat.title": "محادثة مشتركة",
  "shareChat.share": "مشاركة الرابط",
  "shareChat.loading": "جارٍ تحميل المحادثة المشتركة…",
  "shareChat.unavailable": "هذه المحادثة المشتركة غير متاحة أو تم إلغاؤها.",
  "shareChat.openApp": "فتح كوريز",
  "shareChat.untitled": "محادثة بلا عنوان",
  "shareChat.snapshot": "نسخة مجمّدة — الرسائل اللاحقة غير مشمولة.",
  "shareChat.empty": "لا تحتوي هذه المحادثة على رسائل.",
  "shareChat.you": "المستخدم",
  "image.title": "استوديو الصور",
  "image.subtitle": "صف الصورة التي تريدها. يوسّع العامل الأوصاف القصيرة ويبدّل بين المزوّدين تلقائيًا.",
  "image.placeholder": "صورة سينمائية لنمر ثلجي على سطح مبنى عند الغروب…",
  "image.generate": "توليد الصورة",
  "image.copyPrompt": "نسخ الوصف",
  "image.promptCopied": "تم نسخ الوصف",
  "image.failed": "تعذّر توليد الصورة.",
  "image.saveFailed": "تعذّر حفظ الصورة.",
  "image.result": "الصورة المولّدة",
  "image.save": "حفظ / مشاركة",
  "image.recent": "الأحدث",
  "sites.stats": "الإحصاءات",
  "analytics.title": "إحصاءات الموقع",
  "analytics.loading": "جارٍ تحميل الزيارات…",
  "analytics.loadFailed": "تعذّر تحميل الإحصاءات.",
  "analytics.empty": "لا توجد زيارات مسجّلة في هذه الفترة بعد.",
  "analytics.collectionDisabled": "جمع الإحصاءات معطّل حاليًا على هذا النشر.",
  "analytics.views": "المشاهدات",
  "analytics.visitors": "الزوار",
  "analytics.returning": "زوار عائدون",
  "analytics.viewsPerVisitor": "مشاهدات لكل زائر",
  "analytics.dailyViews": "المشاهدات اليومية",
  "analytics.changeViews": "المشاهدات مقارنة بالفترة السابقة: {value}",
  "analytics.changeVisitors": "الزوار مقارنة بالفترة السابقة: {value}",
  "analytics.topPages": "أكثر الصفحات",
  "analytics.sources": "المصادر",
  "analytics.countries": "الدول",
  "analytics.devices": "الأجهزة",
  "analytics.noBreakdown": "لا شيء مسجّل بعد.",
  "analytics.window": "{from} – {to}",
  "analytics.range.7": "7 أيام",
  "analytics.range.30": "30 يومًا",
  "analytics.range.90": "90 يومًا",
  "chat.code.plain": "كود",
  "chat.code.copy": "نسخ",
  "chat.code.copied": "تم النسخ",
  "chat.attachments.add": "إضافة مرفق",
  "chat.attachments.remove": "إزالة المرفق",
  "chat.attachments.camera": "التقاط صورة",
  "chat.attachments.photos": "اختيار صورة",
  "chat.attachments.file": "اختيار ملف",
  "chat.dictation.start": "إملاء صوتي",
  "chat.dictation.stop": "إيقاف الإملاء",
  "chat.dictation.transcribing": "جارٍ التفريغ…",
  "chat.thinking.label": "التفكير",
  "chat.thinking.working": "جارٍ العمل…",
  "chat.thinking.thoughtForSeconds": "فكّر لمدة {seconds} ثانية",
  "chat.error.streamIncomplete": "انقطع الردّ. حاول مرة أخرى.",
  "chat.error.empty": "لم يُرجع كوريز أي محتوى لهذه الرسالة.",
  "home.starters.website": "ابنِ تطبيقًا أو موقعًا",
  "home.starters.game": "أنشئ لعبة",
  "home.starters.image": "ولّد صورة",
  "home.starters.research": "ابحث في موضوع",
  "home.starters.conversation": "ابدأ محادثة",
  "conversation.title": "محادثة جديدة",
  "conversation.subtitle": "صديقان ذكيان يردّان عليك معًا. امنحهما اسمين وشخصيتين.",
  "conversation.persona": "الشخصية {number}",
  "conversation.name": "الاسم",
  "conversation.personality": "الشخصية",
  "conversation.start": "ابدأ المحادثة",
  "conversation.hint": "تلميح: اذكر @john أو @scarlett للحصول على رد واحد فقط.",
  "conversation.nameRequired": "يحتاج كل من الشخصيتين إلى اسم.",
  "conversation.failed": "تعذّر بدء المحادثة.",
  "conversation.defaultTitle": "محادثة جديدة",
  "settings.theme": "المظهر",
  "settings.theme.system": "النظام",
  "settings.theme.dark": "داكن",
  "settings.theme.light": "فاتح",
  "settings.customThemes": "مظهر مخصص",
  "settings.customThemesHint": "صف المظهر في المحادثة باستخدام @theme لتصميمه.",
  "settings.themeLoadFailed": "تعذّر تحميل مظهرك المخصص.",
  "settings.themeDelete": "حذف",
  "settings.themeDeleteTitle": "حذف هذا المظهر؟",
  "settings.themeDeleteBody": "سيُحذف المظهر المحفوظ نهائيًا.",
  "theme.proposal.subtitle": "مظهر مصمم لـ CoreZ",
  "theme.proposal.useColors": "استخدام الألوان",
  "theme.proposal.useBackgrounds": "الألوان + الخلفية",
  "theme.proposal.expired": "انتهت صلاحية هذا العرض — جرّب @theme مرة أخرى.",
  "theme.proposal.limit": "لديك مظهران مخصصان بالفعل. احذف واحدًا من الإعدادات ← المظهر.",
  "theme.proposal.saved": "تم التطبيق — بدّل المظهر من الإعدادات ← المظهر.",
  "theme.proposal.failed": "تعذّر حفظ هذا المظهر.",
  "theme.proposal.backgroundsUnavailable": "خلفية هذا العرض غير متاحة.",
  "theme.proposal.desktopArt": "خلفية سطح المكتب",
  "theme.proposal.mobileArt": "خلفية الهاتف",
  "settings.language": "اللغة",
  "settings.signOut": "تسجيل الخروج",
};

const DICTIONARIES: Record<LanguageId, Dictionary> = { en, ar };

type Vars = Record<string, string | number>;

function translate(language: LanguageId, key: string, vars?: Vars): string {
  const template = DICTIONARIES[language]?.[key] ?? DICTIONARIES.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

interface I18nValue {
  language: LanguageId;
  dir: "ltr" | "rtl";
  isRTL: boolean;
  languages: typeof SUPPORTED_LANGUAGES;
  setLanguage: (language: LanguageId) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const FALLBACK: I18nValue = {
  language: DEFAULT_LANGUAGE,
  dir: "ltr",
  isRTL: false,
  languages: SUPPORTED_LANGUAGES,
  setLanguage: () => {},
  t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageId>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
        if (mounted && (stored === "ar" || stored === "en")) {
          applyDirection(stored);
          setLanguageState(stored);
        }
      } catch {
        // Default language remains active.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback((next: LanguageId) => {
    if (next !== "en" && next !== "ar") return;
    setLanguageState(next);
    applyDirection(next);
    void SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(() => {
    const meta = SUPPORTED_LANGUAGES.find((item) => item.id === language)!;
    return {
      language,
      dir: meta.dir,
      isRTL: meta.dir === "rtl",
      languages: SUPPORTED_LANGUAGES,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK;
}

function applyDirection(language: LanguageId): void {
  const shouldBeRTL = language === "ar";
  // RN requires a reload for direction changes to fully rebuild the layout.
  // Setting it here keeps new sessions correct; the settings screen tells the
  // reader a restart finishes switching an already-open session.
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
  }
}

export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY };
