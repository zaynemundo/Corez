import { requestJson } from "../client";
import {
  listPublishedPages,
  publishHtml,
  publishedPageUrl,
  unpublishPage,
} from "../publish";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("published sites API", () => {
  it("lists pages and tolerates a missing array", async () => {
    requestMock.mockResolvedValueOnce({
      pages: [{ slug: "moon", url: "/moon", title: "Moon" }],
      truncated: false,
    });
    await expect(listPublishedPages()).resolves.toEqual({
      pages: [{ slug: "moon", url: "/moon", title: "Moon" }],
      truncated: false,
    });

    requestMock.mockResolvedValueOnce({});
    await expect(listPublishedPages()).resolves.toEqual({
      pages: [],
      truncated: false,
    });
  });

  it("publishes trimmed HTML and returns the public URL", async () => {
    requestMock.mockResolvedValueOnce({ success: true, slug: "moon" });
    const result = await publishHtml({
      html: "  <html><title>Moon</title></html>  ",
      title: "Moon",
    });

    expect(result).toEqual({
      slug: "moon",
      url: "https://corez.pro/moon",
    });
    expect(requestMock).toHaveBeenCalledWith("/api/publish", {
      method: "POST",
      body: {
        html: "<html><title>Moon</title></html>",
        title: "Moon",
      },
      timeoutMs: 60_000,
    });
  });

  it("forwards an explicit slug and session id", async () => {
    requestMock.mockResolvedValueOnce({ slug: "moon-two" });
    await publishHtml({
      html: "<html></html>",
      title: "Moon",
      slug: "moon-two",
      sessionId: "chat-1",
    });
    expect(requestMock).toHaveBeenCalledWith(
      "/api/publish",
      expect.objectContaining({
        body: expect.objectContaining({
          slug: "moon-two",
          sessionId: "chat-1",
        }),
      }),
    );
  });

  it("refuses empty content and a response without a slug", async () => {
    await expect(publishHtml({ html: "   " })).rejects.toThrow(
      /nothing to publish/i,
    );

    requestMock.mockResolvedValueOnce({ success: true });
    await expect(publishHtml({ html: "<html></html>" })).rejects.toThrow(
      /did not return a link/i,
    );
  });

  it("unpublishes an encoded slug and validates input", async () => {
    requestMock.mockResolvedValueOnce({ success: true });
    await unpublishPage("moon/two");
    expect(requestMock).toHaveBeenCalledWith("/api/publish/moon%2Ftwo", {
      method: "DELETE",
    });

    await expect(unpublishPage("")).rejects.toThrow(/slug is required/i);
  });

  it("builds absolute page URLs", () => {
    expect(publishedPageUrl("moon")).toBe("https://corez.pro/moon");
    expect(publishedPageUrl("a b")).toBe("https://corez.pro/a%20b");
  });
});
