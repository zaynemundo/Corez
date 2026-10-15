// @vitest-environment jsdom
//
// Drag and drop in the sidebar. Chats are draggable rows:
//  - dropping onto a project folder files the chat there (on top);
//  - dropping anywhere in the Pinned section pins it;
//  - dropping between two rows of the SAME list reorders within that list
//    (the first reorder freezes the list into manual order server-side).
// Cross-list gap drops resolve to the onto-target below the pointer; a chat
// dropped on its own row, or a pinned chat dropped on Pinned, is a no-op.
// Touch devices have no HTML5 drag — the row menu stays their path.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../src/components/Sidebar.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

const PROJECT = { id: "proj-1", name: "Marketing" };

function sessions() {
  return [
    {
      id: "chat-1",
      title: "Alpha",
      projectId: "proj-1",
      pinnedAt: null,
      updatedAt: 3,
      _loaded: true,
      messages: [],
    },
    {
      id: "chat-2",
      title: "Beta",
      projectId: null,
      pinnedAt: null,
      updatedAt: 2,
      _loaded: true,
      messages: [],
    },
    {
      id: "chat-3",
      title: "Gamma",
      projectId: null,
      pinnedAt: null,
      updatedAt: 1,
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
    onReorderSession: vi.fn(),
    onCloseSidebar: vi.fn(),
  };
  render(
    <I18nProvider>
      <Sidebar
        isOpen
        activeView="chat"
        sessions={[]}
        activeSessionId={null}
        projects={[PROJECT]}
        manualLists={[]}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return handlers;
}

/** jsdom has no DataTransfer: the handlers only touch setData/effectAllowed. */
function dragPayload() {
  return {
    setData: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
  };
}

/** Real positioned pointer events: jsdom has no DragEvent, so clientY never
 *  lands through fireEvent props — a constructed MouseEvent carries it. */
function dragOverAt(el, clientY) {
  fireEvent(
    el,
    new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY }),
  );
}

function dropAt(el, clientY) {
  fireEvent(
    el,
    new MouseEvent("drop", { bubbles: true, cancelable: true, clientY }),
  );
}

/** A measured row: the gap side follows the pointer's half. */
function rowRect(top, height = 38) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 220,
    width: 220,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

const chatRow = (title) =>
  screen.getByRole("button", { name: `Open conversation ${title}` });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("sidebar drag and drop", () => {
  it("files a chat dropped onto a project folder", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Projects" }));
    const row = chatRow("Beta");
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });
    expect(row.className).toContain("dragging");

    const folder = screen
      .getByRole("button", { name: "Open project Marketing" })
      .closest(".project-group");
    fireEvent.dragOver(folder, { dataTransfer: dragPayload() });
    expect(folder.className).toContain("drop-target-active");

    fireEvent.drop(folder);
    expect(handlers.onMoveSessionToProject).toHaveBeenCalledWith(
      "chat-2",
      "proj-1",
    );
    expect(handlers.onReorderSession).not.toHaveBeenCalled();
    expect(handlers.onSelectSession).not.toHaveBeenCalled();
    // The flight is over: no row still dims.
    expect(document.querySelector(".history-item.dragging")).toBeNull();
  });

  it("does not file a chat onto the folder it already belongs to", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Projects" }));
    await user.click(
      screen.getByRole("button", { name: "Open project Marketing" }),
    );
    const row = chatRow("Alpha");
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });

    const folder = screen
      .getByRole("button", { name: "Open project Marketing" })
      .closest(".project-group");
    fireEvent.dragOver(folder, { dataTransfer: dragPayload() });
    expect(folder.className).not.toContain("drop-target-active");

    fireEvent.drop(folder);
    expect(handlers.onMoveSessionToProject).not.toHaveBeenCalled();
  });

  it("pins a chat dropped anywhere in the Pinned section", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Pinned" }));
    const row = chatRow("Beta");
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });

    const section = document.querySelector(".sidebar-pinned-section");
    fireEvent.dragOver(section, { dataTransfer: dragPayload() });
    expect(section.className).toContain("drop-target-active");

    fireEvent.drop(section);
    expect(handlers.onTogglePinSession).toHaveBeenCalledWith("chat-2");
    expect(handlers.onReorderSession).not.toHaveBeenCalled();
  });

  it("does nothing dropping an already-pinned chat on Pinned", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({
      sessions: sessions().map((s) =>
        s.id === "chat-2" ? { ...s, pinnedAt: 1700000000000 } : s,
      ),
    });

    await user.click(screen.getByRole("button", { name: "Pinned" }));
    const row = chatRow("Beta");
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });

    const section = document.querySelector(".sidebar-pinned-section");
    fireEvent.dragOver(section, { dataTransfer: dragPayload() });
    expect(section.className).not.toContain("drop-target-active");

    fireEvent.drop(section);
    expect(handlers.onTogglePinSession).not.toHaveBeenCalled();
  });

  it("reorders within the same list from the gap above or below", async () => {
    const handlers = renderSidebar({ sessions: sessions() });

    // Recents shows Beta (updatedAt 2) above Gamma (updatedAt 1).
    const beta = chatRow("Beta");
    beta.getBoundingClientRect = () => rowRect(100);
    const gamma = chatRow("Gamma");

    fireEvent.dragStart(gamma, { dataTransfer: dragPayload() });

    // Upper half: Gamma lands before Beta.
    dragOverAt(beta, 110);
    expect(beta.className).toContain("drop-before");
    dropAt(beta, 110);
    expect(handlers.onReorderSession).toHaveBeenCalledWith("chat-3", {
      beforeId: "chat-2",
    });

    // Lower half starts a fresh flight: Gamma lands after Beta.
    fireEvent.dragStart(gamma, { dataTransfer: dragPayload() });
    dragOverAt(beta, 130);
    expect(beta.className).toContain("drop-after");
    dropAt(beta, 130);
    expect(handlers.onReorderSession).toHaveBeenCalledWith("chat-3", {
      afterId: "chat-2",
    });

    expect(handlers.onMoveSessionToProject).not.toHaveBeenCalled();
    expect(handlers.onTogglePinSession).not.toHaveBeenCalled();
  });

  it("resolves a cross-list row drop to the folder below it, never a gap", async () => {
    const user = userEvent.setup();
    const handlers = renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Projects" }));
    await user.click(
      screen.getByRole("button", { name: "Open project Marketing" }),
    );

    // Beta (Recents) over Alpha (folder): no gap line — gaps never cross
    // lists. The drop bubbles past the row to the folder, which files it.
    const beta = chatRow("Beta");
    fireEvent.dragStart(beta, { dataTransfer: dragPayload() });
    const alpha = chatRow("Alpha");
    fireEvent.dragOver(alpha, { dataTransfer: dragPayload() });
    expect(alpha.className).not.toContain("drop-before");
    expect(alpha.className).not.toContain("drop-after");

    fireEvent.drop(alpha);
    expect(handlers.onReorderSession).not.toHaveBeenCalled();
    expect(handlers.onMoveSessionToProject).toHaveBeenCalledWith(
      "chat-2",
      "proj-1",
    );
  });

  it("does nothing dropping a chat onto its own row", () => {
    const handlers = renderSidebar({ sessions: sessions() });

    const beta = chatRow("Beta");
    fireEvent.dragStart(beta, { dataTransfer: dragPayload() });
    fireEvent.dragOver(beta, { dataTransfer: dragPayload() });
    expect(beta.className).not.toContain("drop-before");
    expect(beta.className).not.toContain("drop-after");

    fireEvent.drop(beta);
    expect(handlers.onReorderSession).not.toHaveBeenCalled();
    expect(handlers.onMoveSessionToProject).not.toHaveBeenCalled();
    expect(handlers.onTogglePinSession).not.toHaveBeenCalled();
  });

  it("never starts a drag from the row's buttons", () => {
    renderSidebar({ sessions: sessions() });

    const beta = chatRow("Beta");
    const options = screen.getByRole("button", { name: "Options for Beta" });
    // The drag is cancelled: dispatchEvent reports it via `false`.
    expect(
      fireEvent.dragStart(options, { dataTransfer: dragPayload() }),
    ).toBe(false);
    expect(beta.className).not.toContain("dragging");

    const pin = document.querySelector(".chat-pin-btn");
    expect(fireEvent.dragStart(pin, { dataTransfer: dragPayload() })).toBe(
      false,
    );
    expect(beta.className).not.toContain("dragging");
  });

  it("ends the flight on drag end and clears stale highlights", async () => {
    const user = userEvent.setup();
    renderSidebar({ sessions: sessions() });

    await user.click(screen.getByRole("button", { name: "Projects" }));
    const row = chatRow("Beta");
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });
    expect(row.className).toContain("dragging");

    fireEvent.dragEnd(row);
    expect(document.querySelector(".history-item.dragging")).toBeNull();

    // A fresh flight, abandoned over empty background: the folder highlight
    // from the last hovered target does not linger.
    fireEvent.dragStart(row, { dataTransfer: dragPayload() });
    const folder = screen
      .getByRole("button", { name: "Open project Marketing" })
      .closest(".project-group");
    fireEvent.dragOver(folder, { dataTransfer: dragPayload() });
    expect(folder.className).toContain("drop-target-active");
    fireEvent.dragOver(document.querySelector(".chat-history-list"));
    expect(folder.className).not.toContain("drop-target-active");
  });
});
