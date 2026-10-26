// @vitest-environment jsdom
//
// The Sites screen: every published page in one place.
//
// A screenshot cannot pin the behaviour, so these tests do: the list comes from
// the server (not localStorage), Edit loads the OWNER copy of the documents and
// hands them to the shell to open a new chat, and unpublishing asks before it
// takes a live link down.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import Sites from "../src/pages/Sites.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

const PAGES = [
  {
    slug: "asyag23-123",
    url: "/asyag23-123",
    title: "Portfolio",
    createdAt: "2026-10-01T10:00:00.000Z",
    badge: true,
    customized: false,
    pages: 1,
    bytes: 4200,
  },
  {
    slug: "asyag23-456",
    url: "/asyag23-456",
    title: "Landing page",
    createdAt: "2026-09-20T10:00:00.000Z",
    badge: false,
    customized: true,
    pages: 0,
    bytes: 900,
  },
];

const OWNER_COPY = {
  slug: "asyag23-123",
  url: "/asyag23-123",
  title: "Portfolio",
  html: "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
  pages: {
    "about.html": "<!DOCTYPE html><html><body><h1>About</h1></body></html>",
  },
  badge: true,
  customized: false,
  createdAt: "2026-10-01T10:00:00.000Z",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Routes the endpoints this screen uses. Each call is recorded so a test can
 * assert on the exact request the screen made.
 */
function mockApi({
  pages = PAGES,
  ownerCopy = OWNER_COPY,
  ownerStatus = 200,
  ownerError = "owner copy unavailable",
} = {}) {
  const calls = { list: 0, ownerCopy: [], unpublish: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const target = String(url);
    const method = init.method || "GET";
    if (target === "/api/publish" && method === "GET") {
      calls.list += 1;
      return json({ pages, truncated: false });
    }
    if (target.startsWith("/api/publish/") && method === "GET") {
      calls.ownerCopy.push(target);
      if (ownerStatus !== 200) {
        return json({ error: ownerError }, ownerStatus);
      }
      return json(ownerCopy);
    }
    if (target.startsWith("/api/publish/") && method === "DELETE") {
      calls.unpublish.push(target);
      return json({ success: true, slug: target.split("/").pop() });
    }
    return json({ error: `unexpected ${method} ${target}` }, 404);
  });
  return calls;
}

function renderSites(props = {}) {
  return render(
    <I18nProvider>
      <Sites {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the Sites screen", () => {
  it("lists every published page from the server, not from this browser", async () => {
    const calls = mockApi();
    renderSites();

    expect(await screen.findByText("Portfolio")).toBeTruthy();
    expect(screen.getByText("Landing page")).toBeTruthy();
    // The address, the page count (home + sub-pages) and the size are shown.
    expect(screen.getByText("corez.pro/asyag23-123")).toBeTruthy();
    expect(screen.getByText("2 pages")).toBeTruthy();
    expect(screen.getByText("4.1 KB")).toBeTruthy();
    // The list is a server read: nothing was published locally to find.
    expect(calls.list).toBe(1);
  });

  it("shows an honest empty state before anything is published", async () => {
    mockApi({ pages: [] });
    renderSites();
    expect(await screen.findByText("Nothing published yet")).toBeTruthy();
    expect(
      screen.getByText(/Publish a creation from the preview canvas/i),
    ).toBeTruthy();
  });

  it("loads the owner copy and hands the whole site to a new chat", async () => {
    const calls = mockApi();
    const onEditSite = vi.fn().mockResolvedValue(true);
    renderSites({ onEditSite });
    await screen.findByText("Portfolio");

    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);

    await waitFor(() => expect(onEditSite).toHaveBeenCalledTimes(1));
    const page = onEditSite.mock.calls[0][0];
    expect(page).toMatchObject({
      slug: "asyag23-123",
      title: "Portfolio",
      html: OWNER_COPY.html,
    });
    expect(page.pages["about.html"]).toBe(OWNER_COPY.pages["about.html"]);
    expect(calls.ownerCopy).toEqual(["/api/publish/asyag23-123"]);
    // Editing no longer unfolds a second editor in the list.
    expect(screen.queryByRole("textbox", { name: /HTML/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: "about.html" })).toBeNull();
  });

  it("reports a failed owner-copy load and keeps the list usable", async () => {
    mockApi({ ownerStatus: 500, ownerError: "could not load owner copy" });
    const onEditSite = vi.fn();
    renderSites({ onEditSite });
    await screen.findByText("Portfolio");

    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "could not load owner copy",
    );
    expect(onEditSite).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole("button", { name: /^Edit$/ })[0].disabled,
    ).toBe(false);
  });

  it("reports a failed chat handoff instead of hiding it", async () => {
    mockApi();
    const onEditSite = vi
      .fn()
      .mockRejectedValue(new Error("could not open the chat"));
    renderSites({ onEditSite });
    await screen.findByText("Portfolio");

    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not open the chat",
    );
    expect(screen.getByText("Portfolio")).toBeTruthy();
  });

  it("asks before unpublishing a live link, and removes only that row", async () => {
    const calls = mockApi();
    renderSites();
    await screen.findByText("Portfolio");

    const card = screen.getByText("Portfolio").closest("li");
    const unpublish = within(card).getByRole("button", { name: /Unpublish/i });

    // First click only asks: a live public link is not removed by one slip.
    fireEvent.click(unpublish);
    expect(await within(card).findByText(/Click again to unpublish/i)).toBeTruthy();
    expect(calls.unpublish).toHaveLength(0);

    fireEvent.click(within(card).getByRole("button", { name: /Click again to unpublish/i }));

    await waitFor(() => expect(calls.unpublish).toEqual(["/api/publish/asyag23-123"]));
    await waitFor(() => expect(screen.queryByText("Portfolio")).toBeNull());
    // The other site is untouched.
    expect(screen.getByText("Landing page")).toBeTruthy();
  });

  it("can go back to the conversation", async () => {
    mockApi({ pages: [] });
    const onOpenChat = vi.fn();
    renderSites({ onOpenChat });
    await screen.findByText("Nothing published yet");
    fireEvent.click(screen.getByRole("button", { name: /Back to chat/i }));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
});
