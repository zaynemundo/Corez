// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  I18nProvider,
  useI18n,
  readStoredLanguage,
} from "../src/i18n/index.jsx";
import {
  DICTIONARIES,
  DICTIONARY_AREAS,
  flattenDictionary,
  lookup,
  translate,
} from "../src/i18n/dictionaries.js";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from "../src/i18n/languages.js";
import SettingsModal from "../src/components/SettingsModal.jsx";
import Sidebar from "../src/components/Sidebar.jsx";

function Probe() {
  const { t, language, dir, isRTL, setLanguage } = useI18n();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="rtl">{String(isRTL)}</span>
      <span data-testid="label">{t("settings.language")}</span>
      <span data-testid="interpolated">
        {t("common.sidebar.optionsFor", { title: "Alpha" })}
      </span>
      <span data-testid="missing">{t("chat.aKeyThatDoesNotExist")}</span>
      <button type="button" onClick={() => setLanguage("ar")}>
        to-arabic
      </button>
      <button type="button" onClick={() => setLanguage("fr")}>
        to-french
      </button>
    </div>
  );
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ plan: "free", status: "active" }),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute("lang", "en");
  document.documentElement.setAttribute("dir", "ltr");
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("interface language", () => {
  it("renders English, left-to-right, when nothing has been chosen", () => {
    render(<Probe />);
    expect(screen.getByTestId("language").textContent).toBe(DEFAULT_LANGUAGE);
    expect(screen.getByTestId("dir").textContent).toBe("ltr");
    expect(screen.getByTestId("label").textContent).toBe("Interface language");
    expect(screen.getByTestId("rtl").textContent).toBe("false");
  });

  it("switches language, direction and the document attributes together", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText("to-arabic"));

    expect(screen.getByTestId("language").textContent).toBe("ar");
    expect(screen.getByTestId("dir").textContent).toBe("rtl");
    expect(screen.getByTestId("rtl").textContent).toBe("true");
    // Arabic label comes from the Arabic dictionary, not a fallback.
    expect(screen.getByTestId("label").textContent).not.toBe(
      "Interface language",
    );
    // The whole document mirrors, so third-party styles and the browser's own
    // bidi handling both see the change.
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");
  });

  it("remembers the chosen language across a reload", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
    expect(readStoredLanguage()).toBe("ar");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("language").textContent).toBe("ar");
  });

  it("ignores an unsupported language instead of blanking the interface", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText("to-french"));
    expect(screen.getByTestId("language").textContent).toBe(DEFAULT_LANGUAGE);
    expect(screen.getByTestId("label").textContent).toBe("Interface language");
  });

  it("interpolates placeholders and never invents a missing string", () => {
    render(<Probe />);
    expect(screen.getByTestId("interpolated").textContent).toBe(
      "Options for Alpha",
    );
    // A missing key shows the key itself: visible and greppable, never blank.
    expect(screen.getByTestId("missing").textContent).toBe(
      "chat.aKeyThatDoesNotExist",
    );
  });

  it("falls back to English when a language has no entry for a key", () => {
    // A language without dictionaries (or without this key) must never show a
    // blank label: English is the fallback, and an unknown key shows itself.
    expect(translate("fr", "common.sidebar.newChat")).toBe(
      lookup("en", "common.sidebar.newChat"),
    );
    expect(translate("en", "common.thisIsMissing")).toBe("common.thisIsMissing");
  });

  it("switches the interface from the Settings language control", () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <SettingsModal
            isOpen
            onClose={() => {}}
            onClearAllHistory={() => {}}
            theme="dark"
            onToggleTheme={() => {}}
          />
        </I18nProvider>
      </MemoryRouter>,
    );

    const select = screen.getByLabelText("Interface language");
    expect(select.value).toBe("en");

    act(() => {
      fireEvent.change(select, { target: { value: "ar" } });
    });

    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");
    // The control is now labelled from the Arabic dictionary.
    const arabicLabel = screen.getByText("لغة الواجهة");
    expect(arabicLabel).toBeTruthy();
    expect(screen.getByLabelText("لغة الواجهة").value).toBe("ar");
  });
});

describe("shell in Arabic", () => {
  it("renders the sign-in screen from the Arabic dictionary, right-to-left", async () => {
    // The sign-in page is the public front door: it must be Arabic too, not just
    // the signed-in shell. AuthProvider + a stubbed fetch keep this a pure UI
    // check (no session call leaves the test).
    const { default: Login } = await import("../src/pages/Login.jsx");
    const { AuthProvider } = await import("../src/context/AuthContext.jsx");
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");

    render(
      <MemoryRouter>
        <I18nProvider>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    // A label that only exists in the Arabic dictionary, not a fallback.
    expect(
      screen.getByRole("tab", { name: "تسجيل الدخول" }),
    ).toBeTruthy();
  });

  it("renders the sidebar from the Arabic dictionary, right-to-left", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
    render(
      <I18nProvider>
        <Sidebar
          isOpen
          sessions={[{ id: "1", title: "My Chat" }]}
          activeSessionId="1"
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onOpenSettings={() => {}}
          onDeleteSession={() => {}}
          activeView="chat"
          onCloseSidebar={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("محادثة جديدة")).toBeTruthy();
    expect(screen.getByText("المحادثات")).toBeTruthy();
    // The session title is user data and stays exactly as it was written.
    expect(screen.getByText("My Chat")).toBeTruthy();
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });
});

describe("dictionary integrity", () => {
  const english = Object.fromEntries(
    DICTIONARY_AREAS.map((area) => [
      area,
      flattenDictionary(DICTIONARIES.en[area]),
    ]),
  );
  const arabic = Object.fromEntries(
    DICTIONARY_AREAS.map((area) => [
      area,
      flattenDictionary(DICTIONARIES.ar[area]),
    ]),
  );

  it("declares every language for every area", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const area of DICTIONARY_AREAS) {
        expect(
          DICTIONARIES[language.id][area],
          `${language.id}/${area}.js`,
        ).toBeTruthy();
      }
    }
  });

  it("translates every English key", () => {
    const missing = [];
    for (const area of DICTIONARY_AREAS) {
      for (const key of Object.keys(english[area])) {
        const value = arabic[area][key];
        if (typeof value !== "string" || !value.trim()) {
          missing.push(`ar/${area}.js → ${key}`);
        }
      }
    }
    expect(missing, `untranslated keys:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no Arabic key the English dictionary does not define", () => {
    const extra = [];
    for (const area of DICTIONARY_AREAS) {
      for (const key of Object.keys(arabic[area])) {
        if (!(key in english[area])) extra.push(`ar/${area}.js → ${key}`);
      }
    }
    expect(extra, `unknown keys:\n${extra.join("\n")}`).toEqual([]);
  });

  it("does not leave English text in the Arabic dictionary", () => {
    // Values that are identical in both languages on purpose: the brand name
    // and any value with no letters (symbols, numbers, currency codes).
    const ALLOWED_IDENTICAL = new Set(["Corez", "AED", "USD", "AI", "API"]);
    const untranslated = [];
    for (const area of DICTIONARY_AREAS) {
      for (const [key, value] of Object.entries(arabic[area])) {
        const englishValue = english[area][key];
        if (typeof value !== "string" || typeof englishValue !== "string") {
          continue;
        }
        if (value !== englishValue) continue;
        if (ALLOWED_IDENTICAL.has(value.trim())) continue;
        if (!/[\p{L}]/u.test(value)) continue;
        untranslated.push(`ar/${area}.js → ${key}`);
      }
    }
    expect(untranslated, `still in English:\n${untranslated.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps the same {placeholders} in every translation", () => {
    const mismatched = [];
    const placeholders = (value) =>
      (String(value).match(/\{(\w+)\}/g) || []).sort().join(",");
    for (const area of DICTIONARY_AREAS) {
      for (const [key, englishValue] of Object.entries(english[area])) {
        const arabicValue = arabic[area][key];
        if (typeof arabicValue !== "string") continue;
        if (placeholders(englishValue) !== placeholders(arabicValue)) {
          mismatched.push(`ar/${area}.js → ${key}`);
        }
      }
    }
    expect(
      mismatched,
      `placeholder mismatch:\n${mismatched.join("\n")}`,
    ).toEqual([]);
  });
});
