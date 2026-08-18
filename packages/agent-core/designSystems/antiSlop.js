/**
 * Anti-AI-Slop Visual Guidelines & Heuristics
 * Inspired by Open-Design (nexu-io/open-design) and modern web interface standards.
 */

export const FORBIDDEN_DESIGN_TROPES = Object.freeze([
  'NO generic purple-on-dark text or violet-heavy accents on black backgrounds unless explicitly requested.',
  'NO arbitrary neon-colored glowing borders on unselected container elements.',
  'NO textureless flat dark containers with zero depth, layering, or contrast separation.',
  'NO huge display fonts without proper tracking (letter-spacing: -0.02em to -0.04em for display headlines).',
  'NO icon-stuffed bento boxes where every tile has an unrelated icon without information hierarchy.',
  'NO headline biscuit/pill badges with pulsing dots placed redundantly right above every header.',
  'NO CSS gradient text fills across random headline keywords.',
  'NO repetitive decorative grid line backgrounds or particle mesh overlays that reduce readability.',
  'NO over-nested cards (avoid cards inside cards inside cards; maximum 2 nesting levels).',
  'NO unstyled form controls, unformatted textboxes, or unanchored floating buttons.'
]);

export const QUALITY_DESIGN_STANDARDS = Object.freeze([
  'WCAG 2.2 AA Contrast: Ensure at least 4.5:1 contrast for normal body text and 3:1 for large display text.',
  'Optical Typography: Use high-quality Google Fonts (Inter, Geist, Plus Jakarta Sans, Playfair, Space Grotesk) with refined line-height (1.4-1.6 for body, 1.1-1.2 for headlines).',
  'Micro-Interactions: Every button, link, and interactive card MUST have explicit :hover, :active, and :focus-visible states with 150ms-250ms smooth transitions.',
  'Layered Visual Depth: Strict z-index stacking hierarchy (Background z:0 -> Content z:10 -> Header/Nav z:20-30 -> Modals/Overlays z:50+).',
  'Fluid Responsive Layouts: Mobile-first flex/grid architectures that seamlessly adapt between 320px, 768px, 1024px, and 1440px+ viewports without horizontal scrolling or broken elements.'
]);

export function formatAntiSlopPrompt() {
  let prompt = '## Anti-Slop & Quality Design Guidelines\n';
  prompt += '### Prohibited Patterns (NEVER use these):\n';
  for (const trope of FORBIDDEN_DESIGN_TROPES) {
    prompt += `- ${trope}\n`;
  }
  prompt += '\n### Required Quality Standards:\n';
  for (const standard of QUALITY_DESIGN_STANDARDS) {
    prompt += `- ${standard}\n`;
  }
  return prompt;
}
