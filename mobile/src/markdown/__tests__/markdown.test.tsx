import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  MarkdownView,
  parseMarkdown,
  resolveMarkdownUrl,
} from "@/components/MarkdownView";
import { ThemeProvider } from "@/state/theme";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

// RNTL 14 renders concurrently, so render() must be awaited before screen is
// available.
async function renderMarkdown(
  content: string,
  props: { onReviseCode?: (code: string) => void } = {},
) {
  await render(
    <ThemeProvider>
      <MarkdownView content={content} {...props} />
    </ThemeProvider>,
  );
}

describe("parseMarkdown", () => {
  it("produces the expected block tokens", () => {
    const tokens = parseMarkdown(
      "# Title\n\nHello **world**\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n",
    );
    const types = tokens.map((token) => token.type);
    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("list");
    expect(types).toContain("code");
  });

  it("memoises by content so streaming re-parses only changed text", () => {
    const first = parseMarkdown("same content");
    const second = parseMarkdown("same content");
    expect(second).toBe(first);
  });

  it("keeps GFM tables", () => {
    const types = parseMarkdown(
      "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n",
    ).map((token) => token.type);
    expect(types).toContain("table");
  });
});

describe("resolveMarkdownUrl", () => {
  it("prefixes relative asset paths with the API origin", () => {
    expect(resolveMarkdownUrl("/api/assets/users/u/a.png")).toBe(
      "https://corez.pro/api/assets/users/u/a.png",
    );
  });

  it("leaves absolute and non-http links untouched", () => {
    expect(resolveMarkdownUrl("https://example.com/x")).toBe(
      "https://example.com/x",
    );
    expect(resolveMarkdownUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
});

describe("MarkdownView rendering", () => {
  it("renders headings, inline emphasis, lists and tables as native text", async () => {
    await renderMarkdown(
      "# Report\n\nHello **bold** and *italic*.\n\n- alpha\n- beta\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n",
    );
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).toContain("Report");
    expect(tree).toContain("bold");
    expect(tree).toContain("italic");
    expect(tree).toContain("alpha");
    expect(tree).toContain("Alice");
  });

  it("renders a fenced code block with its language and a copy action", async () => {
    await renderMarkdown("```ts\nconst x = 1;\n```");
    expect(screen.getByText("ts")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();

    const Clipboard = jest.requireMock("expo-clipboard") as {
      setStringAsync: jest.Mock;
    };
    await fireEvent.press(screen.getByText("Copy"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("const x = 1;");
  });

  it("renders inline images with a resolved source", async () => {
    await renderMarkdown("![chart](/api/assets/chart.png)");
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).toContain("https://corez.pro/api/assets/chart.png");
  });

  it("opens the fullscreen viewer when an image is pressed", async () => {
    await renderMarkdown("![chart](/api/assets/chart.png)");
    const pressTargets = screen.getAllByLabelText("chart");
    await fireEvent.press(pressTargets[0]);
    expect(screen.getByText("Image preview")).toBeTruthy();
    expect(screen.getByText("Share")).toBeTruthy();
    expect(screen.getByText("Copy link")).toBeTruthy();
  });

  it("offers a canvas preview for a complete HTML artifact", async () => {
    await renderMarkdown(
      "```html\n<!doctype html><html><body><h1>Hello canvas</h1></body></html>\n```",
      { onReviseCode: jest.fn() },
    );
    expect(screen.queryByText("Preview")).toBeTruthy();
    expect(screen.queryByText("Revise")).toBeTruthy();
    // The artifact is a compact action card: only Preview/Revise, never the
    // long HTML source or a Copy action.
    expect(screen.queryByText("Copy")).toBeNull();
    expect(
      screen.queryByText(/<!doctype html><html><body><h1>Hello canvas/i),
    ).toBeNull();
    await fireEvent.press(screen.getByText("Preview"));
    expect(screen.getByText("Preview canvas")).toBeTruthy();
    expect(screen.getByTestId("corez-webview")).toBeTruthy();
  });

  it("does not offer a canvas preview for a non-HTML snippet", async () => {
    await renderMarkdown("```js\nconst x = 1;\n```");
    expect(screen.queryByText("Preview")).toBeNull();
    expect(screen.queryByText(/const x = 1;/)).toBeTruthy();
  });

  it("offers a Revise action on HTML artifacts and passes the code back", async () => {
    const onReviseCode = jest.fn();
    const html =
      "<!doctype html><html><body><h1>Hello canvas</h1></body></html>";
    await renderMarkdown("```html\n" + html + "\n```", { onReviseCode });

    expect(screen.queryByText("Preview")).toBeTruthy();
    expect(screen.queryByText("Revise")).toBeTruthy();
    await fireEvent.press(screen.getByText("Revise"));
    expect(onReviseCode).toHaveBeenCalledWith(html);
  });

  it("does not offer Revise for a non-HTML snippet", async () => {
    await renderMarkdown("```js\nconst x = 1;\n```", {
      onReviseCode: jest.fn(),
    });
    expect(screen.queryByText("Revise")).toBeNull();
  });

  it("renders an @theme proposal as a card instead of raw JSON", async () => {
    const proposal = {
      v: 1,
      proposalId: "thp_123abc",
      name: "Racing Red",
      palette: {
        background: "#101010",
        surface: "#1a1a1a",
        text: "#f5f5f5",
        muted: "#a0a0a0",
        border: "#333333",
      },
      images: null,
      imagePrompts: { desktop: "", mobile: "" },
      options: { palette: true, backgrounds: false },
      slots: { used: 0, max: 2 },
      expiresAt: Date.now() + 60_000,
    };
    await renderMarkdown(
      "```corez-theme\n" + JSON.stringify(proposal) + "\n```",
    );
    expect(screen.getByText("Racing Red")).toBeTruthy();
    expect(screen.getByText("Use colors")).toBeTruthy();
    expect(screen.queryByText(/proposalId/)).toBeNull();
  });
});
