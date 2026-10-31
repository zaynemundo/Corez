// @vitest-environment jsdom
//
// The closed desktop sidebar is a navigation rail, not an empty column: brand,
// new chat, Sites, quick find, recents and the account all remain reachable.
// The full panel stays mounted behind it for its state, so these tests pin the
// surface split as well as every rail action.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../src/components/Sidebar.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

const SESSIONS = [
  { id: "chat-1", title: "Design an analytics dashboard", _loaded: true },
  { id: "chat-2", title: "Plan a trip to Kyoto", _loaded: true },
  { id: "chat-3", title: "Debug the auth redirect loop", _loaded: true },
];

function renderRail(props = {}) {
  const handlers = {
    onSelectSession: vi.fn(),
    onNewChat: vi.fn(),
    onOpenSites: vi.fn(),
    onOpenSettings: vi.fn(),
    onDeleteSession: vi.fn(),
    onCloseSidebar: vi.fn(),
    onOpenSidebar: vi.fn(),
  };
  render(
    <I18nProvider>
      <Sidebar
        isOpen={false}
        sessions={SESSIONS}
        activeSessionId={null}
        activeView="chat"
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  const rail = document.querySelector(".sidebar-rail");
  return { handlers, rail, railQueries: within(rail) };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("dir");
});

describe("closed sidebar navigation rail", () => {
  it("keeps every destination one icon away and retires the full panel", async () => {
    const user = userEvent.setup();
    const { handlers, railQueries, rail } = renderRail();

    expect(rail.getAttribute("aria-hidden")).not.toBe("true");
    expect(document.querySelector(".sidebar-full").getAttribute("aria-hidden")).toBe(
      "true",
    );

    await user.click(railQueries.getByRole("button", { name: "Open Sidebar" }));
    expect(handlers.onOpenSidebar).toHaveBeenCalledTimes(1);

    await user.click(
      railQueries.getByRole("button", { name: "Start a new chat" }),
    );
    expect(handlers.onNewChat).toHaveBeenCalledTimes(1);

    await user.click(railQueries.getByRole("button", { name: "Recent chats" }));
    expect(handlers.onOpenSidebar).toHaveBeenCalledTimes(2);

    await user.click(
      railQueries.getByRole("button", { name: "Published sites" }),
    );
    expect(handlers.onOpenSites).toHaveBeenCalledTimes(1);

    await user.click(
      railQueries.getByRole("button", { name: "Open settings" }),
    );
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("marks the rail's Sites destination while that screen is open", () => {
    const { railQueries } = renderRail({ activeView: "sites" });

    const sites = railQueries.getByRole("button", { name: "Published sites" });
    expect(sites.getAttribute("aria-current")).toBe("page");
    expect(sites.className).toContain("is-active");

    const newChat = railQueries.getByRole("button", {
      name: "Start a new chat",
    });
    expect(newChat.className).not.toContain("sidebar-rail-action-primary");
  });

  it("places Sites above quick find in the rail", () => {
    const { railQueries } = renderRail();
    const nav = railQueries.getByRole("navigation", {
      name: "Primary navigation",
    });
    const labels = within(nav)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));

    expect(labels).toEqual([
      "Start a new chat",
      "Published sites",
      "Search chats",
      "Recent chats",
    ]);
  });

  it("uses the rail's quick find, then opens the chosen one", async () => {
    const user = userEvent.setup();
    const { handlers, railQueries } = renderRail();

    const trigger = railQueries.getByRole("button", { name: "Search chats" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Search chats" });
    const input = within(dialog).getByRole("searchbox", {
      name: "Search your chats",
    });
    expect(document.activeElement).toBe(input);

    await user.type(input, "kyoto");
    expect(
      within(dialog).getByRole("button", { name: /Kyoto/ }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: /analytics/ }),
    ).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: /Kyoto/ }));
    expect(handlers.onSelectSession).toHaveBeenCalledWith("chat-2");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("opens the first match with Enter", async () => {
    const user = userEvent.setup();
    const { handlers, railQueries } = renderRail();

    await user.click(
      railQueries.getByRole("button", { name: "Search chats" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Search chats" });
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search your chats" }),
      "kyoto{Enter}",
    );

    expect(handlers.onSelectSession).toHaveBeenCalledWith("chat-2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports an empty search instead of an empty panel", async () => {
    const user = userEvent.setup();
    const { railQueries } = renderRail();

    await user.click(
      railQueries.getByRole("button", { name: "Search chats" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Search chats" });
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search your chats" }),
      "no-such-chat",
    );

    expect(within(dialog).getByRole("status").textContent).toContain(
      "No chats found",
    );
  });

  it("closes quick find on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    const { railQueries } = renderRail();

    const trigger = railQueries.getByRole("button", { name: "Search chats" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Search chats" });
    const input = within(dialog).getByRole("searchbox", {
      name: "Search your chats",
    });
    await user.type(input, "design");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the rail available when the full panel is open", async () => {
    const user = userEvent.setup();
    const { handlers, rail, railQueries } = renderRail({ isOpen: true });

    expect(rail.getAttribute("aria-hidden")).not.toBe("true");
    expect(
      railQueries.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
    expect(document.querySelector(".sidebar-full").getAttribute("aria-hidden")).toBe(
      null,
    );

    // The rail brand is also the panel's collapse control while it is open.
    await user.click(
      railQueries.getByRole("button", { name: "Toggle sidebar" }),
    );
    expect(handlers.onCloseSidebar).toHaveBeenCalledTimes(1);
  });
});
