import type { CustomTheme } from "@/api/themes";
import {
  themeArtworkRemote,
  themeArtworkScrim,
} from "../artwork";

const base: CustomTheme = {
  id: "thm_1",
  name: "Artwork theme",
  tone: "dark",
  palette: {
    background: "#101010",
    surface: "#1a1a1a",
    text: "#f5f5f5",
    muted: "#a0a0a0",
    border: "#333333",
  },
  tokens: { solid: { "--bg-primary": "#101010" } },
};

describe("theme artwork", () => {
  it("prefers the phone wallpaper and resolves it against the API", () => {
    expect(
      themeArtworkRemote({
        ...base,
        images: { mobile: "/api/assets/uid/phone.png" },
      }),
    ).toBe("https://corez.pro/api/assets/uid/phone.png");
    expect(
      themeArtworkRemote({
        ...base,
        images: { desktop: "https://cdn.example/desk.png" },
      }),
    ).toBe("https://cdn.example/desk.png");
    expect(themeArtworkRemote(base)).toBeNull();
  });

  it("uses the Worker scrim and falls back to a safe veil", () => {
    expect(
      themeArtworkScrim({
        ...base,
        tokens: {
          solid: {},
          image: { "--theme-scrim": "rgba(0, 0, 0, 0.22)" },
        },
      }),
    ).toBe("rgba(0, 0, 0, 0.22)");
    expect(themeArtworkScrim(base)).toBe("rgba(0, 0, 0, 0.22)");
  });
});
