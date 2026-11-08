import { resolveComposerAction } from "../composerAction";

describe("composer action", () => {
  it("shows Stop while a response streams, regardless of input", () => {
    expect(
      resolveComposerAction({ streaming: true, hasContent: true, canDictate: true }),
    ).toBe("stop");
    expect(
      resolveComposerAction({ streaming: true, hasContent: false, canDictate: true }),
    ).toBe("stop");
  });

  it("shows the microphone while the composer is empty", () => {
    expect(
      resolveComposerAction({ streaming: false, hasContent: false, canDictate: true }),
    ).toBe("mic");
  });

  it("shows Send as soon as there is text or an attachment", () => {
    expect(
      resolveComposerAction({ streaming: false, hasContent: true, canDictate: true }),
    ).toBe("send");
  });

  it("keeps the microphone while dictation is recording or transcribing", () => {
    expect(
      resolveComposerAction({
        streaming: false,
        hasContent: true,
        canDictate: true,
        dictationStatus: "recording",
      }),
    ).toBe("mic");
    expect(
      resolveComposerAction({
        streaming: false,
        hasContent: true,
        canDictate: true,
        dictationStatus: "transcribing",
      }),
    ).toBe("mic");
  });

  it("falls back to Send when dictation is not available", () => {
    expect(
      resolveComposerAction({ streaming: false, hasContent: false, canDictate: false }),
    ).toBe("send");
  });
});
