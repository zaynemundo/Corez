// @vitest-environment jsdom
//
// Project folders and chat pinning through the real app shell
// (App -> Sidebar -> chatService). The sidebar tests pin the controls; this
// pins the wiring behind them:
//  - the projects the account owns come from `GET /api/projects` and group the
//    chats the server says belong to them;
//  - creating a project posts it, and the folder appears without a reload;
//  - moving a chat and deleting a folder send exactly the right requests, and
//    deleting a folder keeps the chat (it returns to the plain list);
//  - pinning a chat PATCHes the flag and moves the chat into Pinned without a
//    reload.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App.jsx";
import { __resetChatPrefetchForTests } from "../src/services/chatPrefetch.js";

const pathOf = (url) => {
  try {
    return new URL(String(url), "https://corez.test").pathname;
  } catch {
    return String(url);
  }
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * The app as it boots for a signed-in account with one project folder holding
 * one chat, plus one ungrouped chat. `calls` records every request (path,
 * method and body) so the test can assert the exact payloads the user's
 * actions send, not merely that some request happened.
 */
function signedInAccount({ failProjectChats = false, failReorder = false } = {}) {
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init = {}) => {
    const path = pathOf(url);
    const method = (init.method || "GET").toUpperCase();
    let body;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    calls.push({ path, method, body });
    if (path === "/api/auth/me") {
      return Promise.resolve(json({ user: { id: "u1", email: "a@b.co" } }));
    }
    if (path === "/api/chats") {
      return Promise.resolve(
        json({
          chats: [
            {
              id: "chat11111111",
              title: "Landing page",
              projectId: "proj11111111",
              updatedAt: 3,
            },
            {
              id: "chat22222222",
              title: "Scratch pad",
              projectId: null,
              updatedAt: 2,
            },
            {
              id: "chat33333333",
              title: "Third note",
              projectId: null,
              updatedAt: 1,
            },
          ],
          manualLists: [],
        }),
      );
    }
    if (path === "/api/projects") {
      if (method === "POST") {
        return Promise.resolve(
          json({
            id: "proj22222222",
            name: body.name,
            createdAt: 10,
            updatedAt: 10,
          }),
        );
      }
      return Promise.resolve(
        json({
          projects: [
            { id: "proj11111111", name: "Q4 launch", createdAt: 1, updatedAt: 3 },
          ],
        }),
      );
    }
    if (path === "/api/chats/reorder") {
      if (failReorder) {
        return Promise.resolve(json({ error: "Failed to reorder." }, 500));
      }
      return Promise.resolve(
        json({ id: body.chatId, list: "recents", sortOrder: 2, manual: true }),
      );
    }
    if (path.startsWith("/api/chats/")) {
      return Promise.resolve(
        json({ id: path.split("/").pop(), title: "Chat", messages: [] }),
      );
    }
    if (path.startsWith("/api/projects/")) {
      if (failProjectChats && path.endsWith("/chats")) {
        return Promise.resolve(json({ error: "Failed to move." }, 500));
      }
      return Promise.resolve(json({ success: true }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return calls;
}

const callsTo = (calls, path, method) =>
  calls.filter((c) => c.path === path && (!method || c.method === method));

async function openApp(path = "/") {
  window.history.pushState({}, "", path);
  render(<App />);
  // The sidebar mounts before the account's chats/projects resolve, so wait
  // for the list itself; every test starts from this same loaded state.
  await waitFor(() => {
    expect(screen.getByText("Scratch pad")).toBeTruthy();
  });
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  __resetChatPrefetchForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __resetChatPrefetchForTests();
});

describe("project folders in the app", () => {
  it("closes to the icon rail and reopens the full sidebar from it", async () => {
    const user = userEvent.setup();
    signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(screen.getByRole("button", { name: "Collapse Sidebar" }));
    const rail = document.querySelector(".sidebar-rail");
    await waitFor(() => {
      expect(document.querySelector(".sidebar").classList.contains("collapsed")).toBe(
        true,
      );
    });
    // A desktop app keeps the rail in place; the old floating control would
    // sit over the reading pane on top of it and is deliberately gone.
    expect(document.querySelector(".sidebar-toggle-btn")).toBeNull();
    expect(document.querySelector(".sidebar-full").getAttribute("aria-hidden")).toBe(
      "true",
    );

    await user.click(within(rail).getByRole("button", { name: "Open Sidebar" }));
    await waitFor(() => {
      expect(document.querySelector(".sidebar").classList.contains("collapsed")).toBe(
        false,
      );
    });
    expect(document.querySelector(".sidebar-full").getAttribute("aria-hidden")).toBe(
      null,
    );
  });

  it("shows the account's projects with their chats, and the rest under Chats", async () => {
    signedInAccount();
    await openApp("/chat/chat11111111");

    // The project holding the active chat is open, so it is never hidden.
    const folder = screen
      .getByRole("button", { name: "Open project Q4 launch" })
      .closest(".project-group");
    await waitFor(() => {
      expect(within(folder).getByText("Landing page")).toBeTruthy();
    });
    // The ungrouped chat stays in the plain list, outside the folder.
    expect(within(folder).queryByText("Scratch pad")).toBeNull();
    expect(screen.getByText("Scratch pad")).toBeTruthy();
  });

  it("creates a project through the API and shows it without a reload", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByPlaceholderText("Project name"), "Docs{Enter}");

    await waitFor(() => {
      expect(callsTo(calls, "/api/projects", "POST")).toHaveLength(1);
    });
    // The name the user typed is the name the account gets.
    expect(callsTo(calls, "/api/projects", "POST")[0].body).toEqual({
      name: "Docs",
    });
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open project Q4 launch" })).toBeTruthy();
  });

  it("renames a project through the API", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(
      screen.getByRole("button", { name: "Options for project Q4 launch" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByLabelText("Rename");
    await user.clear(input);
    await user.type(input, "Launch{Enter}");

    await waitFor(() => {
      expect(
        callsTo(calls, "/api/projects/proj11111111", "PATCH"),
      ).toHaveLength(1);
    });
    expect(callsTo(calls, "/api/projects/proj11111111", "PATCH")[0].body).toEqual(
      { name: "Launch" },
    );
    expect(screen.getByText("Launch")).toBeTruthy();
  });

  it("moves an ungrouped chat into a project through the API", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(screen.getByRole("button", { name: "Options for Scratch pad" }));
    await user.click(screen.getByRole("menuitem", { name: "Q4 launch" }));

    await waitFor(() => {
      expect(callsTo(calls, "/api/projects/proj11111111/chats", "PUT")).toHaveLength(
        1,
      );
    });
    // The right chat is the one filed into the folder.
    expect(
      callsTo(calls, "/api/projects/proj11111111/chats", "PUT")[0].body,
    ).toEqual({ chatId: "chat22222222" });
    // The chat now renders inside the folder, not in the plain list.
    const folder = screen
      .getByRole("button", { name: "Open project Q4 launch" })
      .closest(".project-group");
    await waitFor(() => {
      expect(within(folder).getByText("Scratch pad")).toBeTruthy();
    });
  });

  it("pulls a chat back out of its project through the API", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(screen.getByRole("button", { name: "Options for Landing page" }));
    await user.click(screen.getByRole("menuitem", { name: "No project" }));

    await waitFor(() => {
      expect(
        callsTo(
          calls,
          "/api/projects/proj11111111/chats/chat11111111",
          "DELETE",
        ),
      ).toHaveLength(1);
    });
    // The chat falls back to the plain list; the folder no longer holds it.
    const folder = screen
      .getByRole("button", { name: "Open project Q4 launch" })
      .closest(".project-group");
    await waitFor(() => {
      expect(within(folder).queryByText("Landing page")).toBeNull();
    });
    expect(screen.getByText("Landing page")).toBeTruthy();
  });

  it("reverts the grouping when the move is rejected", async () => {
    const user = userEvent.setup();
    signedInAccount({ failProjectChats: true });
    await openApp("/chat/chat11111111");

    await user.click(screen.getByRole("button", { name: "Options for Scratch pad" }));
    await user.click(screen.getByRole("menuitem", { name: "Q4 launch" }));

    // The folder is never shown as owning a chat the account does not have.
    const folder = screen
      .getByRole("button", { name: "Open project Q4 launch" })
      .closest(".project-group");
    await waitFor(() => {
      expect(within(folder).queryByText("Scratch pad")).toBeNull();
    });
    expect(screen.getByText("Scratch pad")).toBeTruthy();
  });

  it("deletes a project through the API and keeps its chats", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(
      screen.getByRole("button", { name: "Options for project Q4 launch" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(callsTo(calls, "/api/projects/proj11111111", "DELETE")).toHaveLength(1);
    });
    // The folder is gone and nothing deleted the chat itself.
    await waitFor(() => {
      expect(screen.queryByText("Q4 launch")).toBeNull();
    });
    expect(screen.getByText("Landing page")).toBeTruthy();
    expect(callsTo(calls, "/api/chats/chat11111111", "DELETE")).toHaveLength(0);
  });

  it("pins a chat through the API and moves it into Pinned", async () => {
    const user = userEvent.setup();
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    await user.click(
      screen.getByRole("button", { name: "Options for Scratch pad" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Pin" }));

    await waitFor(() => {
      expect(
        callsTo(calls, "/api/chats/chat22222222", "PATCH"),
      ).toHaveLength(1);
    });
    // Exactly the flag is sent: pinning must not smuggle a title in.
    expect(callsTo(calls, "/api/chats/chat22222222", "PATCH")[0].body).toEqual(
      { pinned: true },
    );

    // The Pinned section starts folded (the viewed chat is not pinned), so
    // open it to see the chat arrive.
    await user.click(screen.getByRole("button", { name: "Pinned" }));

    const pinnedList = document.getElementById("sidebar-pinned-list");
    expect(pinnedList).toBeTruthy();
    expect(within(pinnedList).getByText("Scratch pad")).toBeTruthy();
    // The chat left Recents for the Pinned section.
    const recents = document.getElementById("sidebar-chats-list");
    expect(within(recents).queryByText("Scratch pad")).toBeNull();
  });

  it("reorders chats through the API with neighbour ids", async () => {
    const calls = signedInAccount();
    await openApp("/chat/chat11111111");

    // Recents shows Scratch pad above Third note. Drag Third above Scratch.
    const scratch = screen.getByRole("button", {
      name: "Open conversation Scratch pad",
    });
    scratch.getBoundingClientRect = () => ({
      top: 100,
      bottom: 138,
      left: 0,
      right: 220,
      width: 220,
      height: 38,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const third = screen.getByRole("button", {
      name: "Open conversation Third note",
    });
    fireEvent.dragStart(
      third,
      new MouseEvent("dragstart", { bubbles: true, cancelable: true }),
    );
    fireEvent(
      scratch,
      new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY: 110 }),
    );
    fireEvent(
      scratch,
      new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 110 }),
    );

    await waitFor(() => {
      expect(callsTo(calls, "/api/chats/reorder", "POST")).toHaveLength(1);
    });
    // Exactly the drop position is sent: the chat, and what it lands before.
    expect(callsTo(calls, "/api/chats/reorder", "POST")[0].body).toEqual({
      chatId: "chat33333333",
      beforeId: "chat22222222",
      afterId: null,
    });

    // Optimistic: Third note already leads Recents before any refetch.
    const recents = document.getElementById("sidebar-chats-list");
    const titles = [...recents.querySelectorAll(".history-item-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Third note", "Scratch pad"]);
  });

  it("reverts the order when the reorder is rejected", async () => {
    const calls = signedInAccount({ failReorder: true });
    await openApp("/chat/chat11111111");

    const scratch = screen.getByRole("button", {
      name: "Open conversation Scratch pad",
    });
    scratch.getBoundingClientRect = () => ({
      top: 100,
      bottom: 138,
      left: 0,
      right: 220,
      width: 220,
      height: 38,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const third = screen.getByRole("button", {
      name: "Open conversation Third note",
    });
    fireEvent.dragStart(
      third,
      new MouseEvent("dragstart", { bubbles: true, cancelable: true }),
    );
    fireEvent(
      scratch,
      new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY: 110 }),
    );
    fireEvent(
      scratch,
      new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 110 }),
    );

    await waitFor(() => {
      expect(callsTo(calls, "/api/chats/reorder", "POST")).toHaveLength(1);
    });
    // Rejected: the sidebar shows the order the account actually has.
    await waitFor(() => {
      const recents = document.getElementById("sidebar-chats-list");
      const titles = [...recents.querySelectorAll(".history-item-title")].map(
        (el) => el.textContent,
      );
      expect(titles).toEqual(["Scratch pad", "Third note"]);
    });
  });
});
