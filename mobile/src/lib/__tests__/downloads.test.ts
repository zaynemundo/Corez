import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import {
  copyText,
  downloadAndShareFile,
  safeFileName,
  shareImage,
  shareTextFile,
} from "../downloads";

const mockWrite = jest.fn(async (_content: unknown) => undefined);
const mockDownload = jest.fn(
  async (_url: string, destination: { uri: string }) => ({
    uri: destination.uri,
  }),
);

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    delete() {}
    write(content: unknown) {
      return mockWrite(content);
    }
    static downloadFileAsync(url: string, destination: { uri: string }) {
      return mockDownload(url, destination);
    }
  }
  return { File, Paths: { cache: "/cache" } };
});

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

const sharingMock = Sharing as unknown as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};
const clipboardMock = Clipboard as unknown as { setStringAsync: jest.Mock };

beforeEach(() => {
  mockWrite.mockClear();
  mockDownload.mockClear();
  sharingMock.isAvailableAsync.mockReset();
  sharingMock.shareAsync.mockReset();
  sharingMock.isAvailableAsync.mockResolvedValue(true);
  sharingMock.shareAsync.mockResolvedValue(undefined);
  clipboardMock.setStringAsync.mockReset();
  clipboardMock.setStringAsync.mockResolvedValue(true);
});

describe("safeFileName", () => {
  it("sanitizes and falls back", () => {
    expect(safeFileName("my page?.html")).toBe("my_page_.html");
    expect(safeFileName("!!!")).toBe("corez-file");
  });
});

describe("shareTextFile", () => {
  it("writes the file then opens the share sheet", async () => {
    const ok = await shareTextFile({
      content: "<html></html>",
      fileName: "page.html",
      mimeType: "text/html",
    });
    expect(ok).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith("<html></html>");
    expect(sharingMock.shareAsync).toHaveBeenCalledWith(
      expect.stringContaining("/cache/"),
      expect.objectContaining({ mimeType: "text/html" }),
    );
  });

  it("returns false when sharing is unavailable", async () => {
    sharingMock.isAvailableAsync.mockResolvedValue(false);
    await expect(
      shareTextFile({ content: "x", fileName: "a.html", mimeType: "text/html" }),
    ).resolves.toBe(false);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when the write fails", async () => {
    mockWrite.mockRejectedValueOnce(new Error("disk"));
    await expect(
      shareTextFile({ content: "x", fileName: "a.html", mimeType: "text/html" }),
    ).resolves.toBe(false);
  });
});

describe("copyText", () => {
  it("copies through the clipboard", async () => {
    await expect(copyText("hello")).resolves.toBe(true);
    expect(clipboardMock.setStringAsync).toHaveBeenCalledWith("hello");
  });

  it("reports clipboard failure", async () => {
    clipboardMock.setStringAsync.mockRejectedValue(new Error("denied"));
    await expect(copyText("hello")).resolves.toBe(false);
  });
});

describe("downloadAndShareFile", () => {
  it("downloads the asset and opens the share sheet", async () => {
    const ok = await downloadAndShareFile({
      url: "https://corez.pro/api/assets/uid/report.pdf",
      fileName: "report.pdf",
    });
    expect(ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith(
      "https://corez.pro/api/assets/uid/report.pdf",
      expect.objectContaining({ uri: expect.stringContaining("/cache/") }),
    );
    expect(sharingMock.shareAsync).toHaveBeenCalledWith(
      expect.stringContaining("/cache/"),
    );
  });

  it("returns false when the download fails", async () => {
    mockDownload.mockRejectedValueOnce(new Error("404"));
    await expect(
      downloadAndShareFile({
        url: "https://corez.pro/api/assets/uid/report.pdf",
        fileName: "report.pdf",
      }),
    ).resolves.toBe(false);
    expect(sharingMock.shareAsync).not.toHaveBeenCalled();
  });

  it("returns false when sharing is unavailable", async () => {
    sharingMock.isAvailableAsync.mockResolvedValue(false);
    await expect(
      downloadAndShareFile({
        url: "https://corez.pro/api/assets/uid/report.pdf",
        fileName: "report.pdf",
      }),
    ).resolves.toBe(false);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe("shareImage", () => {
  it("writes decoded data URLs to the cache before sharing", async () => {
    const ok = await shareImage("data:image/png;base64,aGVsbG8=", "fox.png");
    expect(ok).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([104, 101, 108, 108, 111]));
    expect(sharingMock.shareAsync).toHaveBeenCalledWith(
      expect.stringContaining("/cache/"),
    );
  });

  it("downloads https images instead of decoding them", async () => {
    const ok = await shareImage("https://cdn.example/fox.png", "fox.png");
    expect(ok).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith(
      "https://cdn.example/fox.png",
      expect.objectContaining({ uri: expect.stringContaining("/cache/") }),
    );
  });

  it("rejects empty, malformed and unsupported payloads", async () => {
    await expect(shareImage("")).resolves.toBe(false);
    await expect(shareImage("data:image/png,raw")).resolves.toBe(false);
    await expect(shareImage("data:image/png;base64,")).resolves.toBe(false);
    await expect(shareImage("ftp://example.com/fox.png")).resolves.toBe(false);
  });
});
