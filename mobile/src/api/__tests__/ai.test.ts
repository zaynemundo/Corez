import { ApiError, rawRequest } from "../client";
import { streamChatTurn } from "../ai";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, rawRequest: jest.fn() };
});

const rawMock = rawRequest as jest.MockedFunction<typeof rawRequest>;
const encoder = new TextEncoder();

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  rawMock.mockReset();
});

describe("streamChatTurn", () => {
  it("posts the prompt with stream:true and returns the accumulated answer", async () => {
    rawMock.mockResolvedValue(
      sseResponse([
        'data: {"type":"thinking","text":"keep it short"}\n\n',
        'data: {"type":"delta","text":"Hello"}\n\n',
        'data: {"type":"delta","text":" there"}\n\n',
        'data: {"type":"done","ok":true}\n\n',
      ]),
    );

    const result = await streamChatTurn({
      prompt: "hi",
      messages: [{ role: "user", content: "earlier" }],
    });

    const [path, options] = rawMock.mock.calls[0];
    expect(path).toBe("/api/ai");
    expect(options?.method).toBe("POST");
    expect(options?.timeoutMs).toBe(0);
    expect(options?.body).toMatchObject({
      prompt: "hi",
      stream: true,
      messages: [{ role: "user", content: "earlier" }],
    });
    expect(result.text).toBe("Hello there");
    expect(result.thinking).toBe("keep it short");
    expect(result.sawDone).toBe(true);
  });

  it("surfaces a retry-scheduled JSON acceptance instead of an empty stream", async () => {
    rawMock.mockResolvedValue(
      jsonResponse({
        taskId: "task-1",
        status: "retry-scheduled",
        retryAfterSeconds: 9,
      }),
    );

    const result = await streamChatTurn({ prompt: "build me a site" });

    expect(result.retryScheduled).toEqual({
      taskId: "task-1",
      retryAfterSeconds: 9,
    });
    expect(result.text).toBe("");
    expect(result.sawDone).toBe(false);
  });

  it("accepts a non-streamed JSON answer", async () => {
    rawMock.mockResolvedValue(jsonResponse({ content: "Plain answer" }));

    const result = await streamChatTurn({ prompt: "hello" });

    expect(result.text).toBe("Plain answer");
    expect(result.sawDone).toBe(true);
  });

  it("raises the server's HTTP error", async () => {
    rawMock.mockResolvedValue(
      jsonResponse({ error: "Authentication required. Please log in." }, 401),
    );

    await expect(streamChatTurn({ prompt: "hi" })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Authentication required. Please log in.",
    });
  });

  it("propagates handler callbacks while streaming", async () => {
    rawMock.mockResolvedValue(
      sseResponse([
        'data: {"type":"phase","phase":"building"}\n\n',
        'data: {"type":"delta","text":"x"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );
    const onDelta = jest.fn();
    const onPhase = jest.fn();

    await streamChatTurn({ prompt: "hi" }, { onDelta, onPhase });

    expect(onDelta).toHaveBeenCalledWith("x");
    expect(onPhase).toHaveBeenCalledWith({ type: "phase", phase: "building" });
  });

  it("is an ApiError instance for callers that branch on status", async () => {
    rawMock.mockResolvedValue(jsonResponse({ error: "rate limited" }, 429));
    await expect(streamChatTurn({ prompt: "hi" })).rejects.toBeInstanceOf(ApiError);
  });
});
