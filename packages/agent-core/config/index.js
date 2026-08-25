import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = Object.freeze({
  model: 'mimo-v2.5',
  reasoning: 'high',
  mode: 'agent',
  permissions: {
    read: true,
    workspaceWrite: true,
    shell: 'ask',
    network: 'ask',
    dangerous: false
  },
  swarm: {
    // 0 = adaptive: concurrency is derived from the number of independent
    // pending workstreams with backpressure, never capped by CoreZ. An
    // operator may still set an explicit ceiling for infrastructure reasons.
    maxConcurrency: 0,
    strategy: 'dag'
  }
});

export function loadCorezConfig(cwd = process.cwd()) {
  const possiblePaths = [
    path.join(cwd, '.corez', 'config.json'),
    path.join(cwd, 'corez.config.json'),
    path.join(cwd, '.corez.json')
  ];

  let loaded = {};
  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        loaded = JSON.parse(raw);
        break;
      } catch (err) {
        console.warn(`[CoreZ Config] Failed to parse ${configPath}:`, err.message);
      }
    }
  }

  const model = process.env.COREZ_MODEL || loaded.model || DEFAULT_CONFIG.model;
  const mode = process.env.COREZ_MODE || loaded.mode || DEFAULT_CONFIG.mode;
  const reasoning = process.env.COREZ_REASONING || loaded.reasoning || DEFAULT_CONFIG.reasoning;

  const permissions = {
    ...DEFAULT_CONFIG.permissions,
    ...(loaded.permissions || {})
  };

  if (process.env.COREZ_ALLOW_SHELL === 'true') {
    permissions.shell = true;
  } else if (process.env.COREZ_ALLOW_SHELL === 'false') {
    permissions.shell = false;
  }

  if (process.env.COREZ_AUTO_APPROVE === 'true' || process.env.YOLO === 'true') {
    permissions.workspaceWrite = true;
    permissions.shell = true;
    permissions.network = true;
  }

  return {
    ...DEFAULT_CONFIG,
    ...loaded,
    model,
    mode,
    reasoning,
    permissions
  };
}

export function saveCorezConfig(newConfig = {}, cwd = process.cwd()) {
  const dir = path.join(cwd, '.corez');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const configPath = path.join(dir, 'config.json');
  let existing = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_e) {
      existing = {};
    }
  }

  const merged = {
    ...existing,
    ...newConfig
  };

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

