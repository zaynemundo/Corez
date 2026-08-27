// ProfileRegistry: DSH profile/bundle composition on top of HarnessContext
//
// A running harness is a plugin tree composed from ordered layers:
//  dsh-base (model adapters, tools, persistence, sandbox, approval) -
//  dsh-web-app / dsh-headless + user cordis.patch.yml.
// We model the same layering in a much smaller scope for agy:
//
//  Profiles are named compositions stored in ~/.corez/profiles/<name>.json
//  Bundles are distribution rows {id, plugin, config, enabled}.
//  A patch targets a row by id and replaces its config or inserts new rows.
//
// For CoreZ we keep it file-less but structurally equivalent: profile
// definitions live in `packages/agent-core/harness/profiles/` and user
// overrides live in `.corez/cordis.patch.yml`-ish json.
//
// Usage:
//  const reg = new ProfileRegistry({ context, baseBundles })
//  await reg.compose('web')
//  reg.dumpConfig() -> rows that booted
//  reg.applyPatch({ id, config })

import fs from 'node:fs';
import path from 'node:path';

const BUILTIN_PROFILES = {
  web: {
    name: 'web',
    bundles: ['base', 'web-app'],
    description: 'Browser + harness + web capability (search/fetch)'
  },
  headless: {
    name: 'headless',
    bundles: ['base', 'headless'],
    description: 'One-shot runner with no server (for agy --print)'
  },
  // agy delegate extends headless with plan/accept-edits modes
  agy: {
    name: 'agy',
    bundles: ['base', 'headless', 'agy'],
    description: 'AGY delegate: headless + agy mode switch (plan|accept-edits)'
  }
};

const BUILTIN_BUNDLES = {
  base: [
    { id: 'llm', plugin: '@corez/dsh-llm', config: { provider: 'opencode-go' } },
    { id: 'tools', plugin: '@corez/dsh-tools', config: { mode: 'native' } },
    { id: 'session', plugin: '@corez/dsh-session', config: { version: 0 } },
    { id: 'tools-guard', plugin: '@corez/dsh-guard', config: { repeatThreshold: 3 } },
    { id: 'fs', plugin: '@corez/dsh-fs', config: { policy: 'workspace' } },
    { id: 'shell', plugin: '@corez/dsh-shell', config: { allow: true } },
    { id: 'todo', plugin: '@corez/dsh-tool-todo', config: { allowParallelInProgress: true } },
    { id: 'skill', plugin: '@corez/dsh-skill', config: {} }
  ],
  'web-app': [
    { id: 'web', plugin: '@corez/dsh-web', config: { searchProvider: 'openrouter' } },
    { id: 'ui', plugin: '@corez/dsh-ui', config: {} }
  ],
  headless: [
    { id: 'headless-runner', plugin: '@corez/dsh-headless', config: {} }
  ],
  agy: [
    { id: 'agy-mode', plugin: '@corez/dsh-agy', config: { modes: ['plan', 'accept-edits'] } }
  ]
};

export class ProfileRegistry {
  constructor({ context, cwd = process.cwd() } = {}) {
    this.context = context;
    this.cwd = cwd;
    this.activeProfile = null;
    this.rows = [];
    this._patches = [];
  }

  listProfiles() {
    return Object.values(BUILTIN_PROFILES);
  }

  getProfile(name) {
    return BUILTIN_PROFILES[name] || null;
  }

  listBundles() {
    return Object.keys(BUILTIN_BUNDLES);
  }

  compose(profileName = 'web', { patches = [], dumpOnly = false } = {}) {
    const profile = this.getProfile(profileName);
    if (!profile) throw new Error(`Unknown profile "${profileName}". Available: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
    this.activeProfile = profile;
    this.rows = [];
    for (const b of profile.bundles) {
      const bundle = BUILTIN_BUNDLES[b];
      if (!bundle) continue;
      for (const row of bundle) this.rows.push({ ...row, bundle: b });
    }
    // apply patches in order: profile patch, home patch, --patch overlay
    for (const p of [...this._patches, ...patches]) this._applyOne(p);
    // load user patch file if present
    const patchFile = path.join(this.cwd, '.corez', 'cordis.patch.json');
    if (fs.existsSync(patchFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
        if (Array.isArray(parsed)) for (const p of parsed) this._applyOne(p);
        else if (parsed && parsed.rows) for (const p of parsed.rows) this._applyOne(p);
      } catch {}
    }
    if (dumpOnly) return this.rows.slice();
    return this.rows.slice();
  }

  _applyOne(patch) {
    if (!patch || !patch.id) return;
    const idx = this.rows.findIndex((r) => r.id === patch.id);
    if (patch.op === 'remove') {
      if (idx !== -1) this.rows.splice(idx, 1);
      return;
    }
    if (idx !== -1) {
      // replace whole config (DSH patch semantics)
      this.rows[idx] = { ...this.rows[idx], config: patch.config !== undefined ? patch.config : this.rows[idx].config };
    } else {
      // insert new row
      this.rows.push({ id: patch.id, plugin: patch.plugin || patch.id, config: patch.config || {}, bundle: patch.bundle || 'patch' });
    }
  }

  applyPatch(patch) {
    this._patches.push(patch);
    this._applyOne(patch);
    return this.rows.slice();
  }

  dumpConfig() {
    return {
      profile: this.activeProfile?.name || null,
      rows: this.rows.slice(),
      version: 1
    };
  }
}
