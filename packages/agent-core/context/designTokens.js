export const AWWWARDS_DESIGN_SYSTEM = Object.freeze({
  aesthetic: 'Awwwards Site of the Day / Luxury Dark Mode & Glassmorphism',
  typography: {
    fontFamilies: {
      display: '"Outfit", "Syne", "Plus Jakarta Sans", sans-serif',
      body: '"Inter", "Space Grotesk", system-ui, -apple-system, sans-serif',
      mono: '"Fira Code", "JetBrains Mono", monospace'
    },
    googleFontsImport: '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap");'
  },
  colorPalette: {
    background: '#090A0F',
    surface: 'rgba(18, 20, 29, 0.75)',
    surfaceBorder: 'rgba(255, 255, 255, 0.08)',
    accentPrimary: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
    accentNeon: '#00F2FE',
    accentGlow: 'rgba(99, 102, 241, 0.35)',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B'
  },
  effects: {
    glassmorphism: 'background: rgba(18, 20, 29, 0.65); backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.1);',
    glowBorder: 'box-shadow: 0 0 25px rgba(99, 102, 241, 0.25), inset 0 0 15px rgba(168, 85, 247, 0.15);',
    smoothTransitions: 'transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);'
  },
  guidelines: [
    'Always use curated, harmonious dark/light color palettes (never plain red/blue/green defaults).',
    'Incorporate Google Fonts (Outfit, Syne, Inter, Space Grotesk) for display headings and body copy.',
    'Apply subtle micro-interactions, hover card lifts (transform: translateY(-6px)), and glowing borders.',
    'Use glassmorphism (backdrop-filter blur) for navigation bars, floating cards, and modal dialogs.',
    'Ensure dynamic responsive layouts, mobile-first flex/grid architectures, and accessibility contrast standards.'
  ]
});

export function buildAwwwardsDesignPrompt() {
  let prompt = `\n--- Awwwards Visual Design Principles ---\n`;
  prompt += `Style Target: ${AWWWARDS_DESIGN_SYSTEM.aesthetic}\n`;
  prompt += `Typography: Google Fonts (${AWWWARDS_DESIGN_SYSTEM.typography.fontFamilies.display})\n`;
  prompt += `Color System: Background ${AWWWARDS_DESIGN_SYSTEM.colorPalette.background}, Accents: ${AWWWARDS_DESIGN_SYSTEM.colorPalette.accentPrimary}\n`;
  prompt += `Glassmorphism: ${AWWWARDS_DESIGN_SYSTEM.effects.glassmorphism}\n`;
  prompt += `Design Rules:\n`;
  AWWWARDS_DESIGN_SYSTEM.guidelines.forEach(g => {
    prompt += `  - ${g}\n`;
  });
  return prompt;
}
