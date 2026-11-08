import { useState } from "react";
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Loader2,
  Palette,
  Settings2,
} from "lucide-react";
import { useI18n } from "../../i18n/index.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import "./theme-proposal-card.css";

// Assistant content carries the proposal JSON in a fenced "corez-theme" block.
// Message content is the source of truth: the card is re-parsed from it on
// every render, so it survives a reload and the shared-chat viewer (readOnly)
// can show the palette without calling owner-protected asset routes.
export const THEME_FENCE_INFO = "corez-theme";
export const OPEN_SETTINGS_MARKER = "[[corez:open-settings]]";
export const OPEN_SETTINGS_EVENT = "corez:open-settings";

const FENCE_SOURCE = "```[ \\t]*corez-theme[ \\t]*\\r?\\n([\\s\\S]*?)```";
const SETTINGS_MARKER_SOURCE = "\\[\\[\\s*corez:open-settings\\s*\\]\\]";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const PALETTE_KEYS = ["background", "surface", "text", "muted", "border"];

const SWATCH_LABEL_KEYS = {
  background: "chat.message.theme.swatch.background",
  surface: "chat.message.theme.swatch.surface",
  text: "chat.message.theme.swatch.text",
  muted: "chat.message.theme.swatch.muted",
  border: "chat.message.theme.swatch.border",
};

const BACKGROUNDS_REASON_KEYS = {
  image_budget: "chat.message.theme.reason.imageBudget",
  usage_unavailable: "chat.message.theme.reason.usageUnavailable",
  generation_failed: "chat.message.theme.reason.generationFailed",
};

const UNAVAILABLE_REASON_KEY = "chat.message.theme.backgroundsUnavailable";
const DEFAULT_PALETTE = {
  background: "#000000",
  surface: "#1a1a1a",
  text: "#f0f0f0",
  muted: "#a2a2a2",
  border: "#333333",
};

/** Dispatch the app-wide "open Settings" request (MainApp listens for it). */
export function dispatchOpenSettings() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
  } catch {
    // A missing CustomEvent/dispatchEvent must never break a message render.
  }
}

export function isSafePaletteColor(value) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}

export function safePaletteColor(value, fallback) {
  if (isSafePaletteColor(value)) return value.trim();
  return fallback || DEFAULT_PALETTE.background;
}

function safeImageUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url) return "";
  if (url.startsWith("//")) return "";
  if (url.startsWith("/") || /^https?:\/\//i.test(url)) return url;
  return "";
}

function normalizeImagePair(images) {
  if (!images || typeof images !== "object") return null;
  const desktop = safeImageUrl(images.desktop);
  const mobile = safeImageUrl(images.mobile);
  if (!desktop || !mobile) return null;
  return { desktop, mobile };
}

/**
 * Validate and normalise a proposal object (or its JSON text). Returns null
 * for anything malformed; the caller falls back to rendering plain text.
 */
export function parseThemeProposal(value) {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (data.v !== 1) return null;
    if (typeof data.proposalId !== "string" || !data.proposalId.trim()) {
      return null;
    }
    if (typeof data.name !== "string" || !data.name.trim()) return null;
    const palette = data.palette;
    if (!palette || typeof palette !== "object") return null;
    const colors = {};
    for (const key of PALETTE_KEYS) {
      if (!isSafePaletteColor(palette[key])) return null;
      colors[key] = palette[key].trim();
    }
    const images = normalizeImagePair(data.images);
    const options =
      data.options && typeof data.options === "object" ? data.options : {};
    const slots = data.slots && typeof data.slots === "object" ? data.slots : {};
    const used = Number(slots.used);
    const max = Number(slots.max);
    const expiresAt = Number(data.expiresAt);
    return {
      v: 1,
      proposalId: data.proposalId.trim(),
      name: data.name.trim(),
      palette: colors,
      images,
      imagePrompts:
        data.imagePrompts && typeof data.imagePrompts === "object"
          ? {
              desktop:
                typeof data.imagePrompts.desktop === "string"
                  ? data.imagePrompts.desktop
                  : "",
              mobile:
                typeof data.imagePrompts.mobile === "string"
                  ? data.imagePrompts.mobile
                  : "",
            }
          : { desktop: "", mobile: "" },
      options: {
        palette: options.palette !== false,
        backgrounds: options.backgrounds === true && images !== null,
        backgroundsReason:
          typeof options.backgroundsReason === "string"
            ? options.backgroundsReason
            : null,
      },
      slots: {
        used: Number.isFinite(used) ? Math.max(0, used) : 0,
        max: Number.isFinite(max) && max > 0 ? Math.max(1, max) : 2,
      },
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0,
    };
  } catch {
    return null;
  }
}

function splitSettingsMarkers(text) {
  if (!text) return [];
  const pattern = new RegExp(SETTINGS_MARKER_SOURCE, "g");
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "settings" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }
  return parts;
}

/**
 * Split assistant content into text / theme-proposal / settings-action parts.
 * Unparseable fences degrade to plain text (never raw JSON, never a code block).
 */
export function splitThemeContent(text) {
  if (!text || typeof text !== "string") return [{ type: "text", content: "" }];
  const pattern = new RegExp(FENCE_SOURCE, "g");
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...splitSettingsMarkers(text.slice(lastIndex, match.index)));
    }
    const proposal = parseThemeProposal(match[1]);
    if (proposal) {
      parts.push({ type: "theme", proposal });
    } else {
      const fallback = match[1].trim();
      if (fallback) parts.push({ type: "text", content: fallback });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(...splitSettingsMarkers(text.slice(lastIndex)));
  }
  if (parts.length === 0) parts.push({ type: "text", content: text });
  return parts;
}

/** The "Open Settings" recovery action used by limit/expired messages. */
export function ThemeSettingsAction() {
  const { t } = useI18n();
  return (
    <div className="theme-settings-action">
      <button
        type="button"
        className="theme-settings-action-btn"
        onClick={dispatchOpenSettings}
      >
        <Settings2 size={14} strokeWidth={1.8} aria-hidden="true" />
        <span>{t("chat.message.theme.openSettings")}</span>
      </button>
    </div>
  );
}

function PaletteSwatches({ palette }) {
  const { t } = useI18n();
  return (
    <div
      className="theme-proposal-card__swatches"
      role="list"
      aria-label={t("chat.message.theme.paletteLabel")}
    >
      {PALETTE_KEYS.map((key) => (
        <span
          key={key}
          role="listitem"
          className="theme-proposal-card__swatch"
          style={{ backgroundColor: safePaletteColor(palette && palette[key]) }}
          title={t(SWATCH_LABEL_KEYS[key])}
        >
          <span className="theme-proposal-card__sr">
            {t(SWATCH_LABEL_KEYS[key])}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The interactive proposal card. Every state is derived from the proposal plus
 * the theme context, so a reload re-renders the same result. The component is
 * defensive by design: a malformed proposal renders nothing and no handler is
 * allowed to throw into the message tree.
 */
export function ThemeProposalCard({ proposal, readOnly = false }) {
  const { t } = useI18n();
  const themeContext = useTheme();
  const [referenceNow] = useState(() => Date.now());
  const [appliedOption, setAppliedOption] = useState(null);
  const [pendingOption, setPendingOption] = useState(null);
  const [discarded, setDiscarded] = useState(false);
  const [error, setError] = useState(null);

  if (!proposal || typeof proposal !== "object" || !proposal.proposalId) {
    return null;
  }

  const customThemes = Array.isArray(themeContext && themeContext.customThemes)
    ? themeContext.customThemes
    : [];
  const matchingTheme = customThemes.find(
    (entry) => entry && entry.proposalId === proposal.proposalId,
  );
  const derivedApplied = matchingTheme
    ? matchingTheme.images
      ? "backgrounds"
      : "palette"
    : null;
  const activeApplied = appliedOption || derivedApplied;

  const palette = proposal.palette || DEFAULT_PALETTE;
  const images = proposal.images || null;
  const options = proposal.options || {};
  const slots = proposal.slots || { used: 0, max: 2 };
  const expiresAt = Number(proposal.expiresAt) || 0;

  const expiredByTime = Boolean(expiresAt && referenceNow >= expiresAt);
  const expiredByServer = Boolean(
    error && (Number(error.status) === 410 || error.code === "proposal_expired"),
  );
  const expired = expiredByTime || expiredByServer;
  const limitBlocked = Boolean(
    error && (Number(error.status) === 409 || error.code === "theme_limit"),
  );
  const busy = pendingOption !== null;
  const locked = busy || Boolean(activeApplied) || discarded || expired;

  const paletteAvailable = options.palette !== false;
  const backgroundsAvailable = Boolean(
    options.backgrounds && images && images.desktop && images.mobile,
  );
  const backgroundsReasonKey =
    (options.backgroundsReason &&
      BACKGROUNDS_REASON_KEYS[options.backgroundsReason]) ||
    UNAVAILABLE_REASON_KEY;

  if (readOnly) {
    return (
      <section
        className="theme-proposal-card theme-proposal-card--readonly"
        aria-label={t("chat.message.theme.cardLabel")}
        data-proposal-id={proposal.proposalId}
      >
        <header className="theme-proposal-card__header">
          <span className="theme-proposal-card__icon" aria-hidden="true">
            <Palette size={15} strokeWidth={1.8} />
          </span>
          <span className="theme-proposal-card__name">{proposal.name}</span>
        </header>
        <PaletteSwatches palette={palette} />
      </section>
    );
  }

  const applyOption = async (option) => {
    if (locked || !proposal.proposalId) return;
    setPendingOption(option);
    setError(null);
    try {
      const applyProposal = themeContext && themeContext.applyProposal;
      if (typeof applyProposal !== "function") {
        setAppliedOption(option);
        return;
      }
      const result = await applyProposal(proposal.proposalId, option);
      if (result && typeof result === "object" && result.images) {
        setAppliedOption("backgrounds");
      } else if (result && typeof result === "object" && result.images === null) {
        setAppliedOption("palette");
      } else {
        setAppliedOption(option);
      }
    } catch (err) {
      setError({
        status: Number(err && err.status) || 0,
        code: typeof (err && err.code) === "string" ? err.code : null,
      });
    } finally {
      setPendingOption(null);
    }
  };

  const discard = async () => {
    if (locked) return;
    setPendingOption("discard");
    setError(null);
    try {
      const discardProposal = themeContext && themeContext.discardProposal;
      const ok =
        typeof discardProposal === "function"
          ? await discardProposal(proposal.proposalId)
          : true;
      if (ok === false) {
        setError({ status: 0, code: null });
      } else {
        setDiscarded(true);
      }
    } catch {
      setError({ status: 0, code: null });
    } finally {
      setPendingOption(null);
    }
  };

  const paletteLabel =
    pendingOption === "palette"
      ? t("chat.message.theme.applying")
      : activeApplied === "palette"
        ? t("chat.message.theme.applied")
        : t("chat.message.theme.applyPalette");
  const backgroundsLabel =
    pendingOption === "backgrounds"
      ? t("chat.message.theme.applying")
      : activeApplied === "backgrounds"
        ? t("chat.message.theme.applied")
        : t("chat.message.theme.applyBackgrounds");

  const cardState = discarded
    ? "discarded"
    : activeApplied
      ? "applied"
      : expired
        ? "expired"
        : limitBlocked
          ? "limit"
          : "idle";

  return (
    <section
      className={"theme-proposal-card theme-proposal-card--" + cardState}
      aria-label={t("chat.message.theme.cardLabel")}
      data-proposal-id={proposal.proposalId}
      data-state={cardState}
    >
      <header className="theme-proposal-card__header">
        <span className="theme-proposal-card__icon" aria-hidden="true">
          <Palette size={15} strokeWidth={1.8} />
        </span>
        <span className="theme-proposal-card__name">{proposal.name}</span>
        <span className="theme-proposal-card__slots">
          {t("chat.message.theme.slots", {
            used: slots.used,
            max: slots.max,
          })}
        </span>
      </header>

      <PaletteSwatches palette={palette} />

      {discarded ? (
        <p className="theme-proposal-card__status" role="status">
          {t("chat.message.theme.discarded")}
        </p>
      ) : (
        <div className="theme-proposal-card__options">
          <div className="theme-proposal-card__option">
            <div className="theme-proposal-card__option-head">
              <span className="theme-proposal-card__option-title">
                {t("chat.message.theme.option.palette")}
              </span>
              {activeApplied === "palette" && (
                <span className="theme-proposal-card__badge is-applied">
                  <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                  {t("chat.message.theme.applied")}
                </span>
              )}
              {activeApplied && activeApplied !== "palette" && (
                <span className="theme-proposal-card__badge is-discarded">
                  {t("chat.message.theme.discardedOption")}
                </span>
              )}
            </div>
            <p className="theme-proposal-card__option-desc">
              {t("chat.message.theme.option.paletteDescription")}
            </p>
            <button
              type="button"
              className="theme-proposal-card__apply"
              onClick={() => applyOption("palette")}
              disabled={!paletteAvailable || locked}
            >
              {pendingOption === "palette" && (
                <Loader2
                  className="spin-icon"
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              )}
              <span>{paletteLabel}</span>
            </button>
          </div>

          <div className="theme-proposal-card__option">
            <div className="theme-proposal-card__option-head">
              <span className="theme-proposal-card__option-title">
                <ImageIcon size={13} strokeWidth={1.8} aria-hidden="true" />
                {t("chat.message.theme.option.backgrounds")}
              </span>
              {activeApplied === "backgrounds" && (
                <span className="theme-proposal-card__badge is-applied">
                  <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                  {t("chat.message.theme.applied")}
                </span>
              )}
              {activeApplied && activeApplied !== "backgrounds" && (
                <span className="theme-proposal-card__badge is-discarded">
                  {t("chat.message.theme.discardedOption")}
                </span>
              )}
            </div>
            <p className="theme-proposal-card__option-desc">
              {t("chat.message.theme.option.backgroundsDescription")}
            </p>
            {images ? (
              <div className="theme-proposal-card__previews">
                <img
                  className="theme-proposal-card__preview is-desktop"
                  src={images.desktop}
                  alt={t("chat.message.theme.previewDesktop")}
                  loading="lazy"
                />
                <img
                  className="theme-proposal-card__preview is-mobile"
                  src={images.mobile}
                  alt={t("chat.message.theme.previewMobile")}
                  loading="lazy"
                />
              </div>
            ) : null}
            {!backgroundsAvailable && (
              <p className="theme-proposal-card__reason">
                {t(backgroundsReasonKey)}
              </p>
            )}
            <button
              type="button"
              className="theme-proposal-card__apply"
              onClick={() => applyOption("backgrounds")}
              disabled={!backgroundsAvailable || locked}
            >
              {pendingOption === "backgrounds" && (
                <Loader2
                  className="spin-icon"
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              )}
              <span>{backgroundsLabel}</span>
            </button>
          </div>
        </div>
      )}

      {!activeApplied && !discarded && (
        <div className="theme-proposal-card__footer">
          <button
            type="button"
            className="theme-proposal-card__discard"
            onClick={discard}
            disabled={locked}
          >
            {t("chat.message.theme.discard")}
          </button>
        </div>
      )}

      {limitBlocked && (
        <div className="theme-proposal-card__notice is-limit" role="status">
          <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("chat.message.theme.limit", { max: slots.max })}</span>
          <button
            type="button"
            className="theme-proposal-card__settings"
            onClick={dispatchOpenSettings}
          >
            <Settings2 size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("chat.message.theme.openSettings")}</span>
          </button>
        </div>
      )}

      {!limitBlocked && expired && (
        <div className="theme-proposal-card__notice is-expired" role="status">
          <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("chat.message.theme.expired")}</span>
          {expiredByServer && (
            <button
              type="button"
              className="theme-proposal-card__settings"
              onClick={dispatchOpenSettings}
            >
              <Settings2 size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>{t("chat.message.theme.openSettings")}</span>
            </button>
          )}
        </div>
      )}

      {!limitBlocked && !expired && !discarded && error && (
        <div className="theme-proposal-card__notice is-error" role="status">
          <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("chat.message.theme.error")}</span>
        </div>
      )}
    </section>
  );
}

export default ThemeProposalCard;
