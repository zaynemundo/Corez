// @vitest-environment jsdom
//
// The sidebar's share dialog creates and revokes a public transcript link.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ChatShareModal from "../src/components/ChatShareModal.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the chat share dialog", () => {
  it("creates a link, shows it, and can stop sharing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ shared: false }))
      .mockResolvedValueOnce(
        json({
          shared: true,
          url: "https://corez.pro/share/chat/abc123",
          title: "Pottery notes",
        }),
      )
      .mockResolvedValueOnce(json({ shared: false }));

    render(
      <I18nProvider>
        <ChatShareModal chatId="chat-1" onClose={() => {}} />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Create public link")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Create public link"));

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://corez.pro/share/chat/abc123"),
      ).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/chats/chat-1/share",
      { method: "POST" },
    );

    fireEvent.click(screen.getByText("Stop sharing"));
    await waitFor(() => {
      expect(screen.getByText("Create public link")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/chats/chat-1/share",
      { method: "DELETE" },
    );
  });

  it("shows an existing link when the chat is already shared", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        shared: true,
        url: "https://corez.pro/share/chat/existing",
        title: "Existing share",
      }),
    );

    render(
      <I18nProvider>
        <ChatShareModal chatId="chat-1" onClose={() => {}} />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("https://corez.pro/share/chat/existing"),
      ).toBeTruthy();
    });
    expect(screen.getByText("Stop sharing")).toBeTruthy();
  });
});
