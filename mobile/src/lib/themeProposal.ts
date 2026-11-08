/**
 * Parse a theme proposal out of assistant content.
 *
 * The web stores proposals in a fenced ```corez-theme JSON block so the card
 * survives reloads and works in the read-only shared viewer. The native client
 * renders the same block as an interactive card instead of raw JSON.
 */
import type { ThemePalette, ThemeProposal } from "@/api/themes";

export const THEME_FENCE_LANGUAGE = "corez-theme";
export const OPEN_SETTINGS_MARKER = "[[corez:open-settings]]";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

function imageUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  if (url.startsWith("//")) return "";
  if (url.startsWith("/") || /^https?:\/\//i.test(url)) return url;
  return "";
}

function imagePair(value: unknown): { desktop?: string; mobile?: string } | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { desktop?: unknown; mobile?: unknown };
  const desktop = imageUrl(source.desktop);
  const mobile = imageUrl(source.mobile);
  if (!desktop && !mobile) return null;
  return { ...(desktop ? { desktop } : {}), ...(mobile ? { mobile } : {}) };
}

function normalizePalette(value: unknown): ThemePalette | null {
  if (!value || typeof value !== "object") return null;
  const palette = value as Record<string, unknown>;
  const keys = ["background", "surface", "text", "muted", "border"] as const;
  if (!keys.every((key) => isColor(palette[key]))) return null;
  return {
    background: String(palette.background),
    surface: String(palette.surface),
    text: String(palette.text),
    muted: String(palette.muted),
    border: String(palette.border),
  };
}

/** Validate raw JSON from the fence; anything malformed is ignored. */
export function parseThemeProposal(value: string): ThemeProposal | null {
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const proposalId =
    typeof raw.proposalId === "string" ? raw.proposalId.trim() : "";
  if (!proposalId || !/^[A-Za-z0-9_-]{1,80}$/.test(proposalId)) return null;
  const palette = normalizePalette(raw.palette);
  if (!palette) return null;
  const options =
    raw.options && typeof raw.options === "object"
      ? (raw.options as Record<string, unknown>)
      : {};
  const slots =
    raw.slots && typeof raw.slots === "object"
      ? (raw.slots as Record<string, unknown>)
      : {};
  const expiresAt = Number(raw.expiresAt);
  return {
    v: Number(raw.v) || 1,
    proposalId,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim().slice(0, 40)
        : "Custom theme",
    palette,
    images: imagePair(raw.images),
    imagePrompts: {
      desktop:
        typeof (raw.imagePrompts as Record<string, unknown>)?.desktop === "string"
          ? String((raw.imagePrompts as Record<string, unknown>).desktop)
          : "",
      mobile:
        typeof (raw.imagePrompts as Record<string, unknown>)?.mobile === "string"
          ? String((raw.imagePrompts as Record<string, unknown>).mobile)
          : "",
    },
    options: {
      palette: options.palette !== false,
      backgrounds: options.backgrounds === true,
      ...(typeof options.backgroundsReason === "string"
        ? { backgroundsReason: options.backgroundsReason }
        : {}),
    },
    slots: {
      used: Number(slots.used) || 0,
      max: Number(slots.max) || 2,
    },
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

export function isThemeProposalExpired(proposal: ThemeProposal): boolean {
  return proposal.expiresAt > 0 && proposal.expiresAt <= Date.now();
}

/** Remove the inline marker the web uses to open Settings. */
export function stripThemeMarkers(content: string): string {
  return String(content || "").replace(
    /\[\[\s*corez:open-settings\s*\]\]/g,
    "",
  );
}
