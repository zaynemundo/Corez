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
});
