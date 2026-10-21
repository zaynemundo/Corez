// @vitest-environment jsdom
//
// The Sites screen: every published page in one place, editable in place.
//
// A screenshot cannot pin the behaviour, so these tests do: the list comes from
// the server (not localStorage), editing loads the OWNER copy of the documents,
// saving republishes every page under the same slug, and unpublishing asks before
// it takes a live link down.
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
 * Routes the three endpoints this screen uses. Each call is recorded so a test
 * can assert on the exact request the screen made.
 */
function mockApi({ pages = PAGES, ownerCopy = OWNER_COPY, saveStatus = 200 } = {}) {
  const calls = { list: 0, ownerCopy: [], save: [], unpublish: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const target = String(url);
    const method = init.method || "GET";
    if (target === "/api/publish" && method === "GET") {
      calls.list += 1;
      return json({ pages, truncated: false });
    }
    if (target.startsWith("/api/publish/") && method === "GET") {
      calls.ownerCopy.push(target);
      return json(ownerCopy);
    }
    if (target === "/api/publish" && method === "POST") {
      calls.save.push(JSON.parse(init.body));
      if (saveStatus !== 200) return json({ error: "save failed" }, saveStatus);
      return json({ slug: ownerCopy.slug, url: ownerCopy.url });
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

  it("opens the owner copy for editing, home page first", async () => {
    const calls = mockApi();
    renderSites();
    await screen.findByText("Portfolio");

    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);

    // The editor loads the raw document (with the injected badge stripped by the
    // worker, which is what the mock returns here).
    const code = await screen.findByRole("textbox", { name: /Home HTML/i });
    expect(code.value).toBe(OWNER_COPY.html);
    expect(calls.ownerCopy).toEqual(["/api/publish/asyag23-123"]);
    // A multi-page site exposes its other pages as tabs, so the editor never
    // silently drops them on save.
    expect(screen.getByRole("tab", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "about.html" })).toBeTruthy();
  });

  it("saves an edited page back under the same slug, with every page", async () => {
    const calls = mockApi();
    renderSites();
    await screen.findByText("Portfolio");
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);

    const code = await screen.findByRole("textbox", { name: /Home HTML/i });
    fireEvent.change(code, {
      target: { value: "<!DOCTYPE html><html><body><h1>Edited</h1></body></html>" },
    });

    // A sub-page edit too: both must travel together in one publish.
    fireEvent.click(screen.getByRole("tab", { name: "about.html" }));
    const subCode = screen.getByRole("textbox", { name: /about\.html HTML/i });
    fireEvent.change(subCode, {
      target: { value: "<!DOCTYPE html><html><body><h1>About v2</h1></body></html>" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(calls.save).toHaveLength(1));
    const body = calls.save[0];
    expect(body.slug).toBe("asyag23-123");
    expect(body.html).toContain("Edited");
    expect(body.pages["about.html"]).toContain("About v2");
    // The edit is not attributed to a chat; the worker keeps any existing
    // lineage on the record.
    expect(body.sessionId).toBeUndefined();

    // The list refreshes, and the row says it saved.
    await waitFor(() => expect(calls.list).toBe(2));
    expect(await screen.findByText(/your page is live/i)).toBeTruthy();
  });

  it("reports a failed save instead of pretending it worked", async () => {
    mockApi({ saveStatus: 500 });
    renderSites();
    await screen.findByText("Portfolio");
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[0]);
    await screen.findByRole("textbox", { name: /Home HTML/i });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "save failed",
    );
    expect(screen.queryByText(/your page is live/i)).toBeNull();
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
