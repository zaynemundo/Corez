import { requestJson } from "../client";
import {
  createChatShare,
  getChatShare,
  getSharedChat,
  revokeChatShare,
} from "../shareChat";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("shared conversation API", () => {
  it("loads a public snapshot by encoded token", async () => {
    requestMock.mockResolvedValueOnce({ version: 1, messages: [] });
    await getSharedChat("tok/en");
    expect(requestMock).toHaveBeenCalledWith("/api/share/chat/tok%2Fen", {
      method: "GET",
      timeoutMs: 20_000,
    });
  });

  it("rejects a missing token without calling the API", async () => {
    await expect(getSharedChat(" ")).rejects.toThrow(/token is required/i);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("checks the owner's share state", async () => {
    requestMock.mockResolvedValueOnce({ shared: false });
    await expect(getChatShare("chat-1")).resolves.toEqual({ shared: false });
    expect(requestMock).toHaveBeenCalledWith("/api/chats/chat-1/share", {
      method: "GET",
    });
  });

  it("creates a share and returns its URL", async () => {
    requestMock.mockResolvedValueOnce({
      shared: true,
      token: "tok",
      url: "https://corez.pro/share/chat/tok",
    });
    const result = await createChatShare("chat-1");
    expect(result.url).toBe("https://corez.pro/share/chat/tok");
    expect(requestMock).toHaveBeenCalledWith("/api/chats/chat-1/share", {
      method: "POST",
      timeoutMs: 30_000,
    });
  });

  it("fails honestly when the share response has no link", async () => {
    requestMock.mockResolvedValueOnce({ shared: true });
    await expect(createChatShare("chat-1")).rejects.toThrow(
      /did not return a link/i,
    );
  });

  it("revokes a share", async () => {
    requestMock.mockResolvedValueOnce({ shared: false });
    await revokeChatShare("chat-1");
    expect(requestMock).toHaveBeenCalledWith("/api/chats/chat-1/share", {
      method: "DELETE",
    });
  });

  it("requires a chat id for owner operations", async () => {
    await expect(createChatShare("")).rejects.toThrow(/chat id is required/i);
    await expect(revokeChatShare("")).rejects.toThrow(/chat id is required/i);
  });
});
