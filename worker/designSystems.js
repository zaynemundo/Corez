/**
 * Worker-Compatible Design Systems Engine
 * Inspired by Open-Design (nexu-io/open-design)
 */

export const DESIGN_ARCHETYPES = Object.freeze({
  "linear-dark": {
    id: "linear-dark",
    name: "Linear Dark Minimal",
    description:
      "Precision engineering aesthetic with dark surfaces, monochromatic borders, Geist typography, and glowing accents.",
    keywords: [
      "linear",
      "dark",
      "developer",
      "minimal",
      "tech",
      "tool",
      "crypto",
      "dashboard",
      "terminal",
      "api",
      "code",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap");',
    fontFamilies: {
      display:
        '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      body: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"JetBrains Mono", monospace',
    },
    tokens: {
      "--bg-primary": "#090a0f",
      "--bg-secondary": "#111218",
      "--bg-tertiary": "#181922",
      "--bg-elevated": "#20222e",
      "--text-primary": "#f3f4f6",
      "--text-secondary": "#9ca3af",
      "--text-muted": "#6b7280",
      "--accent": "#3b82f6",
      "--accent-hover": "#60a5fa",
      "--accent-glow": "rgba(59, 130, 246, 0.25)",
      "--border-subtle": "rgba(255, 255, 255, 0.08)",
      "--border-highlight": "rgba(255, 255, 255, 0.16)",
      "--radius-sm": "6px",
      "--radius-md": "10px",
      "--radius-lg": "16px",
      "--shadow-subtle": "0 1px 3px rgba(0,0,0,0.5)",
      "--shadow-elevated": "0 12px 36px -12px rgba(0,0,0,0.7)",
      "--transition-smooth": "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
    },
    signatureInteractions: [
      "Cards: subtle border brightness boost on hover with translateY(-2px)",
      "Buttons: active scale(0.98) with instant tactile response",
      "Navigation: sticky blur navbar with backdrop-filter: blur(16px)",
    ],
  },

  "apple-glass": {
    id: "apple-glass",
    name: "Apple Spatial Glass",
    description:
      "Refined Cupertino-style frosted glass surfaces, physical spring transitions, rounded geometry, and pristine typography.",
    keywords: [
      "apple",
      "ios",
      "glass",
      "glassmorphism",
      "translucent",
      "macos",
      "spatial",
      "clean",
      "sleek",
      "modern",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap");',
    fontFamilies: {
      display:
        '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      body: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"SF Mono", "Fira Code", monospace',
    },
    tokens: {
      "--bg-primary": "#0a0d14",
      "--bg-secondary": "rgba(255, 255, 255, 0.04)",
      "--bg-tertiary": "rgba(255, 255, 255, 0.08)",
      "--bg-elevated": "rgba(255, 255, 255, 0.12)",
      "--text-primary": "#ffffff",
      "--text-secondary": "rgba(255, 255, 255, 0.72)",
      "--text-muted": "rgba(255, 255, 255, 0.45)",
      "--accent": "#0a84ff",
      "--accent-hover": "#409cff",
      "--accent-glow": "rgba(10, 132, 255, 0.3)",
      "--border-subtle": "rgba(255, 255, 255, 0.12)",
      "--border-highlight": "rgba(255, 255, 255, 0.24)",
      "--radius-sm": "10px",
      "--radius-md": "18px",
      "--radius-lg": "26px",
      "--shadow-subtle": "0 4px 20px rgba(0, 0, 0, 0.25)",
      "--shadow-elevated": "0 20px 50px rgba(0, 0, 0, 0.5)",
      "--transition-smooth": "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    },
    signatureInteractions: [
      "Surfaces: backdrop-filter: blur(24px) saturate(180%)",
      "Interactions: spring-like bounce on press (transform: scale(0.97))",
      "Elevated cards: dynamic frosted glass border lighting",
    ],
  },

  "editorial-serif": {
    id: "editorial-serif",
    name: "Editorial & Luxury Broadside",
    description:
      "High-end publication layout with expressive serif headlines, warm contrast tones, asymmetric columns, and exquisite text hierarchy.",
    keywords: [
      "editorial",
      "magazine",
      "luxury",
      "fashion",
      "blog",
      "article",
      "news",
      "journal",
      "serif",
      "publishing",
      "story",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,600&family=Inter:wght@400;500;600&display=swap");',
    fontFamilies: {
      display: '"Newsreader", Georgia, serif',
      body: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      mono: '"Newsreader", Georgia, serif',
    },
    tokens: {
      "--bg-primary": "#0e0f12",
      "--bg-secondary": "#16181d",
      "--bg-tertiary": "#1f2229",
      "--bg-elevated": "#282c35",
      "--text-primary": "#f5f3ef",
      "--text-secondary": "#c4c1ba",
      "--text-muted": "#827f79",
      "--accent": "#e2b36e",
      "--accent-hover": "#f0c78a",
      "--accent-glow": "rgba(226, 179, 110, 0.2)",
      "--border-subtle": "rgba(245, 243, 239, 0.09)",
      "--border-highlight": "rgba(245, 243, 239, 0.18)",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "14px",
      "--shadow-subtle": "0 2px 8px rgba(0, 0, 0, 0.4)",
      "--shadow-elevated": "0 16px 40px rgba(0, 0, 0, 0.6)",
      "--transition-smooth": "all 0.25s ease",
    },
    signatureInteractions: [
      "Headlines: rich italic serif accents and subtle drop caps",
      "Images: warm tone filter with hover contrast shift",
      "Layout: multi-column asymmetric newspaper-inspired grid",
    ],
  },

  "modern-saas": {
    id: "modern-saas",
    name: "Enterprise High-Trust SaaS",
    description:
      "Clean, dependable business interface with accessible indigo/slate palette, structured data tables, status badges, and crystal clarity.",
    keywords: [
      "saas",
      "enterprise",
      "business",
      "crm",
      "analytics",
      "finance",
      "fintech",
      "dashboard",
      "billing",
      "b2b",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap");',
    fontFamilies: {
      display: '"Plus Jakarta Sans", sans-serif',
      body: '"Plus Jakarta Sans", sans-serif',
      mono: '"JetBrains Mono", monospace',
    },
    tokens: {
      "--bg-primary": "#0f172a",
      "--bg-secondary": "#1e293b",
      "--bg-tertiary": "#334155",
      "--bg-elevated": "#475569",
      "--text-primary": "#f8fafc",
      "--text-secondary": "#cbd5e1",
      "--text-muted": "#94a3b8",
      "--accent": "#6366f1",
      "--accent-hover": "#818cf8",
      "--accent-glow": "rgba(99, 102, 241, 0.25)",
      "--border-subtle": "rgba(255, 255, 255, 0.1)",
      "--border-highlight": "rgba(255, 255, 255, 0.2)",
      "--radius-sm": "6px",
      "--radius-md": "10px",
      "--radius-lg": "16px",
      "--shadow-subtle": "0 1px 3px rgba(0, 0, 0, 0.3)",
      "--shadow-elevated": "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
      "--transition-smooth": "all 0.18s ease-in-out",
    },
    signatureInteractions: [
      "Pills: live status indicators (emerald for active, amber for pending)",
      "Tables: subtle row hover highlighting and compact cell rhythm",
      "Metrics: crisp numbers with trend indicator pills (+12%)",
    ],
  },

  "cyberpunk-arcade": {
    id: "cyberpunk-arcade",
    name: "Cyberpunk Neon Arcade",
    description:
      "High-voltage retro-futuristic dark mode with vivid cyan and magenta neon accents, pixelated details, and arcade game energy.",
    keywords: [
      "cyberpunk",
      "game",
      "arcade",
      "retro",
      "neon",
      "futuristic",
      "synthwave",
      "pixel",
      "rpg",
      "esports",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap");',
    fontFamilies: {
      display: '"Space Grotesk", sans-serif',
      body: '"Space Grotesk", sans-serif',
      mono: '"JetBrains Mono", monospace',
    },
    tokens: {
      "--bg-primary": "#050508",
      "--bg-secondary": "#0c0d14",
      "--bg-tertiary": "#141622",
      "--bg-elevated": "#1d2030",
      "--text-primary": "#ffffff",
      "--text-secondary": "#00f2fe",
      "--text-muted": "#7982a9",
      "--accent": "#ff007a",
      "--accent-hover": "#ff3399",
      "--accent-glow": "rgba(255, 0, 122, 0.4)",
      "--border-subtle": "rgba(0, 242, 254, 0.2)",
      "--border-highlight": "rgba(255, 0, 122, 0.45)",
      "--radius-sm": "2px",
      "--radius-md": "6px",
      "--radius-lg": "12px",
      "--shadow-subtle": "0 0 12px rgba(0, 242, 254, 0.2)",
      "--shadow-elevated": "0 0 30px rgba(255, 0, 122, 0.35)",
      "--transition-smooth": "all 0.15s cubic-bezier(0, 0, 0.2, 1)",
    },
    signatureInteractions: [
      "Glows: pulse animation on key action buttons",
      "Borders: angular cut corners or high-contrast 2px neon borders",
      "Feedback: scanline overlay texture and crisp hover animations",
    ],
  },

  "bento-grid": {
    id: "bento-grid",
    name: "Modular Bento Showcase",
    description:
      "Modern asymmetric grid layout with cohesive card geometry, interactive widgets, seamless dark surfaces, and delightful micro-interactions.",
    keywords: [
      "bento",
      "grid",
      "showcase",
      "portfolio",
      "features",
      "product",
      "landing",
      "modular",
      "interactive",
    ],
    googleFontsImport:
      '@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap");',
    fontFamilies: {
      display: '"Outfit", sans-serif',
      body: '"Inter", sans-serif',
      mono: '"Fira Code", monospace',
    },
    tokens: {
      "--bg-primary": "#0b0c10",
      "--bg-secondary": "#13141c",
      "--bg-tertiary": "#1c1d27",
      "--bg-elevated": "#252734",
      "--text-primary": "#ffffff",
      "--text-secondary": "#a0a3bd",
      "--text-muted": "#6b6e8a",
      "--accent": "#6366f1",
      "--accent-hover": "#818cf8",
      "--accent-glow": "rgba(99, 102, 241, 0.3)",
      "--border-subtle": "rgba(255, 255, 255, 0.08)",
      "--border-highlight": "rgba(255, 255, 255, 0.16)",
      "--radius-sm": "8px",
      "--radius-md": "16px",
      "--radius-lg": "24px",
      "--shadow-subtle": "0 4px 16px rgba(0, 0, 0, 0.4)",
      "--shadow-elevated": "0 16px 40px rgba(0, 0, 0, 0.6)",
      "--transition-smooth": "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
    },
    signatureInteractions: [
      "Grid: CSS grid with varied span (col-span-2, row-span-2) for visual rhythm",
      "Cards: subtle inner radial gradient highlight on hover",
      "Corners: unified 16px-24px outer and inner concentric radii",
    ],
  },
});

export const FORBIDDEN_DESIGN_TROPES = Object.freeze([
  "NO generic purple-on-dark text or violet-heavy accents on black backgrounds.",
  "NO arbitrary neon-colored glowing borders on unselected container elements.",
  "NO textureless flat dark containers with zero depth or layering.",
  "NO huge display fonts without proper tracking (letter-spacing: -0.02em to -0.04em for headlines).",
  "NO icon-stuffed bento boxes where every tile has an unrelated icon without information hierarchy.",
  "NO headline biscuit/pill badges with pulsing dots placed redundantly right above headers.",
  "NO CSS gradient text fills across random headline keywords.",
  "NO repetitive decorative grid line backgrounds or particle mesh overlays.",
  "NO over-nested cards (maximum 2 nesting levels).",
  "NO unstyled form controls or unanchored floating buttons.",
]);

export const QUALITY_DESIGN_STANDARDS = Object.freeze([
  "WCAG 2.2 AA Contrast: Ensure at least 4.5:1 contrast for normal body text and 3:1 for large display text.",
  "Optical Typography: Use high-quality Google Fonts with refined line-height (1.4-1.6 for body, 1.1-1.2 for headlines).",
  "Micro-Interactions: Every button, link, and interactive card MUST have explicit :hover, :active, and :focus-visible states.",
  "Layered Visual Depth: Strict z-index stacking hierarchy (Background z:0 -> Content z:10 -> Header/Nav z:20-30 -> Modals/Overlays z:50+).",
  "Fluid Responsive Layouts: Mobile-first flex/grid architectures adapting smoothly between 320px and 1440px+ viewports.",
]);

export function detectDesignArchetype(prompt = "", requestedStyle = null) {
  if (requestedStyle && DESIGN_ARCHETYPES[requestedStyle]) {
    return DESIGN_ARCHETYPES[requestedStyle];
  }

  const text = String(prompt || "").toLowerCase();

  for (const [key, archetype] of Object.entries(DESIGN_ARCHETYPES)) {
    if (text.includes(key) || text.includes(archetype.name.toLowerCase())) {
      return archetype;
    }
  }

  let bestArchetype = DESIGN_ARCHETYPES["linear-dark"];
  let maxScore = 0;

  for (const archetype of Object.values(DESIGN_ARCHETYPES)) {
    let score = 0;
    for (const keyword of archetype.keywords) {
      if (new RegExp(`\\b${keyword}\\b`, "i").test(text)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestArchetype = archetype;
    }
  }

  return bestArchetype;
}

export function generateTokensCss(archetype) {
  if (!archetype || !archetype.tokens) return "";
  const lines = Object.entries(archetype.tokens).map(
    ([k, v]) => `  ${k}: ${v};`,
  );
  return `:root {\n${lines.join("\n")}\n}`;
}

export function buildDesignSystemPrompt(userPrompt = "", options = {}) {
  const archetype = detectDesignArchetype(userPrompt, options.style);
  const tokensCss = generateTokensCss(archetype);

  let prompt = `## Active Design System: ${archetype.name}\n`;
  prompt += `**Description**: ${archetype.description}\n\n`;
  prompt += `### Typography\n`;
  prompt += `- Font Import: \`${archetype.googleFontsImport}\`\n`;
  prompt += `- Display Font: \`${archetype.fontFamilies.display}\`\n`;
  prompt += `- Body Font: \`${archetype.fontFamilies.body}\`\n`;
  prompt += `- Monospace Font: \`${archetype.fontFamilies.mono}\`\n\n`;

  prompt += `### Design Tokens (Embed inside \`<style>\` :root block):\n`;
  prompt += `\`\`\`css\n${tokensCss}\n\`\`\`\n\n`;

  prompt += `### Signature Micro-Interactions:\n`;
  for (const interaction of archetype.signatureInteractions || []) {
    prompt += `- ${interaction}\n`;
  }
  prompt += "\n";

  prompt += "### Anti-Slop & Quality Design Guidelines\n";
  for (const trope of FORBIDDEN_DESIGN_TROPES) {
    prompt += `- ${trope}\n`;
  }
  for (const standard of QUALITY_DESIGN_STANDARDS) {
    prompt += `- ${standard}\n`;
  }
  return prompt;
}
