import { describe, it, expect } from 'vitest';
import { PermissionManager, PERMISSION_CATEGORIES } from '../../packages/agent-core/permissions/index.js';

describe('PermissionManager & Dangerous Command Protection', () => {
  it('auto-approves read operations', () => {
    const pm = new PermissionManager();
    const check = pm.checkPermission(PERMISSION_CATEGORIES.READ, 'read_file');
    expect(check.allowed).toBe(true);
  });

  it('blocks dangerous commands like rm -rf / or git reset --hard', () => {
    const pm = new PermissionManager();

    const danger1 = pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'rm -rf /');
    expect(danger1.allowed).toBe(false);
    expect(danger1.blocked).toBe(true);

    const danger2 = pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'git reset --hard');
    expect(danger2.allowed).toBe(false);
    expect(danger2.blocked).toBe(true);

    const danger3 = pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'sudo rm -rf /etc');
    expect(danger3.allowed).toBe(false);
    expect(danger3.blocked).toBe(true);
  });

  it('honors workspaceWrite configuration', () => {
    const pmAllowed = new PermissionManager({ workspaceWrite: true });
    expect(pmAllowed.checkPermission(PERMISSION_CATEGORIES.WORKSPACE_WRITE).allowed).toBe(true);

    const pmDenied = new PermissionManager({ workspaceWrite: false });
    expect(pmDenied.checkPermission(PERMISSION_CATEGORIES.WORKSPACE_WRITE).allowed).toBe(false);
  });

  it('explicit false configuration wins over auto-approve', () => {
    const pm = new PermissionManager({ workspaceWrite: false, shell: false, network: false });
    expect(pm.checkPermission(PERMISSION_CATEGORIES.WORKSPACE_WRITE, '', { autoApprove: true }).allowed).toBe(false);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'npm test', { autoApprove: true }).allowed).toBe(false);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.NETWORK, 'fetch', { autoApprove: true }).allowed).toBe(false);
  });

  it('auto-approve does not override the dangerous-command blocklist', () => {
    const pm = new PermissionManager({ shell: true });
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'rm -rf /', { autoApprove: true }).blocked).toBe(true);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'rm -rf --no-preserve-root /', { autoApprove: true }).blocked).toBe(true);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'rm -r -f ~', { autoApprove: true }).blocked).toBe(true);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'chmod -R 777 /', { autoApprove: true }).blocked).toBe(true);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'git checkout -- .', { autoApprove: true }).blocked).toBe(true);
  });

  it('allows legitimate shell commands when shell is enabled', () => {
    const pm = new PermissionManager({ shell: true });
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'npm run lint').allowed).toBe(true);
    expect(pm.checkPermission(PERMISSION_CATEGORIES.SHELL, 'rm -rf /tmp/scratch-build').allowed).toBe(true);
  });
});
