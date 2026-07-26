import { CorezError, ERROR_CODES } from '../contracts/errors.js';

function normalizedScope(request = {}) {
  const rawScope = request.scope || `${request.category || 'tool'}:${request.operation || request.tool || ''}`;
  return String(rawScope).trim().replace(/\s+/g, ' ').toLowerCase();
}

function denied(message, details) {
  return new CorezError(ERROR_CODES.TOOL_DENIED, message, details);
}

export class ApprovalController {
  constructor({ prompt, interactive = typeof prompt === 'function' } = {}) {
    this.prompt = prompt;
    this.interactive = interactive;
    this.sessionApprovals = new Set();
  }

  async authorize(request = {}) {
    const permission = request.decision || { action: 'ask', allowed: false };
    const scope = normalizedScope(request);

    if (permission.action === 'blocked' || permission.action === 'deny') {
      throw denied('Tool operation is blocked by policy.', { request, permission });
    }
    if (permission.action === 'allow' || permission.allowed === true) {
      return { allowed: true, persistence: 'none' };
    }
    if (this.sessionApprovals.has(scope)) {
      return { allowed: true, persistence: 'session' };
    }
    if (!this.interactive || typeof this.prompt !== 'function') {
      throw new CorezError(
        ERROR_CODES.TOOL_APPROVAL_REQUIRED,
        'Tool approval is required in non-interactive mode.',
        { request, permission }
      );
    }

    const response = await this.prompt({ ...request, permission, scope });
    if (response === 'session') {
      this.sessionApprovals.add(scope);
      return { allowed: true, persistence: 'session' };
    }
    if (response === 'once') return { allowed: true, persistence: 'once' };
    throw denied('Tool operation was denied.', { request, permission, response });
  }
}
