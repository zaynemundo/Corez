// @vitest-environment jsdom
// ThemeProvider is the single owner of the document's theme state. These tests
// pin the pieces a cosmetic theme can otherwise get wrong: the tone attribute,
// inline custom properties, the managed classes, the theme-color meta tag, the
// paint cache across reloads, the signed-out/outage tolerance, the storage
// event used by other tabs, and the proposal apply/delete semantics the chat
// card and Settings consume.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { useState } from "react";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext.jsx";
import { AuthProvider } from "../src/context/AuthContext.jsx";

const STORAGE_KEY = "corez_theme";
const CACHE_KEY = "corez_theme_cache";

function makeTheme(overrides = {}) {
  return {
    id: "t1",
    name: "Midnight Reef",
    tone: "dark",
    palette: {
      background: "#101820",
      surface: "#1b2632",
      text: "#f2f7ff",
      muted: "#9fb3c8",
      border: "#2b3a4a",
    },
    tokens: {
      solid: {
        "--bg-primary": "#101820",
        "--bg-secondary": "#1b2632",
        "--text-primary": "#f2f7ff",
        "--scrollbar-thumb": "rgba(242, 247, 255, 0.18)",
      },
      image: {
        "--theme-sidebar-bg": "rgba(16, 24, 32, 0.76)",
        "--theme-message-bg": "rgba(27, 38, 50, 0.84)",
        "--theme-panel-bg": "rgba(27, 38, 50, 0.9)",
        "--theme-panel-strong-bg": "rgba(16, 24, 32, 0.94)",
        "--theme-scrim": "rgba(16, 24, 32, 0.72)",
      },
      scrim: "rgba(16, 24, 32, 0.72)",
    },
    images: {
      desktop: "/api/assets/theme-desktop.jpg",
      mobile: "/api/assets/theme-mobile.jpg",
    },
    proposalId: "p1",
    createdAt: 1700000000000,
    ...overrides,
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub the three endpoints the provider and AuthProvider touch. `themesStatus`
 * returns an error body; `themesReject` simulates an offline transport;
 * `applyError` makes POST /api/themes/apply fail with that status/code.
 */
function stubApi({
  user = { id: "u1", email: "demo@corez.pro", plan: "free" },
  themes = [],
  max = 2,
  themesStatus = 200,
  themesReject = false,
  appliedTheme = null,
  applyError = null,
  deleteStatus = 200,
} = {}) {
  const handler = vi.fn(async (url, options = {}) => {
    const target = String(url);
    const method = String(options.method || "GET").toUpperCase();
    if (target.includes("/api/auth/me")) return response({ user });
    if (target === "/api/themes" && method === "GET") {
      if (themesReject) throw new Error("offline");
      if (themesStatus !== 200) {
        return response({ error: "Themes are unavailable.", code: "unavailable" }, themesStatus);
      }
      return response({ themes, max });
    }
    if (target === "/api/themes/apply" && method === "POST") {
      if (applyError) {
        return response(
          { error: applyError.message || "Could not save the theme.", code: applyError.code },
          applyError.status,
        );
      }
      return response({ theme: appliedTheme || makeTheme({ id: "t-new", proposalId: "p1" }) });
    }
    if (target.startsWith("/api/themes/") && method === "DELETE") {
      return response({ success: deleteStatus === 200 }, deleteStatus);
    }
    if (target.includes("/discard") && method === "POST") return response({ success: true });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", handler);
  return handler;
}

function ThemeProbe() {
  const theme = useTheme();
  const [outcome, setOutcome] = useState("idle");
  const attempt = (operation) => {
    Promise.resolve()
      .then(operation)
      .then(() => setOutcome("ok"))
      .catch((error) => setOutcome(`${error?.status ?? 0}:${error?.code ?? "error"}`));
  };
  return (
    <div>
      <span data-testid="selection">{theme.selection}</span>
      <span data-testid="mode">{theme.mode}</span>
      <span data-testid="active">{theme.activeTheme ? theme.activeTheme.id : "none"}</span>
      <span data-testid="custom-count">{theme.customThemes.length}</span>
      <span data-testid="max">{theme.maxCustomThemes}</span>
      <span data-testid="loading">{String(theme.loadingThemes)}</span>
      <span data-testid="last-error">
        {theme.lastError ? `${theme.lastError.status}:${theme.lastError.code}` : "none"}
      </span>
      <span data-testid="outcome">{outcome}</span>
      <button type="button" onClick={() => theme.setMode("light")}>
        go-light
      </button>
      <button type="button" onClick={() => theme.setMode("dark")}>
        go-dark
      </button>
      {theme.customThemes.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => theme.selectCustomTheme(entry.id)}
        >
          {`select-${entry.id}`}
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          attempt(() =>
            theme.deleteCustomTheme(
              theme.activeTheme?.id || theme.customThemes[0]?.id || "",
            ),
          )
        }
      >
        delete-active
      </button>
      <button type="button" onClick={() => theme.refreshThemes()}>
        refresh
      </button>
      <button
        type="button"
        onClick={() => attempt(() => theme.applyProposal("p1", "palette"))}
      >
        apply-palette
      </button>
    </div>
  );
}

function renderTheme({ auth = true, initialSelection, children = <ThemeProbe /> } = {}) {
  const inner = (
    <ThemeProvider initialSelection={initialSelection}>{children}</ThemeProvider>
  );
  return render(auth ? <AuthProvider>{inner}</AuthProvider> : inner);
}

function root() {
  return document.documentElement;
}

function resetDocument() {
  const element = document.documentElement;
  element.removeAttribute("data-theme");
  element.removeAttribute("style");
  element.classList.remove("theme-custom", "theme-has-backgrounds");
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
}

function metaContent() {
  return document.querySelector('meta[name="theme-color"]').getAttribute("content");
}

function themesFetchCalls(handler) {
  return handler.mock.calls.filter(
    ([url, options]) =>
      String(url) === "/api/themes" &&
      String(options?.method || "GET").toUpperCase() === "GET",
  ).length;
}

beforeEach(() => {
  localStorage.clear();
  resetDocument();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetDocument();
});

describe("theme state without a provider", () => {
  it("returns safe dark defaults and inert actions instead of crashing", async () => {
    render(<ThemeProbe />);

    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(screen.getByTestId("active").textContent).toBe("none");
    expect(screen.getByTestId("custom-count").textContent).toBe("0");
    expect(screen.getByTestId("max").textContent).toBe("2");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("last-error").textContent).toBe("none");

    fireEvent.click(screen.getByText("go-light"));
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(root().getAttribute("data-theme")).toBeNull();

    // The no-provider apply action reports itself as unavailable instead of
    // resolving an imaginary theme.
    fireEvent.click(screen.getByText("apply-palette"));
    await waitFor(() =>
      expect(screen.getByTestId("outcome").textContent).toBe(
        "0:theme_provider_unavailable",
      ),
    );
  });
});

describe("light and dark selection", () => {
  it("reads the stored selection and keeps legacy values on the dark base", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    renderTheme({ auth: false });
    expect(screen.getByTestId("selection").textContent).toBe("light");
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(metaContent()).toBe("#f7f7f7");

    cleanup();
    resetDocument();
    localStorage.setItem(STORAGE_KEY, "some-future-value");
    renderTheme({ auth: false });
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(root().getAttribute("data-theme")).toBe("dark");
    // The provider canonicalises the storage value so index.html can paint it.
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("switches tone, meta colour and persistence together", () => {
    renderTheme({ auth: false, initialSelection: "light" });
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(metaContent()).toBe("#f7f7f7");

    fireEvent.click(screen.getByText("go-dark"));
    expect(root().getAttribute("data-theme")).toBe("dark");
    // color-scheme keeps native controls and scrollbars on the chosen tone.
    expect(root().style.colorScheme).toBe("dark");
    expect(metaContent()).toBe("#000000");
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByText("go-light"));
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("writes nothing on the document from a consumer outside the provider", () => {
    const before = root().getAttribute("data-theme");
    render(<ThemeProbe />);
    fireEvent.click(screen.getByText("go-dark"));
    fireEvent.click(screen.getByText("go-light"));
    expect(root().getAttribute("data-theme")).toBe(before);
  });
});

describe("custom theme application", () => {
  it("paints the cached custom theme before the themes request resolves", async () => {
    localStorage.setItem(STORAGE_KEY, "custom:t1");
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    const handler = stubApi({ themesStatus: 500 });

    renderTheme();

    expect(screen.getByTestId("selection").textContent).toBe("custom:t1");
    expect(screen.getByTestId("active").textContent).toBe("t1");
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().style.colorScheme).toBe("dark");
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(root().classList.contains("theme-has-backgrounds")).toBe(true);
    expect(root().style.getPropertyValue("--bg-primary")).toBe("#101820");
    expect(root().style.getPropertyValue("--theme-sidebar-bg")).toBe(
      "rgba(16, 24, 32, 0.76)",
    );
    expect(root().style.getPropertyValue("--theme-scrim")).toBe(
      "rgba(16, 24, 32, 0.72)",
    );
    expect(root().style.getPropertyValue("--theme-image-desktop")).toContain(
      "/api/assets/theme-desktop.jpg",
    );
    expect(root().style.getPropertyValue("--theme-image-mobile")).toContain(
      "/api/assets/theme-mobile.jpg",
    );
    // The custom palette is what the browser chrome should match.
    expect(metaContent()).toBe("#101820");

    await waitFor(() => expect(themesFetchCalls(handler)).toBe(1));
    // A failed fetch keeps the cached paint — it does not blank the interface.
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(screen.getByTestId("selection").textContent).toBe("custom:t1");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("applies a light custom palette with the light tone and its own meta colour", () => {
    const lightTheme = makeTheme({
      id: "t-light",
      name: "Warm Paper",
      tone: "light",
      palette: {
        background: "#fdf6e3",
        surface: "#fffaf0",
        text: "#2a2118",
        muted: "#6f6254",
        border: "#d9cdb8",
      },
      tokens: {
        solid: { "--bg-primary": "#fdf6e3", "--text-primary": "#2a2118" },
        image: {},
        scrim: "",
      },
      images: null,
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(lightTheme));

    renderTheme({ auth: false, initialSelection: "custom:t-light" });

    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(root().classList.contains("theme-has-backgrounds")).toBe(false);
    expect(root().style.getPropertyValue("--bg-primary")).toBe("#fdf6e3");
    expect(root().style.getPropertyValue("--theme-image-desktop")).toBe("");
    expect(metaContent()).toBe("#fdf6e3");
  });

  it("switching to light or dark removes every custom variable and class", () => {
    localStorage.setItem(STORAGE_KEY, "custom:t1");
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    renderTheme({ auth: false });

    expect(root().classList.contains("theme-custom")).toBe(true);

    fireEvent.click(screen.getByText("go-light"));

    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().classList.contains("theme-custom")).toBe(false);
    expect(root().classList.contains("theme-has-backgrounds")).toBe(false);
    expect(root().style.getPropertyValue("--bg-primary")).toBe("");
    expect(root().style.getPropertyValue("--theme-image-desktop")).toBe("");
    expect(root().style.getPropertyValue("--theme-scrim")).toBe("");
    expect(metaContent()).toBe("#f7f7f7");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();

    localStorage.setItem(STORAGE_KEY, "custom:t1");
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    cleanup();
    renderTheme({ auth: false });
    fireEvent.click(screen.getByText("go-dark"));
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().classList.contains("theme-custom")).toBe(false);
    expect(metaContent()).toBe("#000000");
  });
});

describe("signed-in custom themes", () => {
  it("loads the saved themes and adopts the server copy of the painted theme", async () => {
    const cached = makeTheme();
    const serverTheme = makeTheme({
      name: "Midnight Reef (updated)",
      tokens: {
        ...cached.tokens,
        solid: { ...cached.tokens.solid, "--bg-primary": "#005577" },
      },
    });
    localStorage.setItem(STORAGE_KEY, "custom:t1");
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    stubApi({ themes: [serverTheme], max: 2 });

    renderTheme();
    expect(root().style.getPropertyValue("--bg-primary")).toBe("#101820");

    await waitFor(() =>
      expect(root().style.getPropertyValue("--bg-primary")).toBe("#005577"),
    );
    expect(screen.getByTestId("custom-count").textContent).toBe("1");
    expect(screen.getByTestId("max").textContent).toBe("2");
    expect(screen.getByTestId("active").textContent).toBe("t1");
    // The cache now holds the server copy, so the next reload paints it.
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).name).toBe(
      "Midnight Reef (updated)",
    );
  });

  it("falls back to dark and clears the cache when the saved theme is gone", async () => {
    localStorage.setItem(STORAGE_KEY, "custom:gone");
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme({ id: "gone" })));
    stubApi({ themes: [makeTheme()] });

    renderTheme();
    expect(root().classList.contains("theme-custom")).toBe(true);

    await waitFor(() =>
      expect(screen.getByTestId("selection").textContent).toBe("dark"),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(root().classList.contains("theme-custom")).toBe(false);
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("tolerates a signed-out or unavailable themes API without throwing", async () => {
    stubApi({ themesStatus: 401 });
    renderTheme();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(screen.getByTestId("custom-count").textContent).toBe("0");

    cleanup();
    resetDocument();
    stubApi({ themesReject: true });
    renderTheme();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(root().getAttribute("data-theme")).toBe("dark");
  });

  it("selects a saved theme and returns to dark after deleting the active one", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    stubApi({ themes: [makeTheme()] });

    renderTheme();
    await waitFor(() => expect(screen.getByTestId("custom-count").textContent).toBe("1"));

    fireEvent.click(screen.getByText("select-t1"));
    expect(screen.getByTestId("selection").textContent).toBe("custom:t1");
    expect(root().classList.contains("theme-custom")).toBe(true);

    fireEvent.click(screen.getByText("delete-active"));
    await waitFor(() =>
      expect(screen.getByTestId("selection").textContent).toBe("dark"),
    );
    expect(screen.getByTestId("custom-count").textContent).toBe("0");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(root().classList.contains("theme-custom")).toBe(false);
  });

  it("keeps the theme when deleting it fails and reports the failure", async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    stubApi({ themes: [makeTheme()], deleteStatus: 500 });

    renderTheme();
    await waitFor(() => expect(screen.getByTestId("custom-count").textContent).toBe("1"));
    fireEvent.click(screen.getByText("select-t1"));
    fireEvent.click(screen.getByText("delete-active"));

    await waitFor(() =>
      expect(screen.getByTestId("last-error").textContent).toBe("0:delete_failed"),
    );
    expect(screen.getByTestId("custom-count").textContent).toBe("1");
    expect(screen.getByTestId("selection").textContent).toBe("custom:t1");
  });

  it("honours the server maximum for custom themes", async () => {
    stubApi({ themes: [], max: 5 });
    renderTheme();
    await waitFor(() => expect(screen.getByTestId("max").textContent).toBe("5"));
  });
});

describe("proposal apply / discard", () => {
  it("applies a proposal, selects it and persists the cache", async () => {
    const appliedTheme = makeTheme({ id: "t-new", proposalId: "p9" });
    stubApi({ themes: [], appliedTheme });

    renderTheme();
    fireEvent.click(screen.getByText("apply-palette"));

    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe("ok"));
    expect(screen.getByTestId("selection").textContent).toBe("custom:t-new");
    expect(screen.getByTestId("custom-count").textContent).toBe("1");
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).id).toBe("t-new");
    expect(screen.getByTestId("last-error").textContent).toBe("none");
  });

  it("rejects a failed apply with the HTTP status and server code", async () => {
    stubApi({
      themes: [],
      applyError: { status: 409, code: "theme_limit", message: "Two themes max." },
    });

    renderTheme();
    fireEvent.click(screen.getByText("apply-palette"));

    await waitFor(() =>
      expect(screen.getByTestId("outcome").textContent).toBe("409:theme_limit"),
    );
    expect(screen.getByTestId("last-error").textContent).toBe("409:theme_limit");
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(root().getAttribute("data-theme")).toBe("dark");
  });
});

describe("cross-tab storage sync", () => {
  it("adopts another tab's light/dark choice", () => {
    renderTheme({ auth: false, initialSelection: "dark" });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: "light" }),
      );
    });
    expect(screen.getByTestId("selection").textContent).toBe("light");
    expect(root().getAttribute("data-theme")).toBe("light");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: "banana" }),
      );
    });
    expect(screen.getByTestId("selection").textContent).toBe("dark");
    expect(root().getAttribute("data-theme")).toBe("dark");
  });

  it("adopts another tab's custom theme, using the shared cache", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(makeTheme()));
    renderTheme({ auth: false, initialSelection: "dark" });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "custom:t1",
        }),
      );
    });

    expect(screen.getByTestId("selection").textContent).toBe("custom:t1");
    expect(screen.getByTestId("active").textContent).toBe("t1");
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(root().style.getPropertyValue("--bg-primary")).toBe("#101820");
  });
});
