/**
 * CoreZ Context Engine
 *
 * Gathers relevant project context for the current task.
 * Does NOT send the entire repository — only what is relevant.
 */

import { createContextSummary } from './schemas.js';

/**
 * @typedef {Object} ProjectSource
 * @property {string}  packageJson     — path to package.json content if available
 * @property {string}  hasReact       — whether React is detected
 * @property {string[]} frameworkList — detected frameworks
 * @property {string}  styling        — detected styling system
 * @property {string[]} deps          — key dependencies
 * @property {string[]} devDeps       — key dev dependencies
 */

export class ContextEngine {
  constructor(options = {}) {
    this.fileReader = options.fileReader || defaultFileReader;
    this.projectRoot = options.projectRoot || '.';
    this.cache = new Map();
  }

  async gather(prompt, intent) {
    const summary = createContextSummary();

    try {
      const pkg = await this.readJSON('package.json');
      if (pkg) {
        summary.projectType = detectProjectType(pkg);
        summary.dependencies = extractKeyDeps(pkg);
        summary.framework = detectFramework(pkg);
        summary.styling = detectStyling(pkg);
        summary.instructions = [];
      }
    } catch {
      // graceful degradation
    }

    try {
      const instructions = await this.readInstructions();
      if (instructions.length > 0) {
        summary.instructions = instructions;
      }
    } catch {
      // graceful degradation
    }

    // If an intent needs specific file discovery, try that
    if (intent && intent.type) {
      try {
        summary.relevantFiles = await this.findRelevantFiles(prompt, intent);
      } catch {
        summary.relevantFiles = [];
      }

      try {
        summary.existingFeatures = detectExistingFeatures(prompt, intent);
      } catch {
        summary.existingFeatures = [];
      }
    }

    return summary;
  }

  async readJSON(filename) {
    const cacheKey = `file:${filename}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const content = await this.fileReader.read(filename);
      if (!content) return null;
      const parsed = JSON.parse(content);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async readInstructions() {
    const cacheKey = 'instructions';
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const instructions = [];
    const files = ['AGENTS.md', 'COREZ.md', 'README.md', '.corez/config.json'];
    for (const file of files) {
      try {
        const content = await this.fileReader.read(file);
        if (content && content.length > 0) {
          instructions.push({ file, preview: content.slice(0, 400) });
        }
      } catch {
        // skip
      }
    }
    this.cache.set(cacheKey, instructions);
    return instructions;
  }

  async findRelevantFiles(prompt, intent) {
    const lower = prompt.toLowerCase();
    const files = [];
    const config = await this.readJSON('package.json');

    // Detect common file patterns to look for
    const dirs = config && config.workspaces ? [...(Array.isArray(config.workspaces) ? config.workspaces : []), 'src'] : ['src'];

    if (intent.type === 'feature_implementation' || intent.type === 'simple_edit' || intent.type === 'bug_fix') {
      if (/\b(component|react|jsx|tsx|button|modal|form|input)\b/i.test(lower)) {
        files.push('src/components/');
      }
      if (/\b(api|route|endpoint|fetch|request|service)\b/i.test(lower)) {
        files.push('src/services/');
      }
      if (/\b(style|css|tailwind|theme|design)\b/i.test(lower)) {
        files.push('src/index.css');
      }
    }

    return files;
  }
}

// ---------------------------------------------------------------------------
// Static detection helpers (work without file I/O)
// ---------------------------------------------------------------------------

function detectProjectType(pkg) {
  if (!pkg) return 'node';
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.react || deps['@vitejs/plugin-react']) return 'react-vite';
  if (deps.next) return 'nextjs';
  if (deps.vue) return 'vue';
  if (deps.svelte) return 'svelte';
  if (deps.express) return 'express';
  if (deps.fastify) return 'fastify';
  return 'node';
}

function detectFramework(pkg) {
  if (!pkg) return null;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.react || deps['@vitejs/plugin-react']) return 'React';
  if (deps.next) return 'Next.js';
  if (deps.vue) return 'Vue';
  if (deps.svelte) return 'Svelte';
  if (deps.angular || deps['@angular/core']) return 'Angular';
  return null;
}

function detectStyling(pkg) {
  if (!pkg) return null;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.tailwindcss) return 'Tailwind CSS';
  if (deps['styled-components']) return 'Styled Components';
  if (deps['@emotion/react']) return 'Emotion';
  if (deps.sass || deps['node-sass']) return 'Sass';
  if (deps['@mui/material'] || deps['@chakra-ui/react']) return 'Component Library';
  return 'CSS';
}

function extractKeyDeps(pkg) {
  if (!pkg) return [];
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const keys = Object.keys(deps);
  return keys.slice(0, 20);
}

function detectExistingFeatures(prompt, intent) {
  const features = [];
  const lower = prompt.toLowerCase();

  if (intent.type === 'feature_implementation' || intent.type === 'bug_fix') {
    if (/\b(auth|login|logout|session|supabase|firebase|jwt|oauth)\b/i.test(lower)) {
      features.push('authentication system exists');
    }
  }

  return features;
}

// ---------------------------------------------------------------------------
// Default file reader (browser-compatible)
// ---------------------------------------------------------------------------

const defaultFileReader = {
  async read(filename) {
    // In browser context, try fetching from root
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`/${filename}`);
        if (res.ok) return await res.text();
      } catch {
        // ignore
      }
    }
    return null;
  },
};
