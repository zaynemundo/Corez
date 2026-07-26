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

  it('does not auto-approve operations that are not explicitly auto-eligible', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({
      category: 'shell',
      operation: 'npm test',
      autoApprove: true,
      autoEligible: false,
      contained: true
    })).toMatchObject({ action: 'ask', allowed: false });
  });

  it('blocks uncontained operations before approval', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({
      category: 'shell',
      operation: 'node -e "require(\'/etc/passwd\')"',
      autoApprove: true,
      autoEligible: false,
      contained: false
    })).toMatchObject({ action: 'blocked', allowed: false });
  });

  it('blocks hard commands embedded in a wrapper operation', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({
      category: 'shell',
      operation: 'node -e "execSync(\'git reset --hard\')"',
      autoApprove: true,
      autoEligible: false,
      contained: true
    })).toMatchObject({ action: 'blocked', allowed: false });
  });

  it('keeps configured deny distinct from hard policy blocking', () => {
    expect(new PermissionManager({ shell: 'deny' }).resolve({
      category: 'shell',
      operation: 'npm test',
      contained: true
    })).toMatchObject({ action: 'deny', allowed: false, blocked: false });
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

  it('does not reuse a session approval across scopes', async () => {
    const prompt = vi.fn(async () => 'session');
    const controller = new ApprovalController({ prompt });
    await controller.authorize({ category: 'shell', operation: 'npm test', scope: 'shell:npm test' });
    await controller.authorize({ category: 'shell', operation: 'npm run build', scope: 'shell:npm run build' });
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('rejects an ask decision without an interactive prompt', async () => {
    await expect(new ApprovalController().authorize({
      category: 'shell',
      operation: 'npm test',
      decision: { action: 'ask', allowed: false }
    })).rejects.toMatchObject({ code: 'TOOL_APPROVAL_REQUIRED' });
  });

  it('rejects configured deny without prompting or caching it', async () => {
    const prompt = vi.fn(async () => 'session');
    const controller = new ApprovalController({ prompt });
    await expect(controller.authorize({
      category: 'shell',
      operation: 'npm test',
      decision: { action: 'deny', allowed: false }
    })).rejects.toMatchObject({ code: 'TOOL_DENIED' });
    expect(prompt).not.toHaveBeenCalled();
  });
});
