// @vitest-environment jsdom
//
// Project folders in the sidebar. The sidebar owns the interaction model; the
// grouping itself is `sessions[].projectId` (server-backed on the chat), so
// these tests pin what the user sees and what each control asks the app to do:
//  - projects render above the plain Chats list and expand to reveal their
//    chats (only theirs);
//  - the chat's menu files it into a project, or pulls it back out;
//  - creating, renaming and deleting a project never touches its chats.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../src/components/Sidebar.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

const PROJECT = { id: "proj-1", name: "Marketing" };

/** A measured element, for the tests that exercise menu geometry: jsdom has no
 *  layout, so they supply the rects the drop-up decision reads. */
function rectAt(bottom) {
  return {
    top: bottom - 38,
    bottom,
    left: 0,
    right: 240,
    width: 240,
    height: 38,
    x: 0,
    y: bottom - 38,
    toJSON: () => ({}),
  };
}

function sessions() {
  return [
    {
      id: "chat-1",
      title: "Alpha",
      projectId: "proj-1",
      _loaded: true,
      messages: [],
    },
    { id: "chat-2", title: "Beta", projectId: null, _loaded: true, messages: [] },
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
    onCloseSidebar: vi.fn(),
  };
  render(
    <I18nProvider>
      <Sidebar
        isOpen
        activeView="chat"
        sessions={[]}
        activeSessionId={null}
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

describe("sidebar project folders", () => {
  it("collapses a project until it is opened, and keeps ungrouped chats separate", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Marketing")).toBeTruthy();
    // The plain chats list still owns the chats that have no project.
    expect(screen.getByText("Beta")).toBeTruthy();
    // Nothing of the collapsed project is on screen yet.
    expect(screen.queryByText("Alpha")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open project Marketing" }));

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open conversation Alpha" })).toBeTruthy();
    // Chats of the project do not leak into the plain list twice.
    expect(screen.getAllByText("Alpha")).toHaveLength(1);
  });

  it("opens the project that holds the chat being viewed", () => {
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-1",
    });
    // No click: the active chat's folder is open so it is never hidden.
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("creates a project from the inline name field", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: [], projects: [] });

    await user.click(screen.getByRole("button", { name: "New Project" }));
    const input = screen.getByPlaceholderText("Project name");
    await user.type(input, "  Design ideas  {Enter}");

    await waitFor(() =>
      expect(handlers.onCreateProject).toHaveBeenCalledWith("Design ideas"),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Project name")).toBeNull(),
    );
  });

  it("creates only one project when Enter is pressed twice", async () => {
    const user = userEvent.setup();
    let resolveCreate;
    const onCreateProject = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderSidebar({ sessions: [], projects: [], onCreateProject });

    await user.click(screen.getByRole("button", { name: "New Project" }));
    const input = screen.getByPlaceholderText("Project name");
    await user.type(input, "Once{Enter}");
    await user.type(input, "{Enter}");

    // The second submit lands while the first request is still open.
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCreate({ id: "proj-new", name: "Once" });
    });
  });

  it("cancels a new project on Escape without creating it", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: [], projects: [] });

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(
      screen.getByPlaceholderText("Project name"),
      "Never mind{Escape}",
    );

    expect(handlers.onCreateProject).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Project name")).toBeNull();
  });

  it("keeps a chat whose project is unknown in the plain list", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: [
        {
          id: "chat-3",
          title: "Orphan",
          projectId: "proj-deleted-elsewhere",
          _loaded: true,
          messages: [],
        },
      ],
      projects: [PROJECT],
      activeSessionId: null,
    });

    await user.click(
      screen.getByRole("button", { name: "Open project Marketing" }),
    );
    // Visible, but never filed into a folder that does not exist.
    expect(screen.getByText("Orphan")).toBeTruthy();
    const folder = screen
      .getByRole("button", { name: "Open project Marketing" })
      .closest(".project-group");
    expect(within(folder).queryByText("Orphan")).toBeNull();
    expect(within(folder).getByText("No chats yet")).toBeTruthy();
  });

  it("renames a project in place", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    await user.click(
      screen.getByRole("button", { name: "Options for project Marketing" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Rename project/ }));

    const input = screen.getByLabelText("Rename project");
    expect(input.value).toBe("Marketing");
    await user.clear(input);
    await user.type(input, "Launch{Enter}");

    expect(handlers.onRenameProject).toHaveBeenCalledTimes(1);
    expect(handlers.onRenameProject).toHaveBeenCalledWith("proj-1", "Launch");
    // The field closes; the shown name is the `projects` prop the app updates.
    expect(screen.queryByLabelText("Rename project")).toBeNull();
  });

  it("deletes a project without deleting its chats", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    await user.click(
      screen.getByRole("button", { name: "Options for project Marketing" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Delete project/ }));

    expect(handlers.onDeleteProject).toHaveBeenCalledWith("proj-1");
    // Nothing in the chat menus is clicked and no chat delete is requested.
    expect(handlers.onDeleteSession).not.toHaveBeenCalled();
  });

  it("files a chat into a project, and pulls it back out", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-1",
    });

    // Beta has no project: the menu offers the folder.
    await user.click(screen.getByRole("button", { name: "Options for Beta" }));
    await user.click(screen.getByRole("menuitem", { name: /Marketing/ }));
    expect(handlers.onMoveSessionToProject).toHaveBeenCalledWith(
      "chat-2",
      "proj-1",
    );

    // Alpha is already inside: the same menu offers "No project" instead.
    await user.click(screen.getByRole("button", { name: "Options for Alpha" }));
    await user.click(screen.getByRole("menuitem", { name: "No project" }));
    expect(handlers.onMoveSessionToProject).toHaveBeenCalledWith("chat-1", null);
  });

  it("starts a new chat inside an open project", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    await user.click(screen.getByRole("button", { name: "Open project Marketing" }));
    await user.click(screen.getByTitle("New chat in Marketing"));

    expect(handlers.onNewChatInProject).toHaveBeenCalledWith("proj-1");
  });

  it("marks an empty project as empty instead of showing nothing", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: [],
      projects: [PROJECT],
      activeSessionId: null,
    });

    await user.click(screen.getByRole("button", { name: "Open project Marketing" }));
    expect(screen.getByText("No chats yet")).toBeTruthy();
  });

  it("keeps selecting a chat inside a project working", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-1",
    });

    const project = screen
      .getByRole("button", { name: "Open project Marketing" })
      .closest(".project-group");
    await user.click(
      within(project).getByRole("button", { name: "Open conversation Alpha" }),
    );

    expect(handlers.onSelectSession).toHaveBeenCalledWith("chat-1");
  });

  it("hides the project list when the account has no projects", () => {
    renderSidebar({ sessions: sessions(), projects: [] });
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Marketing")).toBeNull();
  });

  it("folds the whole projects section without touching the chats list", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    const toggle = screen.getByRole("button", { name: "Projects" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("sidebar-projects-list");
    expect(screen.getByText("Marketing")).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Marketing")).toBeNull();
    // The chats section is its own disclosure: it stays open.
    expect(screen.getByRole("button", { name: "Recents" })).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("opens the projects section when a project is created from the add button", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: [],
      projects: [],
      activeSessionId: null,
    });

    const toggle = screen.getByRole("button", { name: "Projects" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(screen.getByRole("button", { name: "New Project" }));

    // The field would otherwise open inside a folded section.
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByPlaceholderText("Project name")).toBeTruthy();
  });

  it("collapses and expands the plain chats list", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    const toggle = screen.getByRole("button", { name: "Recents" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("sidebar-chats-list");
    expect(screen.getByText("Beta")).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Only the plain list folds; the folders keep their own state.
    expect(screen.queryByText("Beta")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open project Marketing" }),
    ).toBeTruthy();

    // A real button, so the keyboard opens it the same way (focus + Enter,
    // without a pointer click).
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Beta")).toBeTruthy();
    // The active chat in the list is reachable again, unchanged.
    expect(
      screen.getByRole("button", { name: "Open conversation Beta" }),
    ).toBeTruthy();
  });

  it("starts a new chat with the plain chats list open", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    const toggle = screen.getByRole("button", { name: "Recents" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(screen.getByTitle("New Chat Session"));

    // The new chat will land in the plain list, so that list is open again.
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(handlers.onNewChat).toHaveBeenCalledTimes(1);
  });

  it("opens the chat menu upward when the list has no room below the row", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    // The row sits at the list's bottom edge, so a menu growing down would be
    // clipped by the sidebar's scroll container. jsdom has no layout: the test
    // provides the geometry the decision reads.
    document.querySelector(".chat-history-list").getBoundingClientRect = () =>
      rectAt(600);
    const button = screen.getByRole("button", { name: "Options for Beta" });
    button.getBoundingClientRect = () => rectAt(590);

    await user.click(button);
    expect(screen.getByRole("menu").className).toContain("drop-up");
  });

  it("keeps the chat menu downward when the row has room below it", async () => {
    const user = userEvent.setup();
    renderSidebar({
      sessions: sessions(),
      projects: [PROJECT],
      activeSessionId: "chat-2",
    });

    document.querySelector(".chat-history-list").getBoundingClientRect = () =>
      rectAt(800);
    const button = screen.getByRole("button", { name: "Options for Beta" });
    button.getBoundingClientRect = () => rectAt(300);

    await user.click(button);
    expect(screen.getByRole("menu").className).not.toContain("drop-up");
  });

  it("renders the project controls from the Arabic dictionary", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider initialLanguage="ar">
        <Sidebar
          isOpen
          activeView="chat"
          sessions={[]}
          activeSessionId={null}
          projects={[PROJECT]}
          onSelectSession={vi.fn()}
          onNewChat={vi.fn()}
          onOpenSettings={vi.fn()}
          onDeleteSession={vi.fn()}
          onCloseSidebar={vi.fn()}
          onCreateProject={vi.fn()}
          onRenameProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onMoveSessionToProject={vi.fn()}
          onNewChatInProject={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("المشاريع")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "خيارات مشروع Marketing" }),
    );
    expect(screen.getByRole("menuitem", { name: /إعادة تسمية المشروع/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /حذف المشروع/ })).toBeTruthy();
  });
});
