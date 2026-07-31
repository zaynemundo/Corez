export const PERMISSION_CATEGORIES = Object.freeze({
  READ: 'read',
  WORKSPACE_WRITE: 'workspace-write',
  SHELL: 'shell',
  NETWORK: 'network',
  DANGEROUS: 'dangerous'
});

const DANGEROUS_RM_TARGETS = /(\.{1,2}(?:\/|$)|~(?:\/|$)|\*|\$HOME|\/\s*$)/i;

export const BLOCKED_DANGEROUS_COMMANDS = Object.freeze([
  // rm with any force/recursive flag cluster (e.g. -rf, -fr, -rfi) targeting
  // traversal/root paths
  new RegExp(`\\brm\\s+(-{0,2}[a-z]*[rf][a-z]*[rf][a-z]*\\s+)*${DANGEROUS_RM_TARGETS.source}`, 'i'),
  // rm with flags targeting traversal/root paths
  new RegExp(`\\brm\\s+(-{0,2}[a-z-]+\\s+)*--no-preserve-root\\s+${DANGEROUS_RM_TARGETS.source}`, 'i'),
  new RegExp(`\\brm\\s+(-{0,2}[a-z-]+\\s+)*${DANGEROUS_RM_TARGETS.source}(\\s|$)`, 'i'),
  /\brm\s+-r\s+-f\s+/i,
  /\brm\s+-rfi\s+/i,
  // find with destructive actions
  /\bfind\s+[^|;&]+\s+-(?:exec|ok|delete)\b/i,
  // shell -c wrappers around destructive primitives
  /\b(?:sh|bash|zsh|ksh)\s+-c\b[^|;&]*(?:rm\b|mkfs|dd\s+if=|:\(\)|curl|wget|eval|git\s+reset)[^|;&]*/i,
  // eval with command substitution or strings
  /\beval\s+[$("`]/i,
  // git checkout/restore of whole trees (with or without --)
  /git\s+checkout\s+(--\s+)?(\.{1,2}|~|\/|\*)/i,
  /git\s+restore\s+(--\s+)?(\.{1,2}|~|\/|\*)/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+(-{1,2}[a-z]+)/i,
  // pipe remote scripts straight into a shell
  /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i,
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
