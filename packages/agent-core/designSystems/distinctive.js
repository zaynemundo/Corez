/**
 * Per-build distinctive direction.
 *
 * Six archetypes are not enough to stop every site looking alike. They pin the
 * palette and the font stack, but two briefs that score the same keywords still
 * get the same hero, the same rhythm and the same type treatment, because
 * nothing varies *inside* an archetype -- and the model falls back to the
 * layout it reaches for by default.
 *
 * This module varies that. Five independent axes (composition, typography,
 * colour, a signature detail, motion) are each chosen from six options by a
 * hash of the task seed, so a given task always resolves to the same direction
 * -- retries and resumes must re-emit the same artifact -- while two different
 * tasks almost never share one. 6^5 = 7,776 combinations per archetype.
 *
 * The axes are deliberately orthogonal: any option can be combined with any
 * other, and none of them contradict the archetype's tokens or fonts.
 */

/** FNV-1a, 32-bit. Stable across processes, unlike Math.random(). */
export function hash32(text) {
  let hash = 0x811c9dc5;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A seed for one build. Same seed in, same direction out. */
export function designSeed(parts) {
  const value = Array.isArray(parts) ? parts.join('|') : String(parts || '');
  return `design-${hash32(value).toString(16).padStart(8, '0')}`;
}

function pick(options, seed, axis) {
  return options[hash32(`${seed}:${axis}`) % options.length];
}

export const COMPOSITION = Object.freeze([
  "Asymmetric split hero: the headline and its action occupy 7 of 12 columns, the supporting visual takes the remaining 5 and bleeds off the right edge.",
  "Full-bleed opening: one oversized image or colour field spans the viewport and the headline overlaps it rather than sitting under it.",
  "Zig-zag rhythm: alternate sections between left- and right-weighted content so the eye travels down the page in a diagonal.",
  "Sticky side rail: a narrow fixed column carries the section labels and navigation while the content scrolls past it.",
  "One horizontal band: a single section scrolls sideways as a row of panels, breaking the vertical monotony exactly once.",
  "Typographic hero: no hero image at all -- the headline is the artwork, set at viewport scale and carrying the whole opening.",
]);

export const TYPOGRAPHY = Object.freeze([
  "Set display type with clamp() so it scales with the viewport, tight tracking (-0.03em) and generous leading (1.05-1.15).",
  "Pair a high-contrast serif display face with a neutral sans for body copy, and never set the serif below 24px.",
  "Use small-caps, wide-tracked labels (0.12em) against large sentence-case headlines to carry the hierarchy.",
  "Number the sections in oversized outlined numerals as a running motif down the page.",
  "Hold body copy to a 60-75 character measure and use a single weight throughout, letting size alone build hierarchy.",
  "Emphasise one word of the main headline with weight or colour -- never with a gradient fill.",
]);

export const COLOUR = Object.freeze([
  "One accent colour only, on no more than three elements per screen; everything else is neutral.",
  "Derive the whole palette from a single hue: tint and shade it for surfaces instead of introducing new colours.",
  "Invert exactly one full section (dark-on-light or light-on-dark) to break the page into chapters.",
  "Warm neutral base, paper-like, with one saturated accent reserved strictly for actions.",
  "Duotone: two hues in total, with no third colour anywhere in the interface.",
  "Near-monochrome, with colour appearing only in imagery and in hover states.",
]);

export const SIGNATURE = Object.freeze([
  "A hairline rule between every section, with the section label sitting on the rule.",
  "One recurring element carries a clipped corner or a diagonal cut, and nothing else does.",
  "A single marquee band of the product name or a key phrase, used once and never repeated.",
  "Numbered indices (01, 02, 03) marking every major section.",
  "One oversized statistic or quotation that spans the full width and interrupts the page.",
  "Crop marks or corner ticks framing the main content, like a print layout.",
]);

export const MOTION = Object.freeze([
  "Reveal content on scroll with a short fade-and-rise, staggered by about 60ms.",
  "Hover moves the whole card by 2-4px with a soft shadow change, and nothing else animates.",
  "A single scroll-linked progress indicator follows the reader down the page.",
  "A subtle magnetic pull on primary buttons, released on blur.",
  "No scroll animation at all: keep motion to hover, focus and active states only.",
  "An animated underline draws in on link hover, and is the only animated line on the page.",
]);

/**
 * The five choices for one seed.
 *
 * @param {string} seed - stable per build (the harness task id is ideal).
 * @returns {{ composition: string, typography: string, colour: string,
 *   signature: string, motion: string }}
 */
export function distinctiveDirection(seed) {
  const key = String(seed || 'default');
  return {
    composition: pick(COMPOSITION, key, 'composition'),
    typography: pick(TYPOGRAPHY, key, 'typography'),
    colour: pick(COLOUR, key, 'colour'),
    signature: pick(SIGNATURE, key, 'signature'),
    motion: pick(MOTION, key, 'motion'),
  };
}

/**
 * The direction as prompt text. Phrased as requirements, because a suggestion
 * is exactly what the model already ignores when it reaches for its default
 * template.
 *
 * @param {string} seed - stable per build.
 * @returns {string} a markdown block, or '' when no seed was supplied.
 */
export function formatDistinctivePrompt(seed) {
  if (!seed) return '';
  const d = distinctiveDirection(seed);
  return [
    "### This Build's Distinctive Direction",
    'These five choices were made for this brief alone. Apply all five together; do not substitute a layout, palette or type treatment you would reach for by default.',
    `- **Composition**: ${d.composition}`,
    `- **Typography**: ${d.typography}`,
    `- **Colour**: ${d.colour}`,
    `- **Signature detail**: ${d.signature}`,
    `- **Motion**: ${d.motion}`,
  ].join('\n');
}
