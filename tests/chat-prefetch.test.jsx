// @vitest-environment jsdom
//
// The chat requests must not wait for the session check.
//
// `MainApp` — which owns the chat fetches — does not mount until `/api/auth/me`
// answers, so a cold load used to pay `bundle → /api/auth/me → /api/chats` in
// series. The Worker authorises the chat routes from the `corez_session` cookie
// itself, so the identity the check returns is not an input to them, and the
// requests can start in parallel. These tests pin that: the requests go out
// while the check is still in flight, each one is issued exactly once, and the
// public routes (which render without the check and have no chats to show) do
// not prefetch at all.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import App from "../src/App.jsx";
import { __resetChatPrefetchForTests } from "../src/services/chatPrefetch.js";

const SESSION_MARKER = "/api/auth/me";
const CHAT_ID = "abc123";

/** A promise the test settles by hand, so the check can be held open. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Records every request and holds the session check open until the test says
 * otherwise. Chat routes answer immediately, so their arrival order is the
 * only thing under test.
 */
function heldSessionCheck() {
  const session = deferred();
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes(SESSION_MARKER)) return session.promise;
    if (target.includes(`/api/chats/${CHAT_ID}`)) {
      return Promise.resolve(
        json({ id: CHAT_ID, title: "Prefetched", messages: [] }),
      );
    }
    if (target.includes("/api/chats")) {
      return Promise.resolve(json({ chats: [] }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return { session, calls };
}

/** Path only: "/api/chats" is a prefix of "/api/chats/<id>", so counting by
 *  substring would fold the two routes together. */
const pathOf = (url) => {
  try {
    return new URL(String(url), "https://corez.test").pathname;
  } catch {
    return String(url);
  }
};
const listCalls = (calls) =>
  calls.filter((url) => pathOf(url) === "/api/chats").length;
const chatCalls = (calls, id) =>
  calls.filter((url) => pathOf(url) === `/api/chats/${id}`).length;
const sessionCalls = (calls) =>
  calls.filter((url) => pathOf(url) === SESSION_MARKER).length;

async function openAt(path) {
  window.history.pushState({}, "", path);
  render(<App />);
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

describe("chat requests do not wait for the session check", () => {
  it("sends both chat requests while the check is still in flight", async () => {
    const { session, calls } = heldSessionCheck();
    await openAt(`/chat/${CHAT_ID}`);

    // The check is still open — the interface is on its loading state…
    expect(screen.getByText(/loading corez/i)).toBeTruthy();

    // …and the chat requests have already gone out anyway.
    await waitFor(() => {
      expect(chatCalls(calls, CHAT_ID)).toBe(1);
    });
    expect(listCalls(calls)).toBe(1);
    expect(sessionCalls(calls)).toBe(1);

    // Settling the check still enters the app on the prefetched data.
    await act(async () => {
      session.resolve(json({ user: { id: "u1", email: "a@b.co" } }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/loading corez/i)).toBeNull();
    });
  });

  it("issues each chat request exactly once, prefetch or not", async () => {
    const { session, calls } = heldSessionCheck();
    await openAt(`/chat/${CHAT_ID}`);

    await act(async () => {
      session.resolve(json({ user: { id: "u1", email: "a@b.co" } }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/loading corez/i)).toBeNull();
    });

    // A second fetch would mean MainApp ignored the in-flight promise.
    expect(chatCalls(calls, CHAT_ID)).toBe(1);
    expect(listCalls(calls)).toBe(1);
  });

  it("does not prefetch on public routes", async () => {
    const { calls } = heldSessionCheck();
    await openAt("/pricing");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
        /plans that grow with you/i,
      );
    });

    // The check still runs on every load — it just does not block this page.
    // What must not happen is a chat request for a visitor who has no chats to
    // show and is not waiting on them.
    expect(listCalls(calls)).toBe(0);
    expect(chatCalls(calls, CHAT_ID)).toBe(0);
  });

  it("does not hand a stale anonymous prefetch to a visitor who then signs in", async () => {
    // The prefetch is a bet that the visitor is signed in. Boot signed out so
    // the bet loses: both chat requests go out and come back 401.
    const calls = [];
    let signedIn = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const target = String(url);
      calls.push(target);
      if (pathOf(target) === SESSION_MARKER) {
        return Promise.resolve(
          signedIn
            ? json({ user: { id: "u1", email: "a@b.co" } })
            : json({ error: "Not authenticated" }, 401),
        );
      }
      if (pathOf(target) === "/api/auth/login") {
        signedIn = true;
        return Promise.resolve(json({ user: { id: "u1", email: "a@b.co" } }));
      }
      if (pathOf(target) === "/api/chats") {
        // Only a signed-in visitor may see chats, exactly as the Worker
        // behaves: no session cookie means a 401 with no database work.
        return Promise.resolve(
          signedIn
            ? json({ chats: [{ id: "c1", title: "Real chat" }] })
            : json({ error: "Not authenticated" }, 401),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    await openAt("/");
    // The check answered "not signed in", so the interface is the sign-in form.
    await waitFor(() => {
      expect(screen.getByPlaceholderText("you@corez.pro")).toBeTruthy();
    });
    const anonymousCalls = listCalls(calls);
    expect(anonymousCalls).toBe(1);

    // Sign in through the app's own form, so MainApp mounts the way it really
    // does after a login.
    fireEvent.change(screen.getByPlaceholderText("you@corez.pro"), {
      target: { value: "alice@corez.pro" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "CorrectPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Login$/i }));

    // The account's chats must be asked for again. Replaying the prefetched 401
    // instead would leave the list on its localStorage fallback — an empty
    // sidebar for a visitor who does have chats.
    await waitFor(() => {
      expect(screen.getByText("Real chat")).toBeTruthy();
    });
    expect(listCalls(calls)).toBe(2);
  });
});
