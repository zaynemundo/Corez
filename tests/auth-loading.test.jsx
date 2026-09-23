// @vitest-environment jsdom
//
// The session check is the first thing every cold load does, and it used to be
// able to hold the whole interface hostage:
//  - no time limit, so a stalled /api/auth/me left the visitor on "Loading Corez…"
//    forever (only a settled fetch ever cleared it);
//  - every route waited, including /pricing and the policies, which do not need
//    the answer to render;
//  - a network error was reported as "signed out", silently dropping a signed-in
//    user on the sign-in form with no explanation and no way to retry.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import App from "../src/App.jsx";

const SESSION_MARKER = "/api/auth/me";

/** A fetch that never answers — the stalled connection this suite is about. */
function stalledSessionCheck() {
  const pending = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    if (String(url).includes(SESSION_MARKER)) {
      return new Promise((resolve) => pending.push(resolve));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return pending;
}

function failingSessionCheck() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).includes(SESSION_MARKER)) {
      throw new TypeError("NetworkError when attempting to fetch resource.");
    }
    return new Response(null, { status: 404 });
  });
}

function signedInFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes(SESSION_MARKER)) {
      return new Response(JSON.stringify({ user: { id: "u1", email: "a@b.co" } }), {
        status: 200,
      });
    }
    if (target.includes("/api/chats")) {
      return new Response(JSON.stringify({ chats: [] }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

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
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the session check cannot hold the interface hostage", () => {
  it("stops waiting after its time limit instead of spinning forever", async () => {
    stalledSessionCheck();
    await openAt("/");

    // While the check is in flight the wait is announced, as before.
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText(/loading corez/i)).toBeTruthy();

    // Past the time limit the app stops waiting and says what it does not know.
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });

    await waitFor(() => {
      expect(screen.queryByText(/loading corez/i)).toBeNull();
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/couldn't check your session/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("reports an unreachable server as unknown, not as signed out", async () => {
    failingSessionCheck();
    await openAt("/");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    // The sign-in form must NOT be the answer to a failed check: it would claim
    // the visitor is signed out, which was never established.
    expect(screen.queryByRole("heading", { level: 1 })?.textContent).not.toBe(
      "COREZ",
    );
  });

  it("renders public pages immediately, without waiting for the check", async () => {
    stalledSessionCheck();
    await openAt("/pricing");

    // No spinner: the pricing page does not depend on who the visitor is.
    expect(screen.queryByText(/loading corez/i)).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
        /plans that grow with you/i,
      );
    });
  });

  it("enters the app after a retry once the server answers", async () => {
    const pending = stalledSessionCheck();
    await openAt("/");

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    });

    // The retry re-asks; this time the server answers with an account.
    vi.restoreAllMocks();
    signedInFetch();
    await act(async () => {
      screen.getByRole("button", { name: /retry/i }).click();
    });

    await waitFor(() => {
      expect(screen.getByText(/new chat/i)).toBeTruthy();
    });
    expect(pending.length).toBe(1);
  });
});
