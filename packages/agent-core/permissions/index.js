export const PERMISSION_CATEGORIES = Object.freeze({
  READ: 'read',
  WORKSPACE_WRITE: 'workspace-write',
  SHELL: 'shell',
  NETWORK: 'network',
  DANGEROUS: 'dangerous'
});

export const HARD_BLOCKED_COMMANDS = Object.freeze([
  /\brm\s+(-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r)\s+(\/|~|\*)\b/i,
  /\brm\s+(-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r)\s+(\/|~|\*)(?=\s|$)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[A-Za-z]*f/i,
  /\bsudo\b/i,
  /\b(mkfs|fdisk|parted)\b/i,
  /\bdd\s+if=/i
]);

export const SENSITIVE_FILE_OPERATION = /(^|[\\/])(\.env($|\.)|.*credentials?.*|.*secrets?.*|.*\.(pem|key|pfx|p12)$)/i;
const SENSITIVE_FILE_TOKEN = /(^|[\\/\s'"])(\.env($|\.)|[^\\/\s'"]*credentials?[^\\/\s'"]*|[^\\/\s'"]*secrets?[^\\/\s'"]*|[^\\/\s'"]*\.(pem|key|pfx|p12))(?=$|[\\/\s'"])/i;

// Temporary compatibility export for the unmigrated Task 5 runtime. Remove in Task 5.
export const BLOCKED_DANGEROUS_COMMANDS = HARD_BLOCKED_COMMANDS;

const CATEGORY_PERMISSION_KEY = Object.freeze({
  [PERMISSION_CATEGORIES.READ]: 'read',
  [PERMISSION_CATEGORIES.WORKSPACE_WRITE]: 'workspaceWrite',
  [PERMISSION_CATEGORIES.SHELL]: 'shell',
  [PERMISSION_CATEGORIES.NETWORK]: 'network',
  [PERMISSION_CATEGORIES.DANGEROUS]: 'dangerous'
});

function normalizeMode(value, fallback) {
  if (value === true) return 'allow';
  if (value === false) return 'deny';
  return ['allow', 'ask', 'deny'].includes(value) ? value : fallback;
}

function decision(action, reason, extra = {}) {
  return {
    action,
    allowed: action === 'allow',
    reason,
    requiresUserApproval: action === 'ask',
    blocked: action === 'blocked',
    ...extra
  };
}

function operationTargetsSensitiveFile(operation) {
  return SENSITIVE_FILE_OPERATION.test(operation) || SENSITIVE_FILE_TOKEN.test(operation);
}

export class PermissionManager {
  constructor(configPermissions = {}) {
    this.permissions = {
      read: 'allow',
      workspaceWrite: 'allow',
      shell: 'ask',
      network: 'ask',
      dangerous: 'deny',
      ...Object.fromEntries(Object.entries(configPermissions).map(([key, value]) => [
        key,
        normalizeMode(value, 'ask')
      ]))
    };
  }

  resolve({ category, operation = '', autoApprove = false, contained = false } = {}) {
    const normalizedOperation = typeof operation === 'string' ? operation.trim() : String(operation ?? '');
    const permissionKey = CATEGORY_PERMISSION_KEY[category];

    if (!permissionKey) {
      return decision('blocked', `Unknown permission category: ${category}`);
    }

    if (operationTargetsSensitiveFile(normalizedOperation)) {
      return decision('blocked', 'Credential and secret-file operations are always blocked.');
    }

    if ((category === PERMISSION_CATEGORIES.SHELL || category === PERMISSION_CATEGORIES.DANGEROUS)
      && HARD_BLOCKED_COMMANDS.some(pattern => pattern.test(normalizedOperation))) {
      return decision('blocked', 'Command matches a blocked dangerous pattern.');
    }

    const mode = normalizeMode(this.permissions[permissionKey], 'ask');
    if (mode === 'deny') return decision('blocked', `${category} operations are disabled by policy.`);
    if (mode === 'allow') return decision('allow', `${category} operations are allowed by policy.`);
    if (autoApprove && contained) return decision('allow', 'Contained ordinary operation auto-approved.');
    return decision('ask', `${category} operation requires approval.`);
  }

  isDangerousCommand(operation) {
    return typeof operation === 'string'
      && HARD_BLOCKED_COMMANDS.some(pattern => pattern.test(operation));
  }

  // Temporary compatibility alias for the unmigrated Task 5 runtime. Remove in Task 5.
  checkPermission(category, detail = '', options = {}) {
    return this.resolve({
      category,
      operation: detail,
      autoApprove: options.autoApprove,
      contained: options.contained
    });
  }
}
