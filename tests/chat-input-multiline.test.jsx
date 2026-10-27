// @vitest-environment jsdom
//
// Long prompts switch the composer to the ChatGPT-style layout: the text keeps
// the full width on top, while the attach and send controls drop to a bottom
// row. The one-line composer keeps its original flex row and pill shape.
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ChatInput from "../src/components/ChatInput.jsx";

const renderComposer = (input) =>
  render(
    <ChatInput
      input={input}
      setInput={() => {}}
      onSendMessage={() => {}}
      isStreaming={false}
    />,
  );

describe("ChatInput multiline composer", () => {
  it("uses the bottom-control layout for a wrapped prompt", async () => {
    const { container, rerender } = renderComposer("");

    expect(
      container.querySelector("form.input-box").classList.contains("is-multiline"),
    ).toBe(false);

    rerender(
      <ChatInput
        input={"First line\nSecond line"}
        setInput={() => {}}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("form.input-box").classList.contains("is-multiline"),
      ).toBe(true);
    });

    rerender(
      <ChatInput
        input=""
        setInput={() => {}}
        onSendMessage={() => {}}
        isStreaming={false}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("form.input-box").classList.contains("is-multiline"),
      ).toBe(false);
    });
  });
});
