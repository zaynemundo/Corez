export const PERMISSION_CATEGORIES = Object.freeze({
  READ: 'read',
  WORKSPACE_WRITE: 'workspace-write',
  SHELL: 'shell',
  NETWORK: 'network',
  DANGEROUS: 'dangerous'
});

export const BLOCKED_DANGEROUS_COMMANDS = Object.freeze([
  /rm\s+-rf\s+[/]/i,
  /rm\s+-rf\s+[*]/i,
  /rm\s+-rf\s+~\/?/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-fdx?/i,
  /sudo\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:()\s*\{\s*:\|:&\s*\};:/i
]);

export class PermissionManager {
  constructor(configPermissions = {}) {
    this.permissions = {
      read: true,
      workspaceWrite: true,
      shell: 'ask',
      network: 'ask',
      dangerous: false,
      ...configPermissions
    };
  }

  isDangerousCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    return BLOCKED_DANGEROUS_COMMANDS.some(pattern => pattern.test(cmd));
  }

  checkPermission(category, detail = '', options = {}) {
    // 1. Dangerous check
    if (category === PERMISSION_CATEGORIES.SHELL || category === PERMISSION_CATEGORIES.DANGEROUS) {
      if (this.isDangerousCommand(detail)) {
        return {
          allowed: false,
          reason: `Command matches blocked dangerous pattern: "${detail}"`,
          requiresUserApproval: false,
          blocked: true
        };
      }
    }

    if (category === PERMISSION_CATEGORIES.DANGEROUS && !this.permissions.dangerous && !options.autoApprove) {
      return {
        allowed: false,
        reason: 'Dangerous operations are disabled by policy',
        requiresUserApproval: true
      };
    }

    // 2. Safe read operations
    if (category === PERMISSION_CATEGORIES.READ) {
      return { allowed: true, reason: 'Read operations are auto-approved' };
    }

    // 3. Workspace write
    if (category === PERMISSION_CATEGORIES.WORKSPACE_WRITE) {
      const mode = this.permissions.workspaceWrite;
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Workspace write allowed by configuration' };
      }
      if (mode === false) {
        return { allowed: false, reason: 'Workspace write disabled by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires workspace write approval' };
    }

    // 4. Shell execution
    if (category === PERMISSION_CATEGORIES.SHELL) {
      const mode = this.permissions.shell;
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Shell execution allowed by configuration' };
      }
      if (mode === false) {
        return { allowed: false, reason: 'Shell execution disabled by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires shell approval' };
    }

    // 5. Network access
    if (category === PERMISSION_CATEGORIES.NETWORK) {
      const mode = this.permissions.network;
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Network operations allowed by configuration' };
      }
      if (mode === false) {
        return { allowed: false, reason: 'Network operations disabled by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires network approval' };
    }

    return { allowed: true, reason: 'Allowed by default' };
  }
}
