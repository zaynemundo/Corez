import { consumeSse } from "../sse";

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

describe("consumeSse", () => {
  it("accumulates delta and thinking events across chunk boundaries", async () => {
    const deltas: string[] = [];
    const thoughts: string[] = [];
    const done = jest.fn();
    const response = sseResponse([
      'data: {"type":"thinking","te',
      'xt":"plan the answer"}\n\n',
      'data: {"type":"delta","text":"Hel"}\n\n',
      'data: {"type":"delta","text":"lo"}\n\n',
      'data: {"type":"done","ok":true}\n\n',
    ]);

    const result = await consumeSse(response, {
      onDelta: (text) => deltas.push(text),
      onThinking: (text) => thoughts.push(text),
      onDone: done,
    });

    expect(result.text).toBe("Hello");
    expect(result.thinking).toBe("plan the answer");
    expect(result.sawDone).toBe(true);
    expect(result.doneEvent).toMatchObject({ type: "done", ok: true });
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(thoughts).toEqual(["plan the answer"]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("handles a final event with no trailing newline", async () => {
    const result = await consumeSse(
      sseResponse(['data: {"type":"done","ok":true}']),
    );
    expect(result.sawDone).toBe(true);
  });

  it("reports a stream that ended without a done event as incomplete", async () => {
    const result = await consumeSse(
      sseResponse(['data: {"type":"delta","text":"partial"}']),
    );
    expect(result.text).toBe("partial");
    expect(result.sawDone).toBe(false);
    expect(result.errorEvent).toBeNull();
  });

  it("captures error events with retryability", async () => {
    const onError = jest.fn();
    const result = await consumeSse(
      sseResponse([
        'data: {"type":"error","message":"Upstream busy","retryable":true}\n\n',
      ]),
      { onError },
    );
    expect(result.errorEvent).toEqual({
      message: "Upstream busy",
      retryable: true,
    });
    expect(onError).toHaveBeenCalledWith({
      message: "Upstream busy",
      retryable: true,
    });
  });

  it("ignores comments, blank lines and malformed JSON", async () => {
    const result = await consumeSse(
      sseResponse([
        ": keep-alive\n\n",
        'data: {"type":"phase","phase":"building"}\n\n',
        "data: not-json\n\n",
        'data: {"type":"delta","text":"ok"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );
    expect(result.text).toBe("ok");
    expect(result.sawDone).toBe(true);
  });

  it("throws when the response has no body", async () => {
    const response = new Response(null, { status: 200 });
    await expect(consumeSse(response)).rejects.toThrow(/stream a response body/i);
  });
});
