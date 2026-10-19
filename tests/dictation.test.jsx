// @vitest-environment jsdom
//
// Voice dictation: the microphone only exists where the browser can recognise
// speech, it writes into the composer without ever clearing what was typed, and
// it stops with the message it wrote.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import ChatInput from "../src/components/ChatInput.jsx";
import {
  createDictationSession,
  dictationLanguage,
  isDictationSupported,
} from "../src/utils/dictation.js";

/** Minimal stand-in for the browser's SpeechRecognition. */
class FakeRecognition {
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
  /** Deliver one recognition event the way the browser does. */
  emit(results) {
    const list = results.map((entry) => {
      const result = { 0: { transcript: entry.transcript } };
      result.isFinal = Boolean(entry.isFinal);
      return result;
    });
    this.onresult?.({ resultIndex: 0, results: list });
  }
}
FakeRecognition.instances = [];

function installSpeechRecognition() {
  window.SpeechRecognition = FakeRecognition;
  return FakeRecognition;
}

afterEach(() => {
  cleanup();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  FakeRecognition.instances = [];
  vi.restoreAllMocks();
});

describe("dictation support detection", () => {
  it("reports no support in a browser without the API", () => {
    expect(isDictationSupported()).toBe(false);
    expect(createDictationSession()).toBeNull();
  });

  it("accepts the webkit-prefixed constructor too", () => {
    window.webkitSpeechRecognition = FakeRecognition;
    expect(isDictationSupported()).toBe(true);
  });

  it("uses the recognition language that matches the interface", () => {
    expect(dictationLanguage("ar")).toBe("ar-SA");
    expect(dictationLanguage("en")).toBe("en-US");
    expect(dictationLanguage(undefined)).toBe("en-US");
  });
});

describe("a dictation session", () => {
  it("streams final and interim text separately", () => {
    installSpeechRecognition();
    const seen = [];
    createDictationSession({
      language: "en",
      onTranscript: (result) => seen.push(result),
    });

    const recognition = FakeRecognition.instances[0];
    expect(recognition.lang).toBe("en-US");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.started).toBe(true);

    recognition.emit([{ transcript: "hello", isFinal: false }]);
    recognition.emit([{ transcript: "hello world", isFinal: true }]);
    recognition.emit([{ transcript: " again", isFinal: false }]);

    expect(seen).toEqual([
      { finalText: "", interimText: "hello" },
      { finalText: "hello world", interimText: "" },
      { finalText: "hello world", interimText: " again" },
    ]);
  });

  it("reports a refused microphone instead of pretending to listen", () => {
    installSpeechRecognition();
    const errors = [];
    createDictationSession({ onError: (error) => errors.push(error) });
    const recognition = FakeRecognition.instances[0];
    recognition.onerror({ error: "not-allowed" });
    expect(errors).toEqual(["not-allowed"]);
  });

  it("stops on request only once", () => {
    installSpeechRecognition();
    const session = createDictationSession({});
    const recognition = FakeRecognition.instances[0];
    session.stop();
    session.stop();
    expect(recognition.stopped).toBe(true);
  });
});

describe("the composer microphone", () => {
  function setup() {
    let value = "";
    const setInput = vi.fn((next) => {
      value = next;
    });
    const utils = render(
      <ChatInput
        input={value}
        setInput={setInput}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );
    const rerender = () =>
      utils.rerender(
        <ChatInput
          input={value}
          setInput={setInput}
          onSendMessage={() => {}}
          isStreaming={false}
        />,
      );
    return { setInput, rerender, value: () => value };
  }

  it("is absent where the browser cannot dictate", () => {
    render(
      <ChatInput input="" setInput={() => {}} onSendMessage={() => {}} isStreaming={false} />,
    );
    expect(screen.queryByLabelText("Dictate with your voice")).toBeNull();
  });

  it("offers voice input on the primary circle while there is nothing to send", () => {
    installSpeechRecognition();
    setup();
    const circle = screen.getByLabelText("Start voice input");
    expect(circle.classList.contains("voice-btn")).toBe(true);
    expect(circle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(circle);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0].started).toBe(true);
    // The microphone shows the listening state; the circle is named apart from
    // it so the two controls are never announced identically.
    expect(screen.getByLabelText("Stop dictation")).toBeTruthy();
    const listening = screen.getByLabelText("Stop voice input");
    expect(listening.classList.contains("is-listening")).toBe(true);
    expect(listening.getAttribute("aria-pressed")).toBe("true");
  });

  it("hands the circle back to send as soon as there is something to send", () => {
    installSpeechRecognition();
    const test = setup();
    expect(screen.queryByLabelText("Start voice input")).toBeTruthy();

    test.setInput("a real message");
    test.rerender();
    expect(screen.queryByLabelText("Start voice input")).toBeNull();
    expect(screen.getByTitle("Send Message")).toBeTruthy();
  });

  it("keeps a disabled send button where the browser cannot dictate", () => {
    setup();
    const send = screen.getByTitle("Send Message");
    expect(send.disabled).toBe(true);
    expect(send.classList.contains("voice-btn")).toBe(false);
  });

  it("writes the transcript into the composer and stops with it", () => {
    installSpeechRecognition();
    const test = setup();
    fireEvent.click(screen.getByLabelText("Dictate with your voice"));
    const recognition = FakeRecognition.instances[0];

    act(() => {
      recognition.emit([{ transcript: "make a plan", isFinal: false }]);
    });
    test.rerender();
    expect(test.value()).toBe("make a plan");

    // Pressing it again ends the session rather than starting a second one.
    fireEvent.click(screen.getByLabelText("Stop dictation"));
    expect(recognition.stopped).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("appends to a half-written message instead of replacing it", () => {
    installSpeechRecognition();
    let value = "draft: ";
    const setInput = vi.fn((next) => {
      value = next;
    });
    const { rerender } = render(
      <ChatInput
        input={value}
        setInput={setInput}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );
    rerender(
      <ChatInput
        input={value}
        setInput={setInput}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );

    fireEvent.click(screen.getByLabelText("Dictate with your voice"));
    const recognition = FakeRecognition.instances[0];
    act(() => {
      recognition.emit([{ transcript: "send the invoice", isFinal: true }]);
    });
    expect(value).toBe("draft: send the invoice");
  });
});
