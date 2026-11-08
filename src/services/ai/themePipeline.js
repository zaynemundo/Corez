// @theme command pipeline.
//
// The composer's `@theme <description>` command asks the worker to design a
// colour palette (plus optional desktop/mobile background art). The worker
// answers with a proposal JSON, which is delivered to the chat as a fenced
// `corez-theme` block: message content is the source of truth, so the
// proposal card survives a reload and the shared-chat viewer can show the
// palette without calling an owner-protected asset route.
//
// This module is deliberately dependency-free (no i18n, no React): the chat
// service layer returns plain English strings, the card localises its own
// chrome.
export const THEME_PROPOSE_ENDPOINT = "/api/themes/propose";

// The fence info string the assistant content carries. ChatMessage splits this
// out BEFORE its generic markdown/code renderer so the JSON never becomes a
// code block.
export const THEME_FENCE_INFO = "corez-theme";

// Inline marker the proposal error paths append so the chat renderer can offer
// the one recovery action those states actually have ("Open Settings").
export const OPEN_SETTINGS_MARKER = "[[corez:open-settings]]";

export const THEME_LIMIT_MESSAGE =
  "You already have the maximum of 2 custom themes. Delete one in Settings to make room for this one.";

const EXAMPLE_MESSAGE =
  "Tell me the theme you want to create, e.g. `@theme warm sunset with soft gradients`.";

const SIGN_IN_MESSAGE =
  "Please sign in to create a custom theme.";

const INVALID_PROMPT_MESSAGE =
  "I couldn't design that theme. Try describing the colours or mood differently.";

const BUSY_MESSAGE =
  "Theme design is busy right now. Please try again in a moment.";

const DAILY_LIMIT_MESSAGE =
  "You've reached today's limit for new theme proposals. Try again tomorrow.";

const COOLING_MESSAGE =
  "Theme design is cooling down for a moment — try again in a few seconds.";

const UNAVAILABLE_MESSAGE =
  "Theme design is unavailable right now. Please try again in a moment.";

const DESIGN_FAILED_MESSAGE =
  "The theme designer couldn't finish this proposal. Please try again.";

const NETWORK_MESSAGE =
  "I couldn't reach the theme designer. Check your connection and try again.";

const EXPIRED_MESSAGE =
  "That theme proposal has expired. Ask for a new one with `@theme`.";

const PROPOSAL_USED_MESSAGE =
  "That theme proposal has already been applied. Ask for a new one with `@theme`.";

/**
 * Build the short intro that sits above the proposal fence. Tests and the UI
 * both rely on the two option labels appearing verbatim.
 */
const HEX_COLOR_VALUE = /^#[0-9a-fA-F]{6}$/;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR_VALUE.test(value.trim());
}

/**
 * Turn raw RGBA pixel data into a small ordered set of representative colours
 * (dominant first). Pure and deterministic so the sampling is testable without
 * a canvas.
 *
 * @param {ArrayLike<number>} data RGBA bytes (4 per pixel)
 * @param {number} limit maximum number of colours
 * @returns {string[]} #rrggbb strings
 */
export function quantizeImagePixels(data, limit = 6) {
  if (!data || typeof data.length !== "number") return [];
  const bins = new Map();
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3];
    if (typeof alpha === "number" && alpha < 128) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    // 16 levels per channel: enough to keep photograph oranges together
    // without one noisy pixel becoming its own theme colour.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }

  const averaged = [...bins.values()]
    .map((bin) => ({
      count: bin.count,
      r: Math.round(bin.r / bin.count),
      g: Math.round(bin.g / bin.count),
      b: Math.round(bin.b / bin.count),
    }))
    .sort((first, second) => second.count - first.count);

  const accepted = [];
  for (const color of averaged) {
    if (accepted.length >= limit) break;
    // Collapse near-identical shades so the palette does not spend all six
    // slots on six slightly different oranges.
    const duplicate = accepted.some(
      (kept) =>
        Math.abs(kept.r - color.r) +
          Math.abs(kept.g - color.g) +
          Math.abs(kept.b - color.b) <
        48,
    );
    if (!duplicate) accepted.push(color);
  }

  return accepted.map(
    ({ r, g, b }) =>
      "#" +
      [r, g, b]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join(""),
  );
}

function dataUrlForAttachment(attachment) {
  for (const candidate of [attachment?.thumb, attachment?.content]) {
    if (typeof candidate === "string" && IMAGE_DATA_URL.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pixelsForImage(dataUrl) {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) {
            finish(null);
            return;
          }
          context.drawImage(image, 0, 0, 48, 48);
          finish(context.getImageData(0, 0, 48, 48).data);
        } catch {
          finish(null);
        }
      };
      image.onerror = () => finish(null);
      image.src = dataUrl;
      // A broken/oversized image must never stall the whole command.
      setTimeout(() => finish(null), 1200);
    } catch {
      finish(null);
    }
  });
}

/**
 * Dominant colours of the images attached to the command (max three images,
 * six colours). Returns [] when there is nothing to sample, so the command
 * still works on a plain text description.
 */
export async function extractReferenceColors(attachments, limit = 6) {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return [];
  }
  const urls = (Array.isArray(attachments) ? attachments : [])
    .map(dataUrlForAttachment)
    .filter(Boolean)
    .slice(0, 3);
  if (urls.length === 0) return [];

  const colors = [];
  for (const url of urls) {
    const pixels = await pixelsForImage(url);
    if (!pixels) continue;
    for (const color of quantizeImagePixels(pixels, limit)) {
      if (!colors.includes(color)) colors.push(color);
    }
    if (colors.length >= limit) break;
  }
  return colors.slice(0, limit);
}

/**
 * Build the short intro that sits above the proposal fence. Tests and the UI
 * both rely on the two option labels appearing verbatim.
 */
export function buildThemeIntro(proposal, { hasReference = false } = {}) {
  const name =
    proposal && typeof proposal.name === "string" && proposal.name.trim()
      ? proposal.name.trim()
      : "custom";
  const reference = hasReference
    ? " I matched the palette to the colours in your attached image."
    : "";
  return (
    "Here" +
    String.fromCharCode(39) +
    "s your **" +
    name +
    "** theme." +
    reference +
    " Apply it with **Colors only**, or with **Colors + backgrounds** to keep the generated desktop and mobile artwork."
  );
}
/**
 * Serialise a proposal into the exact fence the assistant content carries.
 */
export function formatThemeProposalFence(proposal) {
  return `\`\`\`${THEME_FENCE_INFO}\n${JSON.stringify(proposal, null, 2)}\n\`\`\``;
}

export function themeLimitMessage() {
  return `${THEME_LIMIT_MESSAGE}\n\n${OPEN_SETTINGS_MARKER}`;
}

/**
 * Turn a failed propose response into a friendly, actionable chat message.
 * Exported so the mapping is testable without mocking fetch.
 */
export function mapThemeProposalError(status, code) {
  if (code === "proposal_expired" || status === 410) return EXPIRED_MESSAGE;
  if (code === "proposal_used") return PROPOSAL_USED_MESSAGE;
  if (code === "theme_limit" || status === 409) return themeLimitMessage();
  if (code === "proposal_limit") return DAILY_LIMIT_MESSAGE;
  if (code === "rate_limited") return COOLING_MESSAGE;
  if (status === 401 || status === 403) return SIGN_IN_MESSAGE;
  if (status === 400) return INVALID_PROMPT_MESSAGE;
  if (status === 429) return BUSY_MESSAGE;
  if (code === "theme_design_failed" || status === 502) {
    return DESIGN_FAILED_MESSAGE;
  }
  if (status === 503) return UNAVAILABLE_MESSAGE;
  return NETWORK_MESSAGE;
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return typeof data?.code === "string" ? data.code : null;
  } catch {
    return null;
  }
}

/**
 * Run the `@theme` command.
 *
 * Returns chat markdown: a short intro followed by a `corez-theme` fence on
 * success, or a friendly plain-text message on every failure. An empty prompt
 * never spends a request.
 */
export async function runThemeCommand(themePrompt, signal = null, options = {}) {
  const prompt = String(themePrompt || "").trim();
  if (!prompt) return EXAMPLE_MESSAGE;

  // Colours sampled from an attached image (or supplied by a caller) steer the
  // designer towards the picture instead of a text-only mood guess.
  const referenceColors = Array.isArray(options.referenceColors)
    ? options.referenceColors
        .filter(isHexColor)
        .map((value) => value.trim().toLowerCase())
        .slice(0, 6)
    : await extractReferenceColors(options.attachments);

  let response;
  try {
    const requestBody = { prompt };
    if (referenceColors.length > 0) {
      requestBody.referenceColors = referenceColors;
    }
    const fetchOptions = {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };
    if (signal) fetchOptions.signal = signal;
    response = await fetch(THEME_PROPOSE_ENDPOINT, fetchOptions);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return NETWORK_MESSAGE;
  }

  if (!response.ok) {
    const code = await readErrorMessage(response);
    return mapThemeProposalError(response.status, code);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return NETWORK_MESSAGE;
  }

  const proposal = data?.proposal;
  if (!proposal || typeof proposal !== "object") {
    return DESIGN_FAILED_MESSAGE;
  }

  return (
    buildThemeIntro(proposal, {
      hasReference: referenceColors.length > 0,
    }) +
    "\n\n" +
    formatThemeProposalFence(proposal)
  );
}

export default runThemeCommand;