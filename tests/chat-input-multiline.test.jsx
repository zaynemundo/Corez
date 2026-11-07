// @vitest-environment jsdom
//
// Long prompts switch the composer to the ChatGPT-style layout: the text keeps
// the full width on top, while the attach and send controls drop to a bottom
// row. The one-line composer keeps its original flex row and pill shape.
//
// jsdom has no text layout, so the canvas measurement and the composer's box
// metrics are stubbed: a prompt costs 7px per character beside the controls
// (436px below), and the canvas font can be made wider to stand in for the
// hero composer's larger text. That keeps the regressions that mattered
// covered here: a long prompt flipping the composer between the two shapes
// because the wider multiline field made it "fit" again, and the fit not being
// re-measured when the composer's width or font changes.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import ChatInput from "../src/components/ChatInput.jsx";

const ATTACH_WIDTH_PX = 30;
const ACTIONS_WIDTH_PX = 34;

// Mutable jsdom stand-ins: tests move them to simulate a pane resize, a longer
// prompt, or a different composer font.
let formWidth;
let contentHeight;
let charWidth;
let resizeObserverCallback;

function ownDescriptorInChain(proto, name) {
  let current = proto;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return { owner: current, descriptor };
    current = Object.getPrototypeOf(current);
  }
  return null;
}

function stubGetters(getters) {
  const saved = Object.entries(getters).map(([name]) => ({
    name,
    found: ownDescriptorInChain(HTMLElement.prototype, name),
  }));
  for (const [name, get] of Object.entries(getters)) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get,
    });
  }
  return () => {
    for (const { name, found } of saved) {
      delete HTMLElement.prototype[name];
      if (found && found.owner === HTMLElement.prototype) {
        Object.defineProperty(HTMLElement.prototype, name, found.descriptor);
      }
    }
  };
}

// jsdom reports every element as zero-sized. The component reads the form's
// clientWidth, the two controls' offsetWidth and the textarea's scrollHeight;
// these hooks replace exactly those. The originals are restored from wherever
// jsdom defines them (clientWidth/scrollHeight on Element.prototype,
// offsetWidth on HTMLElement.prototype).
function stubComposerLayout() {
  return stubGetters({
    clientWidth() {
      if (this.classList?.contains("input-box")) return formWidth;
      if (this.classList?.contains("chat-textarea")) {
        const widened = this.closest("form")?.classList.contains("is-multiline");
        return widened
          ? formWidth
          : formWidth - ATTACH_WIDTH_PX - ACTIONS_WIDTH_PX;
      }
      return 0;
    },
    offsetWidth() {
      if (this.classList?.contains("attach-btn")) return ATTACH_WIDTH_PX;
      if (this.classList?.contains("input-actions-bar")) return ACTIONS_WIDTH_PX;
      return 0;
    },
    scrollHeight() {
      return this.classList?.contains("chat-textarea") ? contentHeight : 0;
    },
  });
}

class RecordingResizeObserver {
  constructor(callback) {
    resizeObserverCallback = callback;
  }
  observe() {}
  disconnect() {}
}

const rowWidth = () => formWidth - ATTACH_WIDTH_PX - ACTIONS_WIDTH_PX;

const renderComposer = (input, variant = "composer") =>
  render(
    <ChatInput
      input={input}
      setInput={() => {}}
      onSendMessage={() => {}}
      isStreaming={false}
      variant={variant}
    />,
  );

const composerProps = (input, variant = "composer") => ({
  input,
  setInput: () => {},
  onSendMessage: () => {},
  isStreaming: false,
  variant,
});

const isMultiline = (container) =>
  container
    .querySelector("form.input-box")
    .classList.contains("is-multiline");

let restoreLayout;

beforeEach(() => {
  formWidth = 500;
  contentHeight = 0;
  charWidth = 7;
  resizeObserverCallback = null;
  restoreLayout = stubComposerLayout();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text) => ({ width: String(text).length * charWidth }),
  });
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
});

afterEach(() => {
  restoreLayout();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChatInput multiline composer", () => {
  it("keeps a prompt that fits beside the controls on one row", async () => {
    const { container } = renderComposer("a".repeat(20));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(false);
    });
  });

  it("moves a long single-line prompt to the multiline layout", async () => {
    const { container } = renderComposer("a".repeat(120));

    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });
  });

  it("stays in the multiline layout while the prompt keeps growing", async () => {
    // The regression: the multiline textarea is wider, so re-measuring inside
    // it made the same prompt fit again and the composer jumped back to the
    // one-row shape on the next keystroke, then wrapped again on the one after.
    // Once a prompt needs the bottom-control layout it must keep it, so not one
    // frame may paint the one-row shape again. MutationObserver's oldValue is
    // what records a flip-and-back inside a single frame.
    const { container, rerender } = renderComposer("a".repeat(63));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });

    const form = container.querySelector("form.input-box");
    const paintedClasses = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) paintedClasses.push(record.oldValue);
    });
    observer.observe(form, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });

    for (const length of [64, 80, 100, 140]) {
      rerender(<ChatInput {...composerProps("a".repeat(length))} />);
      await waitFor(() => {
        expect(isMultiline(container)).toBe(true);
      });
    }

    // Let any queued animation frame (the old code re-measured in one) land.
    await new Promise((resolve) => setTimeout(resolve, 120));
    observer.disconnect();

    // Every class that was painted before a change must already have been the
    // multiline one; the one-row shape must never have been painted again.
    expect(
      paintedClasses.filter((name) => !name?.includes("is-multiline")),
    ).toEqual([]);
  });

  it("returns to the one-row layout once the prompt fits again", async () => {
    const { container, rerender } = renderComposer("a".repeat(120));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });

    rerender(<ChatInput {...composerProps("a".repeat(20))} />);
    await waitFor(() => {
      expect(isMultiline(container)).toBe(false);
    });
  });

  it("re-measures when the composer's pane gets wider", async () => {
    // The sidebar and the canvas pane resize the composer without a keystroke;
    // the ResizeObserver must re-run the fit or a wrapped prompt stays wrapped.
    const { container } = renderComposer("a".repeat(63));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });

    formWidth = 900; // 900 - 30 - 34 = 836px beside the controls now.
    act(() => {
      resizeObserverCallback([]);
    });

    await waitFor(() => {
      expect(isMultiline(container)).toBe(false);
    });
  });

  it("re-measures when the composer switches to the wider hero text", async () => {
    // The new-chat composer draws the prompt one step larger. Moving a draft
    // from a conversation to the new-chat screen swaps the font without
    // remounting the composer or changing the input.
    const { container, rerender } = renderComposer("a".repeat(60));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(false); // 60 * 7 = 420 < 434
    });

    // The hero font is wider: the same prompt no longer fits beside the
    // controls, so changing variant alone must re-run the measurement.
    charWidth = 7.4; // 60 * 7.4 = 444 > 434
    rerender(<ChatInput {...composerProps("a".repeat(60), "hero")} />);

    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });
  });

  it("caps the textarea height and scrolls a very long prompt inside", async () => {
    contentHeight = 400;
    const { container } = renderComposer("a".repeat(200));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });
    await waitFor(() => {
      expect(
        container.querySelector(".chat-textarea").style.height,
      ).toBe("180px");
    });
  });

  it("sizes the textarea to the wrapped content below the cap", async () => {
    contentHeight = 56;
    const { container } = renderComposer("a".repeat(200));
    await waitFor(() => {
      expect(
        container.querySelector(".chat-textarea").style.height,
      ).toBe("56px");
    });
  });

  it("uses the bottom-control layout for a wrapped prompt", async () => {
    const { container, rerender } = renderComposer("");

    expect(isMultiline(container)).toBe(false);

    rerender(<ChatInput {...composerProps("First line\nSecond line")} />);

    await waitFor(() => {
      expect(isMultiline(container)).toBe(true);
    });

    rerender(<ChatInput {...composerProps("")} />);

    await waitFor(() => {
      expect(isMultiline(container)).toBe(false);
    });
  });

  it("measures against the width beside the controls, not the field it is in", async () => {
    // Exactly the row width minus the tolerance: still a one-row prompt.
    const fits = Math.floor((rowWidth() - 2) / charWidth);
    const { container } = renderComposer("a".repeat(fits));
    await waitFor(() => {
      expect(isMultiline(container)).toBe(false);
    });
  });
});