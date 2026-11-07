import { requestJson } from "../client";
import { generateImage } from "../images";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("image generation API", () => {
  it("posts a trimmed prompt and returns the image", async () => {
    requestMock.mockResolvedValueOnce({
      image: "https://cdn.example/image.png",
      model: "flux",
    });
    const result = await generateImage({ prompt: "  a red fox  " });
    expect(result).toEqual({
      image: "https://cdn.example/image.png",
      model: "flux",
    });
    expect(requestMock).toHaveBeenCalledWith("/api/image", {
      method: "POST",
      body: { prompt: "a red fox" },
      timeoutMs: 120_000,
    });
  });

  it("forwards an explicit model", async () => {
    requestMock.mockResolvedValueOnce({ image: "data:image/png;base64,AA==" });
    await generateImage({ prompt: "fox", model: "flux-2-klein-4b" });
    expect(requestMock).toHaveBeenCalledWith(
      "/api/image",
      expect.objectContaining({
        body: { prompt: "fox", model: "flux-2-klein-4b" },
      }),
    );
  });

  it("rejects empty and overlong prompts without calling the API", async () => {
    await expect(generateImage({ prompt: "   " })).rejects.toThrow(
      /prompt is required/i,
    );
    await expect(
      generateImage({ prompt: "x".repeat(2_001) }),
    ).rejects.toThrow(/too long/i);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("fails when the response has no image", async () => {
    requestMock.mockResolvedValueOnce({});
    await expect(generateImage({ prompt: "fox" })).rejects.toThrow(
      /no image/i,
    );
  });
});
