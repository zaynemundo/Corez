import { describe, it, expect } from 'vitest';
import {
  normalizePageName,
  generatePageNavbar,
  generatePageFooter,
  generateSubPageTemplate,
  scaffoldMultiPageSite,
  analyzeSiteGraph
} from '../packages/agent-core/scaffolding/multiPageScaffold.js';
import { parseMultiPageSite, validateMultiPageSite } from '../src/utils/previewTransformer.js';

describe('Multi-Page Scaffolding Engine', () => {
  it('normalizes page names safely', () => {
    expect(normalizePageName('about')).toBe('about.html');
    expect(normalizePageName('About Us.HTML')).toBe('about-us.html');
    expect(normalizePageName('pricing.html')).toBe('pricing.html');
    expect(normalizePageName('')).toBe('page.html');
    expect(normalizePageName(null)).toBe('page.html');
  });

  it('generates consistent navbar HTML with active state', () => {
    const navbar = generatePageNavbar({
      siteTitle: 'Acme SaaS',
      activePage: 'pricing.html',
      pages: ['index.html', 'features.html', 'pricing.html', 'contact.html']
    });

    expect(navbar).toContain('class="brand-logo">Acme SaaS</a>');
    expect(navbar).toContain('href="pricing.html" class="nav-link active" aria-current="page">Pricing</a>');
    expect(navbar).toContain('href="features.html" class="nav-link">Features</a>');
    expect(navbar).toContain('href="index.html" class="nav-link">Index</a>');
  });

  it('generates coherent footer HTML', () => {
    const footer = generatePageFooter({
      siteTitle: 'Acme SaaS',
      pages: ['index.html', 'about.html', 'contact.html']
    });

    expect(footer).toContain('Acme SaaS');
    expect(footer).toContain('href="about.html">About</a>');
    expect(footer).toContain('href="contact.html">Contact</a>');
  });

  it('generates a full standalone sub-page conforming to design archetype tokens', () => {
    const pageHtml = generateSubPageTemplate({
      name: 'features.html',
      title: 'Platform Features',
      siteTitle: 'CoreZ Platform',
      archetypeId: 'linear-dark',
      navigationPages: ['index.html', 'features.html', 'pricing.html'],
      metaDescription: 'Discover advanced AI creation tools'
    });

    expect(pageHtml).toContain('<!DOCTYPE html>');
    expect(pageHtml).toContain('<title>Platform Features | CoreZ Platform</title>');
    expect(pageHtml).toContain('name="description" content="Discover advanced AI creation tools"');
    expect(pageHtml).toContain('--bg-primary: #090a0f;');
    expect(pageHtml).toContain('class="page-title">Platform Features</h1>');
    expect(pageHtml).toContain('href="features.html" class="nav-link active"');
    expect(pageHtml).toContain('</html>');
  });

  it('scaffolds a complete multi-page site bundle that passes multiPage validation', () => {
    const siteBundle = scaffoldMultiPageSite({
      siteTitle: 'Quantum Cloud',
      archetypeId: 'apple-glass',
      pages: [
        { name: 'features.html', title: 'Features', description: 'Real-time sync' },
        { name: 'pricing.html', title: 'Pricing', description: 'Plans and tiers' },
        { name: 'contact.html', title: 'Contact', description: 'Get in touch' }
      ]
    });

    expect(siteBundle).toContain('<!-- CORESITE-PAGES: index.html, features.html, pricing.html, contact.html -->');
    expect(siteBundle).toContain('<!-- PAGE: index.html -->');
    expect(siteBundle).toContain('<!-- PAGE: features.html -->');
    expect(siteBundle).toContain('<!-- PAGE: pricing.html -->');
    expect(siteBundle).toContain('<!-- PAGE: contact.html -->');

    const parsed = parseMultiPageSite(siteBundle);
    expect(parsed.isMultiPage).toBe(true);
    expect(parsed.pages).toHaveLength(4);
    expect(parsed.pages[0].name).toBe('index.html');

    const validation = validateMultiPageSite(parsed.pages);
    expect(validation.valid).toBe(true);
    expect(validation.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('analyzes site graph connectivity and identifies orphaned pages', () => {
    const fullyConnectedPages = [
      {
        name: 'index.html',
        html: '<!DOCTYPE html><html><body><a href="about.html">About</a><a href="pricing.html">Pricing</a></body></html>'
      },
      {
        name: 'about.html',
        html: '<!DOCTYPE html><html><body><a href="index.html">Home</a><a href="pricing.html">Pricing</a></body></html>'
      },
      {
        name: 'pricing.html',
        html: '<!DOCTYPE html><html><body><a href="index.html">Home</a><a href="about.html">About</a></body></html>'
      }
    ];

    const connectedAnalysis = analyzeSiteGraph(fullyConnectedPages);
    expect(connectedAnalysis.isFullyConnected).toBe(true);
    expect(connectedAnalysis.orphans).toHaveLength(0);
    expect(connectedAnalysis.incomingCounts['about.html']).toBe(2);
    expect(connectedAnalysis.incomingCounts['pricing.html']).toBe(2);

    const pagesWithOrphan = [
      {
        name: 'index.html',
        html: '<!DOCTYPE html><html><body><a href="about.html">About</a></body></html>'
      },
      {
        name: 'about.html',
        html: '<!DOCTYPE html><html><body><a href="index.html">Home</a></body></html>'
      },
      {
        name: 'hidden.html',
        html: '<!DOCTYPE html><html><body><a href="index.html">Home</a></body></html>'
      }
    ];

    const orphanAnalysis = analyzeSiteGraph(pagesWithOrphan);
    expect(orphanAnalysis.isFullyConnected).toBe(false);
    expect(orphanAnalysis.orphans).toEqual(['hidden.html']);
  });
});
