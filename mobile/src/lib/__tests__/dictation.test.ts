import { requestJson } from "@/api/client";
import {
  dictationLanguage,
  MAX_AUDIO_BYTES,
  transcribeRecording,
} from "../dictation";

jest.mock("@/api/client", () => ({ requestJson: jest.fn() }));

let mockFileSize = 1024;
let mockBase64: string | null = "AAAA";

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    get size() {
      return mockFileSize;
    },
    base64: jest.fn(async () => mockBase64),
  })),
}));

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
  mockFileSize = 1024;
  mockBase64 = "AAAA";
  requestMock.mockResolvedValue({ text: " hello world " });
});

describe("dictationLanguage", () => {
  it("maps interface languages to Whisper codes", () => {
    expect(dictationLanguage("en")).toBe("en");
    expect(dictationLanguage("ar")).toBe("ar");
    expect(dictationLanguage("fr")).toBe("en");
  });
});

describe("transcribeRecording", () => {
  it("sends the recording as base64 with the interface language", async () => {
    const text = await transcribeRecording("file:///rec.m4a", "ar");
    expect(text).toBe("hello world");
    expect(requestMock).toHaveBeenCalledWith("/api/transcribe", {
      method: "POST",
      body: { audio: "AAAA", language: "ar" },
      timeoutMs: 60_000,
    });
  });

  it("rejects an empty transcript honestly", async () => {
    requestMock.mockResolvedValueOnce({ text: "   " });
    await expect(transcribeRecording("file:///rec.m4a", "en")).rejects.toThrow(
      /No speech was detected/,
    );
  });

  it("rejects oversized recordings before reading them", async () => {
    mockFileSize = MAX_AUDIO_BYTES + 1;
    await expect(transcribeRecording("file:///rec.m4a", "en")).rejects.toThrow(
      /too long/,
    );
  });

  it("rejects a missing recording uri", async () => {
    await expect(transcribeRecording("", "en")).rejects.toThrow(
      /No recording was captured/,
    );
  });
});
