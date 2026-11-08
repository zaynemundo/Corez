// @vitest-environment jsdom
// Settings → Appearance now lists Light, Dark and the saved custom themes as
// one group. These tests pin the interaction contract the user sees: the
// selected state, switching, the custom-theme rows with their delete control
// and confirmation, the slot hints, and the fallback rendering without a
// ThemeProvider (isolated component tests).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsModal from "../src/components/SettingsModal.jsx";
import App from "../src/App.jsx";
import { AuthProvider } from "../src/context/AuthContext.jsx";
import { ThemeProvider } from "../src/context/ThemeContext.jsx";

const STORAGE_KEY = "corez_theme";

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
      },
      image: {},
      scrim: "",
    },
    images: null,
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

function stubApi({ themes = [], max = 2, deleteStatus = 200 } = {}) {
  const handler = vi.fn(async (url, options = {}) => {
    const target = String(url);
    const method = String(options.method || "GET").toUpperCase();
    if (target.includes("/api/auth/me")) {
      return response({ user: { id: "u1", email: "demo@corez.pro", plan: "free" } });
    }
    if (target === "/api/themes" && method === "GET") {
      return response({ themes, max });
    }
    if (target.startsWith("/api/themes/") && method === "DELETE") {
      return response({ success: deleteStatus === 200 }, deleteStatus);
    }
    if (target.includes("/api/subscriptions/me")) {
      return response({ plan: "free", status: "active" });
    }
    if (target === "/api/usage") {
      return response({ error: "Usage is not available here." }, 500);
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", handler);
  return handler;
}

function renderSettings({
  themes = [],
  max = 2,
  deleteStatus = 200,
  withThemeProvider = true,
  storedSelection,
} = {}) {
  if (storedSelection) localStorage.setItem(STORAGE_KEY, storedSelection);
  const handler = stubApi({ themes, max, deleteStatus });
  const modal = (
    <SettingsModal
      isOpen
      onClose={() => {}}
      onClearAllHistory={() => {}}
    />
  );
  const view = render(
    <MemoryRouter>
      <AuthProvider>
        {withThemeProvider ? <ThemeProvider>{modal}</ThemeProvider> : modal}
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...view, handler };
}

function root() {
  return document.documentElement;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove("theme-custom", "theme-has-backgrounds");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("settings appearance theme list", () => {
  it("offers Light and Dark as selectable rows in one Theme group", () => {
    renderSettings({ storedSelection: "light" });

    const group = screen.getByRole("group", { name: "Theme" });
    const lightRow = within(group).getByRole("button", { name: "Light mode" });
    const darkRow = within(group).getByRole("button", { name: "Dark mode" });

    expect(lightRow.className).toContain("settings-row-btn");
    expect(lightRow.getAttribute("aria-pressed")).toBe("true");
    expect(lightRow.className).toContain("is-selected");
    expect(darkRow.getAttribute("aria-pressed")).toBe("false");
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("switches between Light and Dark and remembers the choice", () => {
    renderSettings();
    const darkRow = screen.getByRole("button", { name: "Dark mode" });
    expect(darkRow.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Light mode" }));
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(
      screen.getByRole("button", { name: "Light mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(darkRow.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");

    fireEvent.click(darkRow);
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("lists every saved custom theme with its name, badge and delete control", async () => {
    renderSettings({ themes: [makeTheme(), makeTheme({ id: "t2", name: "Sea Glass" })] });

    expect(await screen.findByText("Midnight Reef")).toBeTruthy();
    const row = screen.getByRole("button", { name: /^Midnight Reef/ });
    expect(row.textContent).toContain("Custom");
    expect(screen.getByText("Sea Glass")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Midnight Reef" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Sea Glass" })).toBeTruthy();
  });

  it("selects a custom theme, paints it and marks it pressed", async () => {
    renderSettings({ themes: [makeTheme()] });
    await screen.findByText("Midnight Reef");

    fireEvent.click(screen.getByRole("button", { name: /^Midnight Reef/ }));

    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEY)).toBe("custom:t1"),
    );
    expect(root().classList.contains("theme-custom")).toBe(true);
    expect(root().style.getPropertyValue("--bg-primary")).toBe("#101820");
    expect(
      screen.getByRole("button", { name: /^Midnight Reef/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("asks before deleting and keeps the theme when the user declines", async () => {
    const { handler } = renderSettings({ themes: [makeTheme()] });
    await screen.findByText("Midnight Reef");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete Midnight Reef" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Midnight Reef")).toBeTruthy();
    expect(
      handler.mock.calls.some(
        ([url, options]) =>
          String(url) === "/api/themes/t1" &&
          String(options?.method || "").toUpperCase() === "DELETE",
      ),
    ).toBe(false);
  });

  it("deletes a theme after confirmation and falls back to dark when it was active", async () => {
    renderSettings({ themes: [makeTheme()], storedSelection: "custom:t1" });
    await screen.findByText("Midnight Reef");
    expect(
      screen.getByRole("button", { name: /^Midnight Reef/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete Midnight Reef" }));

    await waitFor(() => expect(screen.queryByText("Midnight Reef")).toBeNull());
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(root().classList.contains("theme-custom")).toBe(false);
    expect(root().getAttribute("data-theme")).toBe("dark");
  });

  it("reports a failed delete instead of dropping the row", async () => {
    renderSettings({ themes: [makeTheme()], deleteStatus: 500 });
    await screen.findByText("Midnight Reef");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete Midnight Reef" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not delete the theme. Try again.");
    expect(screen.getByText("Midnight Reef")).toBeTruthy();
  });

  it("invites the user to create a theme when a slot is free", async () => {
    renderSettings({ themes: [makeTheme()] });
    await screen.findByText("Midnight Reef");
    expect(
      screen.getByText("Create your own theme: type @theme in chat."),
    ).toBeTruthy();
  });

  it("explains the limit when both slots are taken", async () => {
    renderSettings({
      themes: [makeTheme(), makeTheme({ id: "t2", name: "Sea Glass" })],
    });
    await screen.findByText("Sea Glass");
    expect(
      screen.getByText("2 of 2 custom themes — delete one to make room."),
    ).toBeTruthy();
    expect(
      screen.queryByText("Create your own theme: type @theme in chat."),
    ).toBeNull();
  });

  it("opens Settings when the chat theme card dispatches corez:open-settings", async () => {
    window.history.pushState({}, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        const target = String(url);
        const method = String(options.method || "GET").toUpperCase();
        if (target.includes("/api/auth/me")) {
          return response({ user: { id: "u1", email: "demo@corez.pro", plan: "free" } });
        }
        if (target === "/api/themes" && method === "GET") {
          return response({ themes: [], max: 2 });
        }
        if (target.includes("/api/chats")) return response({ chats: [] });
        if (target.includes("/api/subscriptions/me")) {
          return response({ plan: "free", status: "active" });
        }
        if (target === "/api/usage") return response({ error: "n/a" }, 500);
        return new Response(null, { status: 404 });
      }),
    );

    render(<App />);
    // The shell only mounts after the session check resolves; the sidebar's
    // New chat action is the stable marker for it.
    await screen.findAllByText(/new chat/i);

    act(() => {
      window.dispatchEvent(new CustomEvent("corez:open-settings"));
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Settings");
    expect(within(dialog).getByRole("group", { name: "Theme" })).toBeTruthy();
  });

  it("renders the Light/Dark rows without a ThemeProvider", () => {
    renderSettings({ withThemeProvider: false });
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark mode" })).toBeTruthy();
    expect(
      screen.getByText("Create your own theme: type @theme in chat."),
    ).toBeTruthy();
  });
});
