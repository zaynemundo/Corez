import {
  appendMessage,
  createChat,
  deriveChatTitle,
  getChat,
  listChats,
  patchChatTitle,
} from "../chats";
import { requestJson } from "../client";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("chat persistence API", () => {
  it("lists chats and tolerates a missing chats array", async () => {
    requestMock.mockResolvedValueOnce({ chats: [{ id: "c1", title: "One" }] });
    await expect(listChats()).resolves.toEqual({
      chats: [{ id: "c1", title: "One" }],
    });

    requestMock.mockResolvedValueOnce({});
    await expect(listChats()).resolves.toEqual({ chats: [] });
  });

  it("creates a chat with the first message", async () => {
    requestMock.mockResolvedValueOnce({ id: "c2", title: "Landing page" });
    const created = await createChat({
      title: "Landing page",
      firstMessage: { role: "user", content: "build a landing page" },
    });

    expect(created.id).toBe("c2");
    expect(requestMock).toHaveBeenCalledWith("/api/chats", {
      method: "POST",
      body: {
        title: "Landing page",
        firstMessage: { role: "user", content: "build a landing page" },
      },
    });
  });

  it("loads one chat with its messages", async () => {
    requestMock.mockResolvedValueOnce({
      id: "c3",
      title: "History",
      messages: [{ id: "m1", role: "user", content: "hello" }],
    });

    const chat = await getChat("c3");
    expect(chat.messages).toHaveLength(1);
    expect(requestMock).toHaveBeenCalledWith("/api/chats/c3", { method: "GET" });
  });

  it("appends a message and patches a title", async () => {
    requestMock.mockResolvedValue({ success: true });

    await appendMessage("c4", { role: "assistant", content: "answer" });
    expect(requestMock).toHaveBeenCalledWith("/api/chats/c4/messages", {
      method: "POST",
      body: { role: "assistant", content: "answer" },
    });

    await patchChatTitle("c4", "New title");
    expect(requestMock).toHaveBeenCalledWith("/api/chats/c4", {
      method: "PATCH",
      body: { title: "New title" },
    });
  });

  it("encodes chat ids in the path", async () => {
    requestMock.mockResolvedValueOnce({ id: "a/b", messages: [] });
    await getChat("a/b");
    expect(requestMock).toHaveBeenCalledWith("/api/chats/a%2Fb", {
      method: "GET",
    });
  });
});

describe("deriveChatTitle", () => {
  it("strips a leading command and flattens whitespace", () => {
    expect(deriveChatTitle("@website   a coffee shop\nlanding page")).toBe(
      "a coffee shop landing page",
    );
  });

  it("truncates long prompts and never returns an empty title", () => {
    expect(deriveChatTitle("x".repeat(200)).length).toBeLessThanOrEqual(60);
    expect(deriveChatTitle("   ")).toBe("New chat");
  });
});
