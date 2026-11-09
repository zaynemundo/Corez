/**
 * Custom theme API for the native client.
 *
 * `GET /api/themes` lists the account's saved AI-designed themes (max 2),
 * `DELETE /api/themes/<id>` removes one, and `POST /api/themes/apply` turns a
 * chat proposal into a saved theme. Palette tokens are expanded by the Worker
 * with the shared WCAG engine, so the app only maps variables to native colours.
 */
import { requestJson } from "./client";

export interface ThemePalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  tone: "dark" | "light";
  palette: ThemePalette;
  tokens: {
    solid: Record<string, string>;
    image?: Record<string, string>;
    scrim?: string;
  };
  images?: { desktop?: string; mobile?: string } | null;
  proposalId?: string | null;
  createdAt?: number;
}

export interface ThemeProposal {
  v: number;
  proposalId: string;
  name: string;
  palette: ThemePalette;
  images: { desktop?: string; mobile?: string } | null;
  imagePrompts: { desktop: string; mobile: string };
  options: {
    palette: boolean;
    backgrounds: boolean;
    backgroundsReason?: string;
  };
  slots: { used: number; max: number };
  expiresAt: number;
}

export async function listThemes(): Promise<{
  themes: CustomTheme[];
  max: number;
}> {
  const data = await requestJson<{ themes?: CustomTheme[]; max?: number }>(
    "/api/themes",
    { method: "GET" },
  );
  return {
    themes: Array.isArray(data.themes) ? data.themes : [],
    max: Number(data.max) || 2,
  };
}

export async function deleteTheme(id: string): Promise<void> {
  const safe = String(id || "").trim();
  if (!safe) throw new Error("A theme id is required.");
  await requestJson<{ success?: boolean }>(
    `/api/themes/${encodeURIComponent(safe)}`,
    { method: "DELETE" },
  );
}

export async function applyThemeProposal(
  proposalId: string,
  option: "palette" | "backgrounds",
): Promise<CustomTheme> {
  const safe = String(proposalId || "").trim();
  if (!safe) throw new Error("A theme proposal id is required.");
  const data = await requestJson<{ theme?: CustomTheme }>(
    "/api/themes/apply",
    {
      method: "POST",
      body: { proposalId: safe, option },
      timeoutMs: 60_000,
    },
  );
  if (!data.theme?.id) throw new Error("The theme could not be saved.");
  return data.theme;
}

/** Ask the Worker's theme designer for a new proposal (used by @theme). */
export async function proposeTheme(prompt: string): Promise<ThemeProposal> {
  const value = String(prompt || "").trim();
  if (!value) throw new Error("Describe the theme you want.");
  const data = await requestJson<{ proposal?: ThemeProposal }>(
    "/api/themes/propose",
    {
      method: "POST",
      body: { prompt: value },
      timeoutMs: 180_000,
    },
  );
  if (!data.proposal?.proposalId) {
    throw new Error("The theme designer did not return a proposal.");
  }
  return data.proposal;
}
