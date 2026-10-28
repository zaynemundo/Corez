// @vitest-environment jsdom
//
// A shared chat is a public, read-only page. It must render the transcript
// without the owner's message actions, composer or sidebar.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SharedChat from "../src/pages/SharedChat.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

function renderShared(path = "/share/chat/share-token") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/chat/:token" element={<SharedChat />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a shared conversation", () => {
  it("renders the transcript read-only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Shared pottery notes",
          messages: [
            { role: "user", content: "Show me the glazing notes." },
            { role: "assistant", content: "Here is the summary." },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { container } = renderShared();

    await waitFor(() => {
      expect(screen.getByText("Shared pottery notes")).toBeTruthy();
    });
    expect(screen.getByText("Show me the glazing notes.")).toBeTruthy();
    expect(screen.getByText("Here is the summary.")).toBeTruthy();
    expect(container.querySelector(".message-actions")).toBeNull();
    expect(container.querySelector(".chat-textarea")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/share/chat/share-token",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("explains an unavailable link instead of rendering an empty chat", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Shared chat not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderShared();

    await waitFor(() => {
      expect(screen.getByText("This shared chat is unavailable")).toBeTruthy();
    });
    expect(screen.getByText(/may have been stopped/i)).toBeTruthy();
  });
});
