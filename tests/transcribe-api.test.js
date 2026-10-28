// @vitest-environment node
//
// POST /api/transcribe runs Whisper on the account's own Workers AI binding.
// The route must require a signed-in user, bound the request, and never persist
// the audio.
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleTranscribe } from "../worker/transcribe.js";
import worker from "../worker/index.js";

const AUDIO = "QUJDRA==";

function request(body, url = "http://localhost/api/transcribe") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function envWith(run) {
  return {
    ENVIRONMENT: "test",
    AI: { run },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/transcribe", () => {
  it("is registered on the main worker route", async () => {
    const run = vi.fn().mockResolvedValue({ text: "routed" });
    const response = await worker.fetch(
      request({ audio: AUDIO }),
      envWith(run),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: "routed" });
  });

  it("returns the Whisper transcript", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "  make a plan  ",
      transcription_info: { language: "en" },
    });
    const response = await handleTranscribe(
      request({ audio: AUDIO, language: "en" }),
      envWith(run),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "make a plan",
      language: "en",
      model: "@cf/openai/whisper-large-v3-turbo",
    });
    expect(run).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({
        audio: AUDIO,
        task: "transcribe",
        language: "en",
        vad_filter: true,
      }),
    );
  });

  it("rejects a request without audio", async () => {
    const response = await handleTranscribe(
      request({}),
      envWith(vi.fn()),
    );
    expect(response.status).toBe(400);
  });

  it("requires authentication in production", async () => {
    const response = await handleTranscribe(
      request({ audio: AUDIO }, "https://corez.pro/api/transcribe"),
      { ENVIRONMENT: "production", AI: { run: vi.fn() } },
    );
    expect(response.status).toBe(401);
  });

  it("fails honestly when the model call fails", async () => {
    const run = vi.fn().mockRejectedValue(new Error("provider down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await handleTranscribe(
      request({ audio: AUDIO }),
      envWith(run),
    );
    expect(response.status).toBe(502);
  });

  it("rejects non-POST requests", async () => {
    const response = await handleTranscribe(
      new Request("http://localhost/api/transcribe"),
      envWith(vi.fn()),
    );
    expect(response.status).toBe(405);
  });
});
