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

export const AWWWARDS_CATEGORIES = Object.freeze({
  'e-commerce': {
    url: 'https://www.awwwards.com/websites/e-commerce/',
    name: 'E-Commerce & Product Showcase',
    keywords: ['product', 'shop', 'store', 'buy', 'cart', 'checkout', 'e-commerce', 'ecommerce', 'sell', 'merch'],
    designPattern: 'Hero 3D/glassmorphic product showcase, interactive product grid, sticky floating cart drawer, interactive variant selector, and high-impact typography.'
  },
  'portfolio': {
    url: 'https://www.awwwards.com/websites/portfolio/',
    name: 'Portfolio & Personal Showcase',
    keywords: ['portfolio', 'personal', 'resume', 'cv', 'bio', 'developer', 'designer', 'work'],
    designPattern: 'Interactive project grid, full-screen display hero text (Syne/Outfit), smooth cursor reveal animations, interactive skill badges, and contact modal.'
  },
  'agency': {
    url: 'https://www.awwwards.com/websites/agency/',
    name: 'Agency & Studio Landing',
    keywords: ['agency', 'studio', 'company', 'consulting', 'services', 'firm', 'agency-landing'],
    designPattern: 'Bold marquee banner, interactive case studies grid, client testimonial carousel, pricing/services calculator, and sleek dark mode glassmorphism.'
  },
  'gaming': {
    url: 'https://www.awwwards.com/websites/gaming/',
    name: 'Gaming & Interactive Arcade',
    keywords: ['game', 'gaming', 'arcade', 'play', 'player', 'esports', 'quest', 'rpg', 'boss'],
    designPattern: 'Neon glow accents (#00F2FE, #A855F7), particle canvas backgrounds, dynamic leaderboard widget, sound toggle UI, character card hover flips.'
  },
  'saas': {
    url: 'https://www.awwwards.com/websites/tech/',
    name: 'SaaS Platform & Tech Dashboard',
    keywords: ['saas', 'dashboard', 'analytics', 'app', 'tool', 'software', 'platform', 'metrics', 'data'],
    designPattern: 'Glassmorphism metrics cards, interactive charting widgets, live status pills, pricing tier toggle, and sleek dark mode command bar.'
  },
  'editorial': {
    url: 'https://www.awwwards.com/websites/editorial/',
    name: 'Editorial & Magazine',
    keywords: ['blog', 'news', 'magazine', 'editorial', 'article', 'publication', 'content'],
    designPattern: 'Masonry article grid, marquee ticker, reader view toggle, category filter tags, and high-contrast typography.'
  }
});

export function detectAwwwardsCategory(userPrompt = '') {
  const lower = userPrompt.toLowerCase();
  for (const [key, category] of Object.entries(AWWWARDS_CATEGORIES)) {
    if (category.keywords.some(kw => lower.includes(kw))) {
      return { categoryKey: key, ...category };
    }
  }
  return null;
}

export function buildAwwwardsDesignPrompt(userPrompt = '') {
  const matchedCategory = detectAwwwardsCategory(userPrompt);

  let prompt = `\n--- Awwwards Visual Design Principles ---\n`;
  prompt += `Style Target: ${AWWWARDS_DESIGN_SYSTEM.aesthetic}\n`;
  if (matchedCategory) {
    prompt += `Detected Category: ${matchedCategory.name} (${matchedCategory.url})\n`;
    prompt += `Category Design Pattern: ${matchedCategory.designPattern}\n`;
  }
  prompt += `Typography: Google Fonts (${AWWWARDS_DESIGN_SYSTEM.typography.fontFamilies.display})\n`;
  prompt += `Color System: Background ${AWWWARDS_DESIGN_SYSTEM.colorPalette.background}, Accents: ${AWWWARDS_DESIGN_SYSTEM.colorPalette.accentPrimary}\n`;
  prompt += `Glassmorphism: ${AWWWARDS_DESIGN_SYSTEM.effects.glassmorphism}\n`;
  prompt += `Design Rules:\n`;
  AWWWARDS_DESIGN_SYSTEM.guidelines.forEach(g => {
    prompt += `  - ${g}\n`;
  });
  return prompt;
}

