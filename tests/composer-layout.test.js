// @vitest-environment jsdom
//
// The composer's shape decision must depend only on the prompt and the width it
// gets beside the controls, never on the shape currently rendered. These cases
// pin that contract: the same measurement is used by the one-row and the
// controls-below layouts, so a prompt that crosses the line once stays there
// instead of making the composer flip back and forth.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  COMPOSER_MULTILINE_TOLERANCE_PX,
  decideComposerLayout,
  measureSingleLineWidth,
  readComposerMetrics,
} from "../src/utils/composerLayout.js";

const measure = (width) => () => width;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decideComposerLayout", () => {
  it("keeps a prompt that fits beside the controls on one row", () => {
    expect(
      decideComposerLayout({
        text: "short prompt",
        rowWidth: 400,
        measureLineWidth: measure(200),
      }),
    ).toBe("single");
  });

  it("switches once the prompt no longer fits beside the controls", () => {
    expect(
      decideComposerLayout({
        text: "a long prompt",
        rowWidth: 400,
        measureLineWidth: measure(401),
      }),
    ).toBe("multiline");
  });

  it("leaves a tolerance so a prompt on the edge does not wrap", () => {
    expect(
      decideComposerLayout({
        text: "edge",
        rowWidth: 400,
        measureLineWidth: measure(400 - COMPOSER_MULTILINE_TOLERANCE_PX),
      }),
    ).toBe("single");
    expect(
      decideComposerLayout({
        text: "edge",
        rowWidth: 400,
        measureLineWidth: measure(400 - COMPOSER_MULTILINE_TOLERANCE_PX + 0.5),
      }),
    ).toBe("multiline");
  });

  it("switches on an explicit line break even when the text would fit", () => {
    expect(
      decideComposerLayout({
        text: "first\nsecond",
        rowWidth: 1000,
        measureLineWidth: measure(10),
      }),
    ).toBe("multiline");
  });

  it("ignores trailing spaces and tabs that hang past the line end", () => {
    const measured = [];
    for (const text of ["a b ", "a b\t", "a b \t "]) {
      decideComposerLayout({
        text,
        rowWidth: 100,
        measureLineWidth: (value) => {
          measured.push(value);
          return 50;
        },
      });
    }
    expect(measured).toEqual(["a b", "a b", "a b"]);
  });

  it("keeps non-breaking whitespace in the measurement", () => {
    // NBSP does not hang past a line end the way a space does, so a prompt
    // ending in one must be measured with it, not shortened.
    const measured = [];
    decideComposerLayout({
      text: "a b\u00a0",
      rowWidth: 100,
      measureLineWidth: (value) => {
        measured.push(value);
        return 50;
      },
    });
    expect(measured).toEqual(["a b\u00a0"]);
  });

  it("treats an empty or whitespace-only prompt as one row", () => {
    for (const text of ["", "   ", undefined, null]) {
      expect(
        decideComposerLayout({
          text,
          rowWidth: 0,
          measureLineWidth: () => {
            throw new Error("must not measure an empty prompt");
          },
        }),
      ).toBe("single");
    }
  });

  it("reports unknown when there is no usable geometry or measurement", () => {
    expect(
      decideComposerLayout({ text: "hello", rowWidth: Number.NaN }),
    ).toBe("unknown");
    expect(
      decideComposerLayout({ text: "hello", rowWidth: 0 }),
    ).toBe("unknown");
    expect(
      decideComposerLayout({
        text: "hello",
        rowWidth: 400,
        measureLineWidth: () => null,
      }),
    ).toBe("unknown");
  });
});

describe("measureSingleLineWidth", () => {
  it("measures with the supplied canvas font", () => {
    const context = {
      font: "",
      measureText: vi.fn((text) => ({ width: text.length * 7 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );

    expect(measureSingleLineWidth("abcd", "400 16px Arial")).toBe(28);
    expect(context.font).toBe("400 16px Arial");
    expect(context.measureText).toHaveBeenCalledWith("abcd");
  });

  it("returns null when the environment cannot paint a canvas", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(measureSingleLineWidth("abcd", "400 16px Arial")).toBeNull();
  });
});

describe("readComposerMetrics", () => {
  it("derives the row width from the form and the controls that share it", () => {
    const form = document.createElement("form");
    form.className = "input-box";
    form.style.paddingLeft = "12px";
    form.style.paddingRight = "12px";
    form.style.columnGap = "8px";
    const attach = document.createElement("button");
    attach.className = "attach-btn";
    const actions = document.createElement("div");
    actions.className = "input-actions-bar";
    const textarea = document.createElement("textarea");
    textarea.className = "chat-textarea";
    textarea.style.fontFamily = "Arial";
    textarea.style.fontSize = "16px";
    textarea.style.fontWeight = "400";
    textarea.style.fontStyle = "normal";
    form.append(attach, actions, textarea);
    document.body.append(form);

    Object.defineProperty(form, "clientWidth", { value: 500 });
    Object.defineProperty(attach, "offsetWidth", { value: 30 });
    Object.defineProperty(actions, "offsetWidth", { value: 34 });

    const metrics = readComposerMetrics(textarea);
    // 500 - 12 - 12 - 30 - 34 - (2 * 8)
    expect(metrics.rowWidth).toBe(396);
    expect(metrics.font).toContain("16px");
    expect(metrics.font).toContain("Arial");

    form.remove();
  });

  it("returns null when the textarea is not inside the composer", () => {
    const textarea = document.createElement("textarea");
    expect(readComposerMetrics(textarea)).toBeNull();
    expect(readComposerMetrics(null)).toBeNull();
  });
});