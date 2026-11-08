import { requestJson } from "../client";
import { applyThemeProposal, deleteTheme, listThemes } from "../themes";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("themes API", () => {
  it("lists saved themes with a fallback max", async () => {
    requestMock.mockResolvedValueOnce({
      themes: [{ id: "thm_1", name: "Red" }],
      max: 2,
    });
    await expect(listThemes()).resolves.toEqual({
      themes: [{ id: "thm_1", name: "Red" }],
      max: 2,
    });

    requestMock.mockResolvedValueOnce({});
    await expect(listThemes()).resolves.toEqual({ themes: [], max: 2 });
  });

  it("applies a proposal with the selected option", async () => {
    requestMock.mockResolvedValueOnce({ theme: { id: "thm_2", name: "Red" } });
    await expect(
      applyThemeProposal("thp_1", "backgrounds"),
    ).resolves.toEqual({ id: "thm_2", name: "Red" });
    expect(requestMock).toHaveBeenCalledWith("/api/themes/apply", {
      method: "POST",
      body: { proposalId: "thp_1", option: "backgrounds" },
      timeoutMs: 60_000,
    });
  });

  it("fails honestly when a proposal returns no theme", async () => {
    requestMock.mockResolvedValueOnce({});
    await expect(applyThemeProposal("thp_1", "palette")).rejects.toThrow(
      /could not be saved/i,
    );
    await expect(applyThemeProposal("", "palette")).rejects.toThrow(
      /proposal id is required/i,
    );
  });

  it("deletes an encoded theme id", async () => {
    requestMock.mockResolvedValueOnce({ success: true });
    await deleteTheme("thm/1");
    expect(requestMock).toHaveBeenCalledWith("/api/themes/thm%2F1", {
      method: "DELETE",
    });
    await expect(deleteTheme("")).rejects.toThrow(/theme id is required/i);
  });
});
