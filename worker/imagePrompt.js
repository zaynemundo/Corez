/**
 * Image prompt enhancement.
 *
 * A bare user request ("flower") underspecifies the image: FLUX/SDXL fill
 * the gaps with defaults, so results look generic. This expands a short
 * request into a complete generator prompt — subject plus style, lighting
 * and quality descriptors — while leaving crafted prompts untouched.
 *
 * Style-aware: the old rule appended "photorealistic" to everything short,
 * which fought explicit styles ("anime girl" came back photographic).
 * Detection picks a photographic, portrait, illustration or logo tail, and
 * any prompt that already carries craft (long, comma-structured, or with
 * quality/style markers) passes through byte-identical.
 */

export const MAX_IMAGE_PROMPT_CHARS = 600;

// "@image", "/image", "/imagine" command prefixes.
const COMMAND_PREFIX = /^(?:@image\b\s*|\/(?:image|imagine)\b\s*)/i;
// "generate an image of X", "create a picture X", "make me a logo of Y".
const VERB_PREFIX =
  /^(?:please\s+)?(?:generate|create|make|draw|paint|design|show\s+me|give\s+me)\s+(?:an?\s+|some\s+)?(?:image|picture|photo|pic|drawing|painting|artwork|logo|icon)(?:\s+of)?\s+/i;
// "draw me a cat", "paint a sunset".
const DRAW_PREFIX = /^(?:please\s+)?(?:draw|paint)(?:\s+me)?\s+/i;
// "a drawing of a cat", "photo of my dog".
const OF_PREFIX =
  /^(?:an?\s+|some\s+)?(?:image|picture|photo|pic|drawing|painting)\s+of\s+/i;

const PHOTO_TAIL =
  "ultra-detailed photograph, sharp focus, natural lighting, vibrant colors, high resolution, 4k";
const PORTRAIT_TAIL =
  "professional portrait photography, 85mm lens, soft bokeh, studio lighting, ultra detailed, 4k";
const ART_TAIL =
  "highly detailed digital artwork, rich colors, dynamic composition, sharp focus, 4k";
const LOGO_TAIL =
  "flat vector design, minimal, clean lines, solid plain background";

const ILLUSTRATION_HINT =
  /\b(anime|manga|cartoon|comic|chibi|ghibli|watercolor|watercolour|oil painting|painting|drawing|sketch|doodle|pixel art|pixelart|3d render|digital art|concept art|fantasy|illustration|storybook)\b/i;
const LOGO_HINT = /\b(logo|icon|icons|emblem|badge|sticker|brand mark)\b/i;
const PORTRAIT_HINT =
  /\b(portrait|portraits|woman|man|girl|boy|child|couple|face|model|person|people|astronaut|knight|queen|king)\b/i;
// The user already art-directed: leave the prompt alone.
const CRAFT_MARKER =
  /4k|8k|\bhd\b|photorealistic|ultra[-\s]?detailed|sharp focus|studio lighting|bokeh|cinematic|artstation/i;

/** Strip chat-command wrappers down to the bare subject. */
export function stripImageCommandWrappers(prompt) {
  let subject = String(prompt || "").trim();
  for (let round = 0; round < 3; round += 1) {
    const next = subject
      .replace(COMMAND_PREFIX, "")
      .replace(VERB_PREFIX, "")
      .replace(DRAW_PREFIX, "")
      .replace(OF_PREFIX, "")
      .trim();
    if (next === subject) break;
    subject = next;
  }
  return subject.replace(/[.?!]+$/, "").trim();
}

/** True when the prompt is already art-directed — never clobber it. */
export function isRichImagePrompt(subject) {
  const text = String(subject || "");
  if (text.length >= 120) return true;
  if ((text.match(/,/g) || []).length >= 2) return true;
  return CRAFT_MARKER.test(text);
}

function truncatePrompt(text) {
  const s = String(text || "").trim();
  if (s.length <= MAX_IMAGE_PROMPT_CHARS) return s;
  return s
    .slice(0, MAX_IMAGE_PROMPT_CHARS)
    .replace(/[,\s]+$/, "")
    .trim();
}

/**
 * Expand a short image request into a complete generator prompt.
 * Returns "" for empty input (callers validate required-ness themselves).
 */
export function enhanceImagePrompt(prompt) {
  const subject = stripImageCommandWrappers(prompt);
  if (!subject) return "";
  if (isRichImagePrompt(subject)) return truncatePrompt(subject);
  const lower = subject.toLowerCase();
  let tail = PHOTO_TAIL;
  if (LOGO_HINT.test(lower)) tail = LOGO_TAIL;
  else if (ILLUSTRATION_HINT.test(lower)) tail = ART_TAIL;
  else if (PORTRAIT_HINT.test(lower)) tail = PORTRAIT_TAIL;
  return truncatePrompt(`${subject}, ${tail}`);
}
