// @vitest-environment jsdom
//
// Pinned chats in the sidebar. `sessions[].pinnedAt` is the flag; a pinned
// chat appears in its own section above the projects, it leaves the list it
// came from (Recents or its folder), and the chat menu offers Pin / Unpin.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../src/components/Sidebar.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

function sessions() {
  return [
    {
      id: "chat-1",
      title: "Pinned plan",
      projectId: null,
      pinnedAt: 1700000000000,
      _loaded: true,
      messages: [],
    },
    {
      id: "chat-2",
      title: "Loose chat",
      projectId: null,
      pinnedAt: null,
      _loaded: true,
      messages: [],
    },
    {
      id: "chat-3",
      title: "Filed chat",
      projectId: "proj-1",
      pinnedAt: null,
      _loaded: true,
      messages: [],
    },
    {
      id: "chat-4",
      title: "Pinned filed chat",
      projectId: "proj-1",
      pinnedAt: 1700000001000,
      _loaded: true,
      messages: [],
    },
  ];
}

function renderSidebar(props = {}) {
  const handlers = {
    onSelectSession: vi.fn(),
    onNewChat: vi.fn(),
    onOpenSettings: vi.fn(),
    onDeleteSession: vi.fn(),
    onCreateProject: vi.fn().mockResolvedValue({ id: "proj-new", name: "New" }),
    onRenameProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onMoveSessionToProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onTogglePinSession: vi.fn(),
    onCloseSidebar: vi.fn(),
  };
  render(
    <I18nProvider>
      <Sidebar
        isOpen
        activeView="chat"
        sessions={[]}
        activeSessionId={null}
        projects={[{ id: "proj-1", name: "Marketing" }]}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return handlers;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("sidebar pinned chats", () => {
  it("starts the pinned section collapsed, then shows pinned chats above the projects", async () => {
    const user = userEvent.setup();
    renderSidebar({ sessions: sessions() });

    // Compact on load.
    const toggle = screen.getByRole("button", { name: "Pinned" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("sidebar-pinned-list")).toBeNull();

    await user.click(toggle);

    const pinnedList = document.getElementById("sidebar-pinned-list");
    expect(pinnedList).toBeTruthy();
    // The pinned section renders above the projects section.
    expect(
      pinnedList.compareDocumentPosition(
        screen.getByRole("button", { name: "Projects" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(within(pinnedList).getByText("Pinned plan")).toBeTruthy();
    expect(within(pinnedList).getByText("Pinned filed chat")).toBeTruthy();
    // Most recently pinned first.
    expect(
      [...pinnedList.querySelectorAll(".history-item-title")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Pinned filed chat", "Pinned plan"]);

    // A pinned chat never repeats in the recent list.
    const recents = document.getElementById("sidebar-chats-list");
    expect(within(recents).queryByText("Pinned plan")).toBeNull();
    expect(within(recents).getByText("Loose chat")).toBeTruthy();
  });

  it("opens the pinned section for the chat being viewed", () => {
    renderSidebar({ sessions: sessions(), activeSessionId: "chat-1" });

    // No click: the section opens so the viewed pinned chat is never hidden
    // by the collapsed-by-default sidebar.
    expect(
      screen.getByRole("button", { name: "Pinned" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("Pinned plan")).toBeTruthy();
  });

  it("keeps a pinned chat out of its folder", async () => {
    const user = userEvent.setup();
    renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Projects" }));
    await user.click(
      screen.getByRole("button", { name: "Open project Marketing" }),
    );

    const projectList = document.getElementById("sidebar-projects-list");
    expect(within(projectList).getByText("Filed chat")).toBeTruthy();
    expect(within(projectList).queryByText("Pinned filed chat")).toBeNull();
  });

  it("keeps the Pinned section visible even when nothing is pinned", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions().map((session) => ({ ...session, pinnedAt: null })),
    });

    // The heading is permanent: an empty Pinned still shows where pinned
    // chats will land, instead of the section blinking in and out.
    await user.click(screen.getByRole("button", { name: "Pinned" }));
    const pinnedList = document.getElementById("sidebar-pinned-list");
    expect(pinnedList).toBeTruthy();
    expect(pinnedList.querySelector(".history-item")).toBeNull();
    expect(pinnedList.querySelector(".pinned-empty").textContent).toBe(
      "No pinned chats",
    );
  });

  it("pins and unpins from the row icon without opening the menu", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    // A loose chat in Recents: outline pin, not pressed, toggles on click.
    const looseRow = screen
      .getByRole("button", { name: "Open conversation Loose chat" })
      .closest(".history-item");
    const pinButton = within(looseRow).getByRole("button", { name: "Pin" });
    expect(pinButton.getAttribute("aria-pressed")).toBe("false");
    expect(
      pinButton.querySelector("svg.lucide-pin"),
    ).toBeTruthy();

    await user.click(pinButton);
    expect(handlers.onTogglePinSession).toHaveBeenCalledWith("chat-2");
    // The menu was never involved.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(handlers.onSelectSession).not.toHaveBeenCalled();

    // A pinned chat: the mark stays visible, pressed, and unpins on click.
    await user.click(screen.getByRole("button", { name: "Pinned" }));
    const pinnedRow = screen
      .getByRole("button", { name: "Open conversation Pinned plan" })
      .closest(".history-item");
    const unpinButton = within(pinnedRow).getByRole("button", {
      name: "Unpin",
    });
    expect(unpinButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      unpinButton.querySelector("svg.lucide-pin-off"),
    ).toBeTruthy();

    await user.click(unpinButton);
    expect(handlers.onTogglePinSession).toHaveBeenCalledWith("chat-1");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers Pin on a loose chat and Unpin on a pinned one", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(
      screen.getByRole("button", { name: "Options for Loose chat" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Pin" }));
    expect(handlers.onTogglePinSession).toHaveBeenCalledWith("chat-2");

    await user.click(screen.getByRole("button", { name: "Pinned" }));
    await user.click(
      screen.getByRole("button", { name: "Options for Pinned plan" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Unpin" }));
    expect(handlers.onTogglePinSession).toHaveBeenCalledWith("chat-1");
  });

  it("keeps a pinned chat's own folder in its menu", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Pinned" }));
    await user.click(
      screen.getByRole("button", { name: "Options for Pinned filed chat" }),
    );
    // The row is rendered in Pinned but still knows its folder, so the menu
    // can pull it back out.
    await user.click(screen.getByRole("menuitem", { name: "No project" }));
    expect(handlers.onMoveSessionToProject).toHaveBeenCalledWith("chat-4", null);
  });

  it("expands and folds the pinned section without touching the other lists", async () => {
    const user = userEvent.setup();
    renderSidebar({ sessions: sessions() });

    // Compact on load.
    const toggle = screen.getByRole("button", { name: "Pinned" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("sidebar-pinned-list")).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("sidebar-pinned-list");
    expect(screen.getByText("Pinned plan")).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("sidebar-pinned-list")).toBeNull();
    // Recents is its own disclosure and stays open.
    expect(screen.getByText("Loose chat")).toBeTruthy();
  });
});
