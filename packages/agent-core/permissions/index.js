export const PERMISSION_CATEGORIES = Object.freeze({
  READ: 'read',
  WORKSPACE_WRITE: 'workspace-write',
  SHELL: 'shell',
  NETWORK: 'network',
  DANGEROUS: 'dangerous'
});

export const BLOCKED_DANGEROUS_COMMANDS = Object.freeze([
  /\brm\s+(-{1,2}[a-z]+\s+)*(--no-preserve-root\s+)?(\.|\*|~|\/|\$HOME)(\s|$)/i,
  /^rm\s+(-{1,2}[a-z]+\s+)*--(recursive|force)/i,
  /rm\s+-r\s+-f\s+/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+(-{1,2}[a-z]+)/i,
  /git\s+checkout\s+--\s+(\.|\/)/i,
  /sudo\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /chmod\s+-R\s+[0-7]{3,4}\s+\//i,
  /chown\s+-R\s+\S+\s+\//i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/i
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
    // 1. Dangerous check (always enforced, never auto-approvable)
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

    if (category === PERMISSION_CATEGORIES.DANGEROUS && !this.permissions.dangerous) {
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

    // 3. Workspace write (explicit false always wins over auto-approve)
    if (category === PERMISSION_CATEGORIES.WORKSPACE_WRITE) {
      const mode = this.permissions.workspaceWrite;
      if (mode === false) {
        return { allowed: false, reason: 'Workspace write disabled by configuration' };
      }
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Workspace write allowed by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires workspace write approval' };
    }

    // 4. Shell execution (explicit false always wins over auto-approve)
    if (category === PERMISSION_CATEGORIES.SHELL) {
      const mode = this.permissions.shell;
      if (mode === false) {
        return { allowed: false, reason: 'Shell execution disabled by configuration' };
      }
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Shell execution allowed by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires shell approval' };
    }

    // 5. Network access (explicit false always wins over auto-approve)
    if (category === PERMISSION_CATEGORIES.NETWORK) {
      const mode = this.permissions.network;
      if (mode === false) {
        return { allowed: false, reason: 'Network operations disabled by configuration' };
      }
      if (mode === true || options.autoApprove) {
        return { allowed: true, reason: 'Network operations allowed by configuration' };
      }
      return { allowed: true, requiresUserApproval: true, reason: 'Requires network approval' };
    }

    return { allowed: true, reason: 'Allowed by default' };
  }
}
