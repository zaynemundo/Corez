// @vitest-environment jsdom
//
// Voice dictation records a short clip with MediaRecorder, sends it to
// /api/transcribe, and appends the Whisper text to the composer. The
// microphone only exists where recording is actually available.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import ChatInput from "../src/components/ChatInput.jsx";
import {
  createDictationSession,
  dictationLanguage,
  isDictationSupported,
} from "../src/utils/dictation.js";

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported() {
    return true;
  }

  constructor(stream, options) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "audio/webm";
    this.state = "inactive";
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.onstop?.();
  }

  emitAudio(type = "audio/webm") {
    const data = new Blob(["ABCD"], { type });
    this.ondataavailable?.({ data });
    return data;
  }
}

let originalMediaDevices;
let originalMediaRecorder;

function installSupport({ getUserMedia } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const gum = getUserMedia || vi.fn().mockResolvedValue(stream);
  originalMediaDevices = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  originalMediaRecorder = window.MediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: gum },
  });
  window.MediaRecorder = FakeMediaRecorder;
  FakeMediaRecorder.instances = [];
  return { gum, stream, track };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  FakeMediaRecorder.instances = [];
  delete window.MediaRecorder;
  if (originalMediaRecorder !== undefined) {
    window.MediaRecorder = originalMediaRecorder;
  }
  if (originalMediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  } else {
    delete navigator.mediaDevices;
  }
  originalMediaDevices = undefined;
  originalMediaRecorder = undefined;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("dictation support detection", () => {
  it("reports no support without MediaRecorder/getUserMedia", () => {
    expect(isDictationSupported()).toBe(false);
    expect(createDictationSession()).toBeNull();
  });

  it("accepts a browser with both recording APIs", () => {
    installSupport();
    expect(isDictationSupported()).toBe(true);
  });

  it("uses Whisper language codes", () => {
    expect(dictationLanguage("ar")).toBe("ar");
    expect(dictationLanguage("en")).toBe("en");
    expect(dictationLanguage(undefined)).toBe("en");
  });
});

describe("a dictation session", () => {
  it("records, transcribes and releases the microphone", async () => {
    const { track } = installSupport();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ text: "make a plan" }));
    const transcripts = [];
    const ends = [];
    const session = createDictationSession({
      language: "en",
      onTranscript: (text) => transcripts.push(text),
      onEnd: () => ends.push(true),
    });

    await waitFor(() => {
      expect(FakeMediaRecorder.instances).toHaveLength(1);
    });
    const recorder = FakeMediaRecorder.instances[0];
    recorder.emitAudio();
    session.stop();

    await waitFor(() => {
      expect(transcripts).toEqual(["make a plan"]);
      expect(ends).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.audio).toBe("QUJDRA==");
    expect(sent.language).toBe("en");
    expect(track.stop).toHaveBeenCalled();
  });

  it("surfaces a refused microphone without leaving a session running", async () => {
    installSupport({
      getUserMedia: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("denied"), { name: "NotAllowedError" }),
        ),
    });
    const errors = [];
    createDictationSession({ onError: (error) => errors.push(error) });

    await waitFor(() => {
      expect(errors).toEqual(["NotAllowedError"]);
    });
  });
});

describe("the composer microphone", () => {
  function setup(initial = "") {
    let value = initial;
    const setInput = vi.fn((next) => {
      value = typeof next === "function" ? next(value) : next;
    });
    const utils = render(
      <ChatInput
        input={value}
        setInput={setInput}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );
    return {
      setInput,
      value: () => value,
      rerender: () =>
        utils.rerender(
          <ChatInput
            input={value}
            setInput={setInput}
            onSendMessage={() => {}}
            isStreaming={false}
          />,
        ),
    };
  }

  it("is absent where recording is unavailable", () => {
    setup();
    expect(screen.queryByLabelText("Dictate with your voice")).toBeNull();
  });

  it("marks the listening state, then inserts the transcript", async () => {
    installSupport();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ text: "make a plan" }));
    const test = setup();

    fireEvent.click(screen.getByLabelText("Dictate with your voice"));
    await waitFor(() => {
      expect(FakeMediaRecorder.instances).toHaveLength(1);
    });
    expect(screen.getByLabelText("Stop dictation")).toBeTruthy();

    const recorder = FakeMediaRecorder.instances[0];
    recorder.emitAudio();
    fireEvent.click(screen.getByLabelText("Stop dictation"));

    await waitFor(() => {
      expect(test.value()).toBe("make a plan");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    test.rerender();
    expect(screen.getByTitle("Send Message")).toBeTruthy();
    expect(screen.queryByLabelText("Dictate with your voice")).toBeNull();
  });

  it("switches from dictate to send as soon as there is text", () => {
    installSupport();
    const test = setup();
    const textarea = screen.getByPlaceholderText("Ask Corez...");

    expect(screen.getByLabelText("Dictate with your voice")).toBeTruthy();
    expect(screen.queryByTitle("Send Message")).toBeNull();

    fireEvent.change(textarea, { target: { value: "draft message" } });
    test.rerender();

    expect(screen.getByTitle("Send Message")).toBeTruthy();
    expect(screen.queryByLabelText("Dictate with your voice")).toBeNull();

    fireEvent.change(textarea, { target: { value: "" } });
    test.rerender();

    expect(screen.getByLabelText("Dictate with your voice")).toBeTruthy();
  });

  it("disables the action while Whisper is transcribing", async () => {
    installSupport();
    let resolveFetch;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(pending);
    const test = setup();

    fireEvent.click(screen.getByLabelText("Dictate with your voice"));
    await waitFor(() => {
      expect(FakeMediaRecorder.instances).toHaveLength(1);
    });
    FakeMediaRecorder.instances[0].emitAudio();
    fireEvent.click(screen.getByLabelText("Stop dictation"));

    await waitFor(() => {
      expect(screen.getByLabelText("Transcribing your voice…")).toBeTruthy();
    });
    expect(screen.getByLabelText("Transcribing your voice…").disabled).toBe(
      true,
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    await act(async () => {
      resolveFetch(jsonResponse({ text: "and more" }));
    });
    await waitFor(() => {
      expect(test.value()).toBe("and more");
    });
    test.rerender();
    expect(screen.getByTitle("Send Message")).toBeTruthy();
  });

  it("keeps the primary circle as the send action", () => {
    installSupport();
    setup("a real message");
    const send = screen.getByTitle("Send Message");
    expect(send.classList.contains("voice-btn")).toBe(false);
    expect(send.disabled).toBe(false);
  });
});
