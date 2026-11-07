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
async function renderMarkdown(content: string) {
  await render(
    <ThemeProvider>
      <MarkdownView content={content} />
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
});
