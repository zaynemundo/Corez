import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { requestJson } from "@/api/client";
import {
  buildAttachmentPrompt,
  formatBytes,
  pickAttachment,
  toApiAttachments,
} from "../attachments";

jest.mock("@/api/client", () => ({ requestJson: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    text: jest.fn(async () => "file content"),
  })),
}));

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;
const pickerMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const cameraMock = ImagePicker.launchCameraAsync as jest.Mock;
const documentMock = DocumentPicker.getDocumentAsync as jest.Mock;

beforeEach(() => {
  requestMock.mockReset();
  pickerMock.mockReset();
  cameraMock.mockReset();
  documentMock.mockReset();
  requestMock.mockResolvedValue({ url: "/api/assets/x.jpg", key: "user-upload_x" });
});

describe("attachment helpers", () => {
  it("formats sizes and builds the model prompt section", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(undefined)).toBe("unknown size");

    const prompt = buildAttachmentPrompt([
      {
        id: "a1",
        name: "notes.txt",
        type: "text/plain",
        size: 11,
        content: "hello world",
      },
    ]);
    expect(prompt).toContain("[Attached files]");
    expect(prompt).toContain("notes.txt (text/plain, 11 B)");
    expect(prompt).toContain("hello world");
  });

  it("strips display-only ids from API attachments", () => {
    expect(
      toApiAttachments([
        {
          id: "a1",
          name: "photo.jpg",
          type: "image/jpeg",
          size: 100,
          thumb: "data:image/jpeg;base64,x",
          assetUrl: "/api/assets/x.jpg",
          assetKey: "k",
        },
      ]),
    ).toEqual([
      {
        name: "photo.jpg",
        type: "image/jpeg",
        size: 100,
        thumb: "data:image/jpeg;base64,x",
        content: undefined,
        assetUrl: "/api/assets/x.jpg",
        assetKey: "k",
      },
    ]);
  });
});

describe("pickAttachment", () => {
  it("uploads a library image and keeps a local thumbnail", async () => {
    pickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          base64: "YWJj",
          mimeType: "image/jpeg",
          fileName: "photo.jpg",
          fileSize: 1234,
        },
      ],
    });

    const attachment = await pickAttachment("library");
    expect(attachment).toMatchObject({
      name: "photo.jpg",
      type: "image/jpeg",
      size: 1234,
      thumb: "data:image/jpeg;base64,YWJj",
      assetUrl: "/api/assets/x.jpg",
      assetKey: "user-upload_x",
    });
    expect(requestMock).toHaveBeenCalledWith(
      "/api/assets/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          dataUrl: "data:image/jpeg;base64,YWJj",
          mimeType: "image/jpeg",
        }),
      }),
    );
  });

  it("returns null when the user cancels", async () => {
    pickerMock.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAttachment("library")).resolves.toBeNull();
  });

  it("refuses an image over the size limit", async () => {
    pickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///huge.jpg",
          base64: "x",
          mimeType: "image/jpeg",
          fileSize: 20 * 1024 * 1024,
        },
      ],
    });
    await expect(pickAttachment("library")).rejects.toThrow(/larger than 10 MB/);
  });

  it("keeps the attachment usable when the R2 upload fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("network"));
    pickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///a.jpg",
          base64: "YWJj",
          mimeType: "image/jpeg",
          fileName: "a.jpg",
        },
      ],
    });
    const attachment = await pickAttachment("library");
    expect(attachment?.thumb).toBe("data:image/jpeg;base64,YWJj");
    expect(attachment?.assetUrl).toBeUndefined();
  });

  it("reads text-like documents and keeps other files as metadata", async () => {
    documentMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///notes.txt",
          name: "notes.txt",
          mimeType: "text/plain",
          size: 100,
        },
      ],
    });
    const textFile = await pickAttachment("file");
    expect(textFile?.content).toBe("file content");

    documentMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///slides.pdf",
          name: "slides.pdf",
          mimeType: "application/pdf",
          size: 2_000_000,
        },
      ],
    });
    const binaryFile = await pickAttachment("file");
    expect(binaryFile?.content).toBeUndefined();
    expect(binaryFile?.name).toBe("slides.pdf");
  });
});
