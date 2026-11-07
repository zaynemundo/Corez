import {
  artifactFileName,
  isHtmlLanguage,
  isRenderableHtml,
} from "../artifacts";

describe("artifact detection", () => {
  it("recognises HTML languages case-insensitively", () => {
    expect(isHtmlLanguage("html")).toBe(true);
    expect(isHtmlLanguage("HTM")).toBe(true);
    expect(isHtmlLanguage("jsx")).toBe(false);
    expect(isHtmlLanguage(undefined)).toBe(false);
  });

  it("accepts complete documents and canvas games, not snippets", () => {
    expect(isRenderableHtml("<!doctype html><html></html>")).toBe(true);
    expect(isRenderableHtml("<html lang='en'><body></body></html>")).toBe(true);
    expect(isRenderableHtml("<body><canvas id='c'></canvas></body>")).toBe(true);
    expect(isRenderableHtml("<div>a snippet</div>")).toBe(false);
    expect(isRenderableHtml("const x = 1;")).toBe(false);
  });

  it("names the saved file from the document title", () => {
    expect(
      artifactFileName(
        "<html><head><title>Moon Café — Landing</title></head></html>",
      ),
    ).toBe("Moon-Caf-Landing.html");
    expect(artifactFileName("<html><body>no title</body></html>")).toBe(
      "corez-page.html",
    );
  });
});
