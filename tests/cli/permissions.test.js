import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalController,
  PermissionManager
} from '../../packages/agent-core/index.js';

describe('CoreZ permissions', () => {
  it('returns ask without treating it as allowed', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({ category: 'shell', operation: 'npm test' }))
      .toMatchObject({ action: 'ask', allowed: false });
  });

  it('auto-approves contained ordinary operations only', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({
      category: 'shell',
      operation: 'npm test',
      autoApprove: true,
      contained: true
    }).action).toBe('allow');
    expect(manager.resolve({
      category: 'shell',
      operation: 'git reset --hard',
      autoApprove: true,
      contained: true
    }).action).toBe('blocked');
  });

  it.each(['rm -rf /', 'rm -fr /', 'rm -rf ~', 'rm -rf *'])('blocks destructive removal: %s', operation => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({ category: 'shell', operation, autoApprove: true, contained: true }))
      .toMatchObject({ action: 'blocked', allowed: false });
  });

  it('never auto-approves a secret or credential file', () => {
    const manager = new PermissionManager({ read: 'ask' });
    expect(manager.resolve({
      category: 'read',
      operation: '.env',
      autoApprove: true,
      contained: true
    })).toMatchObject({ action: 'blocked', allowed: false });
    expect(manager.resolve({
      category: 'read',
      operation: 'config/credentials.json',
      autoApprove: true,
      contained: true
    })).toMatchObject({ action: 'blocked', allowed: false });
  });

  it('caches allow-for-session by normalized scope', async () => {
    const prompt = vi.fn(async () => 'session');
    const controller = new ApprovalController({ prompt });
    const request = { tool: 'run_command', category: 'shell', operation: 'npm test', scope: 'shell:npm test' };
    expect(await controller.authorize(request)).toMatchObject({ allowed: true, persistence: 'session' });
    expect(await controller.authorize(request)).toMatchObject({ allowed: true, persistence: 'session' });
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
