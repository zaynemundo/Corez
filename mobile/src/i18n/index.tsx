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
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
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
  "settings.theme": "المظهر",
  "settings.theme.system": "النظام",
  "settings.theme.dark": "داكن",
  "settings.theme.light": "فاتح",
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
