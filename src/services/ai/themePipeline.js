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
export function buildThemeIntro(proposal) {
  const name =
    proposal && typeof proposal.name === "string" && proposal.name.trim()
      ? proposal.name.trim()
      : "custom";
  return `Here's your **${name}** theme. Apply it with **Colors only**, or with **Colors + backgrounds** to keep the generated desktop and mobile artwork.`;
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
  if (status === 409 || code === "theme_limit") return themeLimitMessage();
  if (status === 401 || status === 403) return SIGN_IN_MESSAGE;
  if (status === 400) return INVALID_PROMPT_MESSAGE;
  if (status === 429) return BUSY_MESSAGE;
  if (status === 502 || code === "theme_design_failed")
    return DESIGN_FAILED_MESSAGE;
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
export async function runThemeCommand(themePrompt, signal = null) {
  const prompt = String(themePrompt || "").trim();
  if (!prompt) return EXAMPLE_MESSAGE;

  let response;
  try {
    const fetchOptions = {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
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

  return `${buildThemeIntro(proposal)}\n\n${formatThemeProposalFence(proposal)}`;
}

export default runThemeCommand;
