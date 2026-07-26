const EVENT_TYPES = new Set([
  'run.started', 'status', 'assistant.delta', 'assistant.completed',
  'tool.requested', 'approval.requested', 'approval.resolved',
  'tool.completed', 'error', 'verification.completed', 'run.completed',
  'session.list', 'session.show', 'session.deleted', 'compaction.summary'
]);

export function createEvent(type, data = {}, now = () => new Date()) {
  if (!EVENT_TYPES.has(type)) throw new TypeError(`Unknown CoreZ event type: ${type}`);
  return Object.freeze({ type, timestamp: now().toISOString(), data });
}

export function isCorezEvent(value) {
  return Boolean(value && EVENT_TYPES.has(value.type) && typeof value.timestamp === 'string');
}
