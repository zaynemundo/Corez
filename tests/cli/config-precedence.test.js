import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCorezConfig } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('CoreZ configuration precedence', () => {
  it('resolves CLI over env over project over user over defaults', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-config-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.corez'));
    fs.writeFileSync(path.join(root, '.corez/config.json'), JSON.stringify({ model: 'project-model' }));
    const userPath = path.join(root, 'user.json');
    fs.writeFileSync(userPath, JSON.stringify({ model: 'user-model', permissions: { shell: true } }));

    const config = loadCorezConfig(root, {
      userConfigPath: userPath,
      env: { COREZ_MODEL: 'env-model' },
      cli: { model: 'cli-model' }
    });

    expect(config.model).toBe('cli-model');
    expect(config.permissions.shell).toBe('allow');
    expect(Object.isFrozen(config)).toBe(true);
  });
});
