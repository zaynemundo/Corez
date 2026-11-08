// @vitest-environment jsdom
//
// Hex colours in prose become an inline chip with a live swatch, so a value like
// #ffffff reads as the colour it names. Code spans and fenced code must never be
// chipped, and near-misses (C#123, #ffffffx, #gggggg) must stay plain text.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ChatMessage from "../src/components/ChatMessage.jsx";

const renderMessage = (content, role = "assistant") =>
  render(
    <ChatMessage
      message={{ role, content }}
      onRunInCanvas={() => {}}
      onReviseCode={() => {}}
    />,
  );

afterEach(cleanup);

describe("hex colour chips in chat", () => {
  it("chips a six-digit hex colour with a swatch of that colour", () => {
    const { container } = renderMessage("what is #ffffff?");
    const chips = container.querySelectorAll(".chat-color-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("#ffffff");
    const swatch = chips[0].querySelector(".chat-color-swatch");
    expect(swatch).toBeTruthy();
    // jsdom normalises the inline style to rgb().
    expect(swatch.style.backgroundColor).toMatch(/255, 255, 255|#ffffff/);
    // Surrounding prose is untouched.
    expect(container.textContent).toContain("what is ");
  });

  it("supports three-digit shorthand", () => {
    const { container } = renderMessage("Try #abc as the accent.");
    const chips = container.querySelectorAll(".chat-color-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("#abc");
  });

  it("supports alpha shorthands (#ffff and #ffffff80)", () => {
    const { container } = renderMessage("Try #ffff and #ffffff80 too.");
    const chips = container.querySelectorAll(".chat-color-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain("#ffff");
    expect(chips[1].textContent).toContain("#ffffff80");
  });

  it("chips colours in user messages too", () => {
    const { container } = renderMessage("make the theme #ff8800 please", "user");
    expect(container.querySelectorAll(".chat-color-chip")).toHaveLength(1);
    expect(container.querySelector(".chat-color-chip").textContent).toContain(
      "#ff8800",
    );
  });

  it("turns a backticked hex value (model habit) into the same chip", () => {
    const { container } = renderMessage("Pure white is `#ffffff` in CSS.");
    const chips = container.querySelectorAll(".chat-color-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("#ffffff");
    expect(container.querySelector(".inline-code")).toBeNull();
  });

  it("leaves inline code that is more than a bare colour as code", () => {
    const { container } = renderMessage("Write `color: #ffffff` in the CSS.");
    expect(container.querySelectorAll(".chat-color-chip")).toHaveLength(0);
    expect(container.querySelector(".inline-code").textContent).toContain(
      "color: #ffffff",
    );
  });

  it("leaves colours inside fenced code alone", () => {
    const { container } = renderMessage(
      "Example:\n\n```css\nbody { color: #ffffff; }\n```",
    );
    expect(container.querySelectorAll(".chat-color-chip")).toHaveLength(0);
  });

  it("does not chip near-misses", () => {
    const { container } = renderMessage(
      "C#123 is a language reference; #ffffffx is not a colour; #gggggg is invalid.",
    );
    expect(container.querySelectorAll(".chat-color-chip")).toHaveLength(0);
  });

  it("gives the swatch inline geometry so a stale stylesheet cannot hide it", () => {
    const { container } = renderMessage("Try #ff8800.");
    const swatch = container.querySelector(".chat-color-swatch");
    expect(swatch).toBeTruthy();
    expect(swatch.style.width).not.toBe("");
    expect(swatch.style.height).not.toBe("");
    expect(swatch.style.backgroundColor).toMatch(/255, 136, 0|#ff8800/i);
  });

  it("chips several colours in one paragraph", () => {
    const { container } = renderMessage("Use #000 and #FFFFFF together.");
    const chips = container.querySelectorAll(".chat-color-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain("#000");
    expect(chips[1].textContent).toContain("#FFFFFF");
  });
});