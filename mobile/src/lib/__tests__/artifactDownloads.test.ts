import {
  artifactFileName,
  artifactTitle,
  classifyDownloadableAsset,
} from "../artifacts";

describe("artifact titles", () => {
  it("reads and normalises the document title", () => {
    expect(artifactTitle("<title>Moon &amp; Stars</title>")).toBe(
      "Moon & Stars",
    );
    expect(artifactTitle("<html><body>none</body></html>")).toBe(
      "Untitled Application",
    );
  });
});

describe("downloadable artifact links", () => {
  it("recognises generated PDFs and ZIPs on the deployment", () => {
    expect(
      classifyDownloadableAsset(
        "https://corez.pro/api/assets/uid/reports/moon-report.pdf",
      ),
    ).toEqual({
      url: "https://corez.pro/api/assets/uid/reports/moon-report.pdf",
      fileName: "moon-report.pdf",
      mimeType: "application/pdf",
    });

    expect(
      classifyDownloadableAsset(
        "https://corez.pro/api/assets/uid/exports/site.zip",
      )?.mimeType,
    ).toBe("application/zip");
  });

  it("decodes the file name and maps office extensions", () => {
    expect(
      classifyDownloadableAsset(
        "https://corez.pro/api/assets/uid/reports/Annual%20Report.docx",
      )?.fileName,
    ).toBe("Annual Report.docx");
    expect(
      classifyDownloadableAsset(
        "https://corez.pro/api/assets/uid/sheets/budget.xlsx",
      )?.mimeType,
    ).toContain("spreadsheetml");
  });

  it("ignores non-asset links, unknown extensions and malformed URLs", () => {
    expect(
      classifyDownloadableAsset("https://corez.pro/chat/abc"),
    ).toBeNull();
    expect(
      classifyDownloadableAsset("https://corez.pro/api/assets/uid/page.html"),
    ).toBeNull();
    expect(
      classifyDownloadableAsset("https://example.com/api/assets/file.pdf"),
    ).not.toBeNull();
    expect(classifyDownloadableAsset("not a url")).toBeNull();
    expect(classifyDownloadableAsset("")).toBeNull();
  });
});

describe("artifactFileName", () => {
  it("still names saved HTML pages after the title", () => {
    expect(artifactFileName("<title>Moon Cafe</title>")).toBe(
      "Moon-Cafe.html",
    );
  });
});
