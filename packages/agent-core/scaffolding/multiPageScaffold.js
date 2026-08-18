/**
 * Multi-Page Site Scaffolding & Generation Engine
 * Generates cohesive, multi-page web applications conforming to Design Archetypes
 * and the CoreZ multi-page preview/publish protocol.
 */

import { detectDesignArchetype, generateTokensCss } from '../designSystems/index.js';

export const STANDARD_SUBPAGE_PRESETS = Object.freeze([
  { name: 'about.html', title: 'About Us', description: 'Company mission, story, leadership, and values' },
  { name: 'features.html', title: 'Features & Capabilities', description: 'Product features, architecture, and breakdown' },
  { name: 'pricing.html', title: 'Pricing & Plans', description: 'Tiered subscription pricing plans and FAQ' },
  { name: 'contact.html', title: 'Contact Us', description: 'Direct contact form, location, and communication channels' },
  { name: 'docs.html', title: 'Documentation', description: 'API documentation, quickstart, and guides' }
]);

/**
 * Normalizes a page filename to valid safe .html format.
 */
export function normalizePageName(name) {
  if (!name || typeof name !== 'string') return 'page.html';
  let cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
  if (!cleaned.endsWith('.html')) {
    cleaned += '.html';
  }
  return cleaned;
}

/**
 * Generates navigation HTML for a page within a multi-page site.
 */
export function generatePageNavbar({ siteTitle = 'CoreZ App', activePage = 'index.html', pages = [] }) {
  const navLinks = pages.map((page) => {
    const pageName = typeof page === 'string' ? page : page.name;
    const pageTitle = typeof page === 'object' && page.title
      ? page.title
      : pageName.replace('.html', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const isActive = pageName === activePage;
    return `        <a href="${pageName}" class="nav-link${isActive ? ' active' : ''}"${isActive ? ' aria-current="page"' : ''}>${pageTitle}</a>`;
  }).join('\n');

  return `  <header class="site-header">
    <div class="nav-container">
      <a href="index.html" class="brand-logo">${siteTitle}</a>
      <nav class="site-nav" aria-label="Main Navigation">
${navLinks}
      </nav>
    </div>
  </header>`;
}

/**
 * Generates a standard cohesive footer.
 */
export function generatePageFooter({ siteTitle = 'CoreZ App', pages = [] }) {
  const footerLinks = pages.map((page) => {
    const pageName = typeof page === 'string' ? page : page.name;
    const pageTitle = typeof page === 'object' && page.title
      ? page.title
      : pageName.replace('.html', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `<a href="${pageName}">${pageTitle}</a>`;
  }).join(' • ');

  return `  <footer class="site-footer">
    <div class="footer-container">
      <p class="footer-links">${footerLinks}</p>
      <p class="footer-copy">&copy; ${new Date().getFullYear()} ${siteTitle}. Built with CoreZ AI.</p>
    </div>
  </footer>`;
}

/**
 * Scaffolds a single cohesive HTML sub-page adhering to the given design archetype.
 */
export function generateSubPageTemplate({
  name = 'about.html',
  title = 'About',
  siteTitle = 'CoreZ App',
  archetypeId = 'linear-dark',
  navigationPages = ['index.html', 'about.html', 'pricing.html', 'contact.html'],
  contentHtml = '',
  metaDescription = ''
}) {
  const safeName = normalizePageName(name);
  const archetype = detectDesignArchetype(archetypeId, archetypeId);
  const tokensCss = generateTokensCss(archetype);
  const navbarHtml = generatePageNavbar({ siteTitle, activePage: safeName, pages: navigationPages });
  const footerHtml = generatePageFooter({ siteTitle, pages: navigationPages });

  const defaultContent = contentHtml.trim() || `
      <section class="hero-section">
        <h1 class="page-title">${title}</h1>
        <p class="page-lead">${metaDescription || `Explore ${title.toLowerCase()} for ${siteTitle}. Designed with precision and clarity.`}</p>
      </section>
      <section class="content-card-grid">
        <div class="feature-card">
          <h3>Overview</h3>
          <p>This page is part of the multi-page ${siteTitle} experience, rendered with the ${archetype.name} design system.</p>
        </div>
        <div class="feature-card">
          <h3>Interactive Details</h3>
          <p>Seamless client routing enables lightning fast navigation between pages without full page reloads.</p>
        </div>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | ${siteTitle}</title>
  ${metaDescription ? `<meta name="description" content="${metaDescription}">` : ''}
  <style>
    ${archetype.googleFontsImport}

    ${tokensCss}

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-body, ${archetype.fontFamilies.body});
      background-color: var(--bg-primary, #090a0f);
      color: var(--text-primary, #f3f4f6);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-display, ${archetype.fontFamilies.display});
      letter-spacing: -0.025em;
      font-weight: 700;
      line-height: 1.2;
    }

    a {
      color: var(--accent, #3b82f6);
      text-decoration: none;
      transition: var(--transition-smooth, all 0.2s ease);
    }

    a:hover {
      color: var(--accent-hover, #60a5fa);
    }

    .site-header {
      position: sticky;
      top: 0;
      z-index: 30;
      background: var(--bg-primary, #090a0f);
      border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
      backdrop-filter: blur(12px);
    }

    .nav-container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-logo {
      font-family: var(--font-display, ${archetype.fontFamilies.display});
      font-weight: 800;
      font-size: 1.25rem;
      color: var(--text-primary, #ffffff);
    }

    .site-nav {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }

    .nav-link {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-secondary, #9ca3af);
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm, 6px);
    }

    .nav-link:hover, .nav-link.active {
      color: var(--text-primary, #ffffff);
      background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
    }

    .main-container {
      flex: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 3rem 1.5rem;
      width: 100%;
    }

    .hero-section {
      text-align: center;
      margin-bottom: 3.5rem;
    }

    .page-title {
      font-size: 2.75rem;
      margin-bottom: 1rem;
      color: var(--text-primary, #ffffff);
    }

    .page-lead {
      font-size: 1.15rem;
      color: var(--text-secondary, #9ca3af);
      max-width: 650px;
      margin: 0 auto;
    }

    .content-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-top: 2rem;
    }

    .feature-card {
      background: var(--bg-secondary, #111218);
      border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-md, 10px);
      padding: 1.75rem;
      transition: var(--transition-smooth, all 0.2s ease);
    }

    .feature-card:hover {
      border-color: var(--border-highlight, rgba(255, 255, 255, 0.16));
      transform: translateY(-2px);
    }

    .feature-card h3 {
      font-size: 1.25rem;
      margin-bottom: 0.75rem;
    }

    .feature-card p {
      color: var(--text-secondary, #9ca3af);
      font-size: 0.95rem;
    }

    .site-footer {
      border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
      padding: 2.5rem 1.5rem;
      background: var(--bg-secondary, #111218);
      margin-top: auto;
    }

    .footer-container {
      max-width: 1100px;
      margin: 0 auto;
      text-align: center;
    }

    .footer-links {
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
      color: var(--text-secondary, #9ca3af);
    }

    .footer-links a {
      margin: 0 0.25rem;
    }

    .footer-copy {
      font-size: 0.8rem;
      color: var(--text-muted, #6b7280);
    }

    @media (max-width: 640px) {
      .nav-container {
        flex-direction: column;
        gap: 1rem;
      }
      .site-nav {
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
      }
      .page-title {
        font-size: 2rem;
      }
    }
  </style>
</head>
<body>
${navbarHtml}
  <main class="main-container">
${defaultContent}
  </main>
${footerHtml}
</body>
</html>`;
}

/**
 * Scaffolds an entire multi-page site bundle formatted with CoreZ page markers.
 */
export function scaffoldMultiPageSite({
  siteTitle = 'Modern Web App',
  archetypeId = 'linear-dark',
  pages = STANDARD_SUBPAGE_PRESETS
}) {
  const pageList = pages.map((p) => normalizePageName(p.name));
  if (!pageList.includes('index.html')) {
    pageList.unshift('index.html');
  }

  const headerMarker = `<!-- CORESITE-PAGES: ${pageList.join(', ')} -->\n`;
  const pageBlocks = [];

  // Home page
  const homeTemplate = generateSubPageTemplate({
    name: 'index.html',
    title: 'Welcome',
    siteTitle,
    archetypeId,
    navigationPages: pageList,
    metaDescription: `Welcome to ${siteTitle}. Experience next-generation digital craftsmanship.`
  });
  pageBlocks.push(`<!-- PAGE: index.html -->\n${homeTemplate}`);

  // Sub pages
  for (const page of pages) {
    const pageName = normalizePageName(page.name);
    if (pageName === 'index.html') continue;

    const pageContent = generateSubPageTemplate({
      name: pageName,
      title: page.title || pageName.replace('.html', '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      siteTitle,
      archetypeId,
      navigationPages: pageList,
      metaDescription: page.description || ''
    });
    pageBlocks.push(`<!-- PAGE: ${pageName} -->\n${pageContent}`);
  }

  return `${headerMarker}\n${pageBlocks.join('\n\n')}`;
}

/**
 * Analyzes the links and connectivity graph of a multi-page site.
 */
export function analyzeSiteGraph(pages = []) {
  const pageMap = new Map();
  const internalLinkPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
  const pageNamePattern = /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i;

  for (const page of pages) {
    const name = page.name;
    const html = page.html || '';
    const outgoing = new Set();

    for (const match of html.matchAll(internalLinkPattern)) {
      const rawHref = match[1].trim();
      const target = rawHref.split(/[#?]/)[0].split('/').pop();
      if (pageNamePattern.test(target)) {
        outgoing.add(target);
      }
    }
    pageMap.set(name, Array.from(outgoing));
  }

  const allPageNames = new Set(pages.map((p) => p.name));
  const incomingCounts = {};
  for (const name of allPageNames) {
    incomingCounts[name] = 0;
  }

  for (const [source, targets] of pageMap.entries()) {
    for (const target of targets) {
      if (allPageNames.has(target) && target !== source) {
        incomingCounts[target] = (incomingCounts[target] || 0) + 1;
      }
    }
  }

  const orphans = Object.entries(incomingCounts)
    .filter(([name, count]) => name !== 'index.html' && count === 0)
    .map(([name]) => name);

  return {
    pageCount: pages.length,
    graph: Object.fromEntries(pageMap.entries()),
    incomingCounts,
    orphans,
    isFullyConnected: orphans.length === 0
  };
}
