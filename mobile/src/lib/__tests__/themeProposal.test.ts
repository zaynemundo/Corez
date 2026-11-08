import {
  isThemeProposalExpired,
  parseThemeProposal,
  stripThemeMarkers,
} from "../themeProposal";

const VALID = {
  v: 1,
  proposalId: "thp_123abc",
  name: "Racing Red",
  palette: {
    background: "#101010",
    surface: "#1a1a1a",
    text: "#f5f5f5",
    muted: "#a0a0a0",
    border: "#333333",
  },
  images: {
    desktop: "/api/assets/uid/theme-desktop.png",
    mobile: "https://cdn.example/mobile.png",
  },
  imagePrompts: { desktop: "red porsche", mobile: "phone wallpaper" },
  options: { palette: true, backgrounds: true },
  slots: { used: 1, max: 2 },
  expiresAt: 1_900_000_000_000,
};

describe("theme proposal parsing", () => {
  it("parses a valid corez-theme payload", () => {
    const proposal = parseThemeProposal(JSON.stringify(VALID));
    expect(proposal?.proposalId).toBe("thp_123abc");
    expect(proposal?.name).toBe("Racing Red");
    expect(proposal?.images?.desktop).toBe(
      "/api/assets/uid/theme-desktop.png",
    );
    expect(proposal?.options.backgrounds).toBe(true);
    expect(proposal?.slots).toEqual({ used: 1, max: 2 });
  });

  it("rejects malformed payloads and unsafe image URLs", () => {
    expect(parseThemeProposal("not json")).toBeNull();
    expect(
      parseThemeProposal(JSON.stringify({ ...VALID, palette: { text: "red" } })),
    ).toBeNull();
    expect(
      parseThemeProposal(
        JSON.stringify({
          ...VALID,
          images: { desktop: "javascript:alert(1)", mobile: "//evil" },
        }),
      )?.images,
    ).toBeNull();
  });

  it("detects expired proposals", () => {
    expect(
      isThemeProposalExpired(
        parseThemeProposal(
          JSON.stringify({ ...VALID, expiresAt: Date.now() - 1000 }),
        )!,
      ),
    ).toBe(true);
    expect(
      isThemeProposalExpired(
        parseThemeProposal(
          JSON.stringify({ ...VALID, expiresAt: Date.now() + 60_000 }),
        )!,
      ),
    ).toBe(false);
  });

  it("strips the open-settings marker", () => {
    expect(stripThemeMarkers("Applied [[corez:open-settings]] here")).toBe(
      "Applied  here",
    );
  });
});
