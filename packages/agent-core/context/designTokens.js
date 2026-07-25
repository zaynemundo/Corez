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
    keywords: ['saas', 'dashboard', 'analytics', 'software', 'platform', 'metrics'],
    designPattern: 'Glassmorphism metrics cards, interactive charting widgets, live status pills, pricing tier toggle, and sleek dark mode command bar.'
  },
  'editorial': {
    url: 'https://www.awwwards.com/websites/editorial/',
    name: 'Editorial & Magazine',
    keywords: ['blog', 'news', 'magazine', 'editorial', 'article', 'publication', 'content'],
    designPattern: 'Masonry article grid, marquee ticker, reader view toggle, category filter tags, and high-contrast typography.'
  },
  'architecture': {
    url: 'https://www.awwwards.com/websites/architecture/',
    name: 'Architecture & Spatial Design',
    keywords: ['architecture', 'building', 'interior', 'construction', 'spatial', 'structure', 'house', 'home'],
    designPattern: 'Minimalist high-contrast grid, large structural imagery frames, monochrome dark aesthetic, floorplan viewer, and smooth parallax scrolling.'
  },
  'art-illustration': {
    url: 'https://www.awwwards.com/websites/art-illustration/',
    name: 'Art & Interactive Illustration',
    keywords: ['art', 'artist', 'illustration', 'draw', 'gallery', 'exhibition', 'canvas', 'creative'],
    designPattern: 'Interactive Canvas/SVG shaders, hand-drawn vector accents, dynamic theme palette switcher, and full-screen artwork modal.'
  },
  'fashion': {
    url: 'https://www.awwwards.com/websites/fashion/',
    name: 'Fashion & Apparel Lookbook',
    keywords: ['fashion', 'apparel', 'clothing', 'brand', 'lookbook', 'model', 'wear', 'style'],
    designPattern: 'Editorial lookbook layout, oversized serif display typography, hover-zoom product inspection, video background hero, and sticky shop bar.'
  },
  'food-drink': {
    url: 'https://www.awwwards.com/websites/food-drink/',
    name: 'Food & Culinary Experience',
    keywords: ['food', 'drink', 'restaurant', 'cafe', 'coffee', 'dining', 'recipe', 'bar', 'baking'],
    designPattern: 'Rich appetizing color tones, interactive menu card deck, online reservation modal, photo gallery grid, and chef showcase.'
  },
  'hotel-travel': {
    url: 'https://www.awwwards.com/websites/hotel-restaurant/',
    name: 'Hotel, Hospitality & Travel',
    keywords: ['hotel', 'resort', 'travel', 'vacation', 'hospitality', 'booking', 'destination', 'tour'],
    designPattern: 'Full-bleed imagery hero, interactive room booking bar, interactive map widget, amenity tab navigator, and guest reviews.'
  },
  'music': {
    url: 'https://www.awwwards.com/websites/music/',
    name: 'Music & Audio Visualizer',
    keywords: ['music', 'audio', 'song', 'album', 'band', 'artist', 'track', 'playlist', 'dj', 'concert'],
    designPattern: 'Interactive audio visualizer canvas, dark cyber neon theme (#FF007A, #00F2FE), tour dates ticker, embedded music player bar.'
  },
  'mobile-apps': {
    url: 'https://www.awwwards.com/websites/mobile-apps/',
    name: 'Mobile App Showcase',
    keywords: ['mobile', 'ios', 'android', 'phone-app', 'mobile-app', 'download', 'app-landing'],
    designPattern: 'Floating 3D phone mockup showcase, app store badge pills, feature swipe carousel, and QR code instant download modal.'
  },
  'web3-crypto': {
    url: 'https://www.awwwards.com/websites/web3/',
    name: 'Web3, Crypto & Fintech',
    keywords: ['web3', 'crypto', 'nft', 'blockchain', 'token', 'wallet', 'fintech', 'defi', 'solana', 'eth'],
    designPattern: 'Dark cybernetic glassmorphic aesthetic, wallet connect modal, live price ticker, transaction status card, and neon glowing borders.'
  },
  'education': {
    url: 'https://www.awwwards.com/websites/education/',
    name: 'Education & E-Learning',
    keywords: ['education', 'course', 'learn', 'academy', 'school', 'university', 'student', 'tutorial'],
    designPattern: 'Clean course card grid, interactive progress bars, instructor bio drawer, video lesson player, and certificate modal.'
  },
  'events': {
    url: 'https://www.awwwards.com/websites/events/',
    name: 'Events, Summit & Conference',
    keywords: ['event', 'conference', 'summit', 'meetup', 'festival', 'keynote', 'speaker', 'schedule'],
    designPattern: 'Live countdown timer, speaker card grid with hover bios, interactive schedule timeline tabs, and ticket purchasing drawer.'
  },
  'health-wellness': {
    url: 'https://www.awwwards.com/websites/health-wellness/',
    name: 'Health, Medical & Wellness',
    keywords: ['health', 'medical', 'wellness', 'clinic', 'fitness', 'yoga', 'care', 'doctor', 'therapy'],
    designPattern: 'Soft calming gradients, clean medical/wellness cards, appointment booking widget, and interactive health self-assessment quiz.'
  }
});

export function detectAwwwardsCategory(userPrompt = '') {
  const lower = userPrompt.toLowerCase();
  for (const [key, category] of Object.entries(AWWWARDS_CATEGORIES)) {
    if (category.keywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lower))) {
      return { categoryKey: key, ...category };
    }
  }
  return null;
}

export function buildAwwwardsDesignPrompt(userPrompt = '') {
  const matchedCategory = detectAwwwardsCategory(userPrompt);

  let prompt = `\n--- Awwwards Visual Design Principles & MiMo V2.5 Inspection ---\n`;
  prompt += `Style Target: ${AWWWARDS_DESIGN_SYSTEM.aesthetic}\n`;
  if (matchedCategory) {
    prompt += `Detected Category: ${matchedCategory.name}\n`;
    prompt += `Awwwards Reference Review Site: ${matchedCategory.url}\n`;
    prompt += `MiMo V2.5 Visual Inspection Mandate: MiMo V2.5 (opencode-go/mimo-v2.5) reviews the Awwwards reference target site (${matchedCategory.url}) for visual layout guidance, aesthetic benchmarking, and visual specification matching.\n`;
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

