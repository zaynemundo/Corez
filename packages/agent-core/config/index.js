import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONFIG = Object.freeze({
  model: 'deepseek-v4-pro',
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
    maxConcurrency: 16,
    strategy: 'dag'
  }
});

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn(`[CoreZ Config] Failed to parse ${configPath}:`, err.message);
    return {};
  }
}

function loadProjectConfig(cwd) {
  const possiblePaths = [
    path.join(cwd, '.corez', 'config.json'),
    path.join(cwd, 'corez.config.json'),
    path.join(cwd, '.corez.json')
  ];

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      const loaded = readConfig(configPath);
      if (Object.keys(loaded).length > 0) return loaded;
    }
  }
  return {};
}

function normalizePermission(value, fallback) {
  if (value === true) return 'allow';
  if (value === false) return 'deny';
  if (['allow', 'ask', 'deny'].includes(value)) return value;
  return fallback;
}

function definedValues(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

function configFromEnv(env) {
  const envPermissions = {};
  if (env.COREZ_ALLOW_SHELL === 'true') envPermissions.shell = true;
  if (env.COREZ_ALLOW_SHELL === 'false') envPermissions.shell = false;

  if (env.COREZ_AUTO_APPROVE === 'true' || env.YOLO === 'true') {
    envPermissions.workspaceWrite = true;
    envPermissions.shell = true;
    envPermissions.network = true;
  }

  return {
    ...definedValues({
      model: env.COREZ_MODEL,
      mode: env.COREZ_MODE,
      reasoning: env.COREZ_REASONING
    }),
    ...(Object.keys(envPermissions).length > 0 ? { permissions: envPermissions } : {})
  };
}

export function loadCorezConfig(cwd = process.cwd(), { env = process.env, cli = {}, userConfigPath } = {}) {
  const userConfig = readConfig(userConfigPath || path.join(os.homedir(), '.corez', 'config.json'));
  const projectConfig = loadProjectConfig(cwd);
  const envConfig = configFromEnv(env);
  const cliConfig = definedValues(cli);

  const merged = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...projectConfig,
    ...envConfig,
    ...cliConfig
  };

  const mergedPermissions = {
    ...DEFAULT_CONFIG.permissions,
    ...(userConfig.permissions || {}),
    ...(projectConfig.permissions || {}),
    ...(envConfig.permissions || {}),
    ...(cliConfig.permissions || {})
  };

  const permissions = Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.permissions).map(([name, fallback]) => [
      name,
      normalizePermission(mergedPermissions[name], normalizePermission(fallback, 'ask'))
    ])
  ));

  return Object.freeze({ ...merged, permissions });
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
