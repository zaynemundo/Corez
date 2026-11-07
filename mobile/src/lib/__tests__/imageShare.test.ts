import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import {
  copyImageLink,
  imageFileName,
  imageShareTitle,
  shareImage,
} from "../imageShare";

const mockDownloadFileAsync = jest.fn();

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    static downloadFileAsync(...args: unknown[]) {
      return mockDownloadFileAsync(...args);
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
  mockDownloadFileAsync.mockReset();
  sharingMock.isAvailableAsync.mockReset();
  sharingMock.shareAsync.mockReset();
  clipboardMock.setStringAsync.mockReset();
  mockDownloadFileAsync.mockResolvedValue({ uri: "/cache/downloaded.png" });
  sharingMock.isAvailableAsync.mockResolvedValue(true);
  sharingMock.shareAsync.mockResolvedValue(undefined);
  clipboardMock.setStringAsync.mockResolvedValue(true);
});

describe("imageFileName", () => {
  it("keeps a usable name and strips query strings", () => {
    expect(imageFileName("https://x.test/a/b/photo.PNG?token=1")).toBe(
      "photo.PNG",
    );
  });

  it("adds an extension and sanitizes unsafe characters", () => {
    expect(imageFileName("https://x.test/a/weird name!")).toBe(
      "weird_name_.png",
    );
    expect(imageFileName("")).toBe("corez-image.png");
  });

  it("builds a share dialog title", () => {
    expect(imageShareTitle("https://x.test/a/photo.jpg")).toBe(
      "Share photo.jpg",
    );
  });
});

describe("shareImage", () => {
  it("downloads the resolved URL and opens the share sheet", async () => {
    const shared = await shareImage("/api/assets/generated.png");
    expect(shared).toBe(true);
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      "https://corez.pro/api/assets/generated.png",
      expect.objectContaining({ uri: expect.stringContaining("/cache/") }),
      { idempotent: true },
    );
    expect(sharingMock.shareAsync).toHaveBeenCalledWith(
      "/cache/downloaded.png",
      expect.objectContaining({ mimeType: "image/png" }),
    );
  });

  it("returns false when the share sheet is unavailable", async () => {
    sharingMock.isAvailableAsync.mockResolvedValue(false);
    await expect(shareImage("https://x.test/a.png")).resolves.toBe(false);
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when the download fails", async () => {
    mockDownloadFileAsync.mockRejectedValue(new Error("network"));
    await expect(shareImage("https://x.test/a.png")).resolves.toBe(false);
  });
});

describe("copyImageLink", () => {
  it("copies the absolute URL", async () => {
    await expect(copyImageLink("/api/assets/a.png")).resolves.toBe(true);
    expect(clipboardMock.setStringAsync).toHaveBeenCalledWith(
      "https://corez.pro/api/assets/a.png",
    );
  });

  it("returns false when the clipboard fails", async () => {
    clipboardMock.setStringAsync.mockRejectedValue(new Error("denied"));
    await expect(copyImageLink("https://x.test/a.png")).resolves.toBe(false);
  });
});
