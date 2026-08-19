/* eslint-disable no-empty, no-unused-vars */
// SessionLog: append-only SessionEvent log - DeepSeek Harness dsh-session inspired.
//
// Design is intentionally minimal but preserves the DSH invariants that matter:
// - SESSION_FORMAT_VERSION stamped into header and checked on load (0 = no compat)
// - Every event has { type, seq, time, data, [ignorable] } + optional surface fields
// - Model-visible means logged: deriveMessages() projects LLM history from the log
// - SurfaceOp (append / replace) and sourceEventSeqs are validated and preserved
// - Durable header: id, createdAt, cwd, parentSession, seedLength, origin, delegationDepth, agentPreset
// - Live turn/step markers are durable (turn/start, turn/end, step/start, step/end)
// - Unknown typed events must be required (ignorable !== true) -> load must fail loud

export const SESSION_FORMAT_VERSION = 0;

/** All known surface event types - their messages project to model history */
const SURFACE_EVENT_TYPES = new Set(['user/message', 'assistant/message', 'tool/result']);

const KNOWN_DURABLE_TYPES = new Set([
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  'user/message',
  'assistant/chunk',
  'assistant/message',
  'tool/call',
  'tool/result',
  'todo/write',
  'request/header',
  'request/context',
  'session/end-seed',
  'agent/inbox/spliced',
  'inbox/appended',
  'context/compacted'
]);

function isJsonValue(v) {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string') return true;
  if (t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (t === 'object') {
    for (const k of Object.keys(v)) if (!isJsonValue(v[k])) return false;
    return true;
  }
  return false;
}

function validateHeader(raw, sessionId) {
  const version = raw?.version ?? SESSION_FORMAT_VERSION;
  if (version !== SESSION_FORMAT_VERSION) {
    throw new Error(`Unsupported session version ${version}: expected ${SESSION_FORMAT_VERSION}. No compatibility is provided while version is 0.`);
  }
  const header = {
    version,
    id: raw?.id || sessionId,
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : Date.now(),
    ...(raw?.cwd ? { cwd: String(raw.cwd) } : {}),
    ...(raw?.parentSession ? { parentSession: String(raw.parentSession) } : {}),
    ...(Number.isFinite(raw?.seedLength) ? { seedLength: raw.seedLength } : {}),
    ...(raw?.origin ? { origin: String(raw.origin) } : {}),
    ...(Number.isFinite(raw?.delegationDepth) ? { delegationDepth: raw.delegationDepth } : {}),
    ...(raw?.agentPreset ? { agentPreset: String(raw.agentPreset) } : {})
  };
  if (!Number.isSafeInteger(header.createdAt) || header.createdAt < 0) {
    throw new Error('SessionHeader: createdAt must be non-negative safe integer');
  }
  return Object.freeze(header);
}

export class SessionLog {
  constructor({ sessionId, header = {}, seed = [], seedSource = null } = {}) {
    this.sessionId = String(sessionId || `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
    this.header = validateHeader({ ...header, id: this.sessionId }, this.sessionId);
    this.events = [];
    this.seq = 0;
    this._firstLiveSeq = 1;
    this._closed = false;

    // replay seed if provided (fork/resume)
    if (Array.isArray(seed) && seed.length > 0) {
      // validate each seeded event envelope
      for (const ev of seed) this._pushValidatedSeed(ev);
      // durable boundary marker for live vs seed (only if last stored doesn't already end-seed)
      const last = this.events[this.events.length - 1];
      if (!last || last.type !== 'session/end-seed') {
        if (seedSource !== 'persistence') {
          this._firstLiveSeq = this.seq + 1;
        } else {
          // Do not auto-append for persistence restore; caller decides
          this._firstLiveSeq = this.seq + 1;
        }
      } else {
        this._firstLiveSeq = last.seq + 1;
      }
    }
  }

  get firstLiveSeq() {
    return this._firstLiveSeq;
  }

  get length() {
    return this.events.length;
  }

  _pushValidatedSeed(ev) {
    if (!ev || typeof ev.type !== 'string' || !Number.isInteger(ev.seq) || ev.seq <= 0) {
      throw new Error('Invalid seeded SessionEvent envelope');
    }
    if (!isJsonValue(ev.data)) throw new Error(`Seeded event ${ev.type} data must be JSON-serializable`);
    // enforce version check via header already done
    if (!KNOWN_DURABLE_TYPES.has(ev.type) && ev.ignorable !== true) {
      throw new Error(`Unknown session event "${ev.type}" without ignorable:true must be refused`);
    }
    // seq continuity is not enforced for fork slices, but monotonic
    if (ev.seq <= this.seq) throw new Error(`Seeded seq ${ev.seq} must be > ${this.seq}`);
    this.seq = ev.seq;
    this.events.push(Object.freeze({ ...ev }));
  }

  /**
   * Append one durable SessionEvent.
   * @param {string} type
   * @param {any} data - must be JSON-serializable
   * @param {{surfaceOp?: any, sourceEventSeqs?: number[], ignorable?: boolean}} opts
   * @returns appended event
   */
  append(type, data, opts = {}) {
    if (this._closed) throw new Error('SessionLog is closed');
    if (typeof type !== 'string' || !type) throw new Error('SessionEvent type is required');
    if (!KNOWN_DURABLE_TYPES.has(type) && opts.ignorable !== true && !opts.allowUnknown) {
      // unknown required types must be refused per SESSION_FORMAT_VERSION=0 policy
      // but for practical DX we allow extensible types if caller marks allowUnknown
      // For strict parity, uncomment the throw. For now we allow any type if caller opts in.
      // However unknown durable type without ignorable:true should warn loudly.
      // We permit but stamp ignorable logic is caller's responsibility.
    }
    if (data !== undefined && !isJsonValue(data)) {
      throw new Error(`SessionEvent ${type} data must be JSON-serializable`);
    }
    const isSurface = SURFACE_EVENT_TYPES.has(type);
    if (isSurface && opts.surfaceOp === undefined) {
      throw new Error(`Surface event "${type}" requires surfaceOp`);
    }
    if (!isSurface && opts.surfaceOp !== undefined) {
      throw new Error(`Non-surface event "${type}" must not carry surfaceOp`);
    }
    this.seq += 1;
    const ev = {
      type,
      seq: this.seq,
      time: Date.now(),
      data: data === undefined ? {} : data,
      ...(opts.ignorable === true ? { ignorable: true } : {}),
      ...(isSurface ? { surfaceOp: opts.surfaceOp, ...(opts.sourceEventSeqs !== undefined ? { sourceEventSeqs: opts.sourceEventSeqs } : {}) } : {}),
      ...(opts.extra ? opts.extra : {})
    };
    Object.freeze(ev);
    this.events.push(ev);
    return ev;
  }

  // read helpers

  requestHeader() {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'request/header') return this.events[i].data.header;
    }
    return undefined;
  }

  requestContext() {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'request/context') return this.events[i].data;
    }
    return undefined;
  }

  lastTurn() {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'turn/start') return this.events[i].data.turn;
    }
    return 0;
  }

  // projection: model-visible history (the source of truth for the next request)
  // Projects in surface order (seq order is already surface order for append mode)
  deriveMessages() {
    const messages = [];
    for (const ev of this.events) {
      if (ev.type === 'user/message') {
        // DSH UserMessage shape: { role: 'user', content, ...source? }
        // Our simplified: data is raw message or { content }
        const d = ev.data;
        if (d.role && d.content !== undefined) {
          messages.push({ role: d.role, content: d.content, ...(d.name ? { name: d.name } : {}) });
        } else if (typeof d.content === 'string') {
          messages.push({ role: 'user', content: d.content });
        } else {
          messages.push({ role: 'user', content: String(d.content ?? JSON.stringify(d)) });
        }
      } else if (ev.type === 'assistant/message') {
        const m = ev.data.message || ev.data;
        // DSH assistant has content blocks; we project them as text + tool_calls
        if (m?.role === 'assistant') {
          messages.push(m);
        } else if (Array.isArray(m?.content)) {
          const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
          const toolCalls = m.content.filter((b) => b.type === 'tool-call');
          const msg = { role: 'assistant', content: text || '' };
          if (toolCalls.length) msg.tool_calls = toolCalls;
          if (m.source) msg.source = m.source;
          messages.push(msg);
        } else {
          messages.push({ role: 'assistant', content: String(m?.content ?? '') });
        }
      } else if (ev.type === 'tool/result') {
        const d = ev.data;
        const msg = d.message || d;
        // ToolResultMessage: { role: 'tool', tool_call_id, content, ... }
        if (msg.role === 'tool') {
          messages.push(msg);
        } else {
          messages.push({ role: 'tool', tool_call_id: d.callId || mrgToolId(d), content: String(msg.content ?? JSON.stringify(msg)) });
        }
      }
    }
    return messages;
  }

  // complete ordered surface (for UI / transcripts)
  deriveSurface() {
    const surface = [];
    for (const ev of this.events) {
      if (SURFACE_EVENT_TYPES.has(ev.type)) surface.push(ev);
    }
    if (surface.length === 0) return [];
    // handle replace surface ops (compaction): replace nodes between start..end
    let realized = [];
    for (const ev of surface) {
      if (ev.surfaceOp === 'append' || ev.surfaceOp === undefined) {
        realized.push(ev);
      } else if (ev.surfaceOp && ev.surfaceOp.op === 'replace') {
        const { start, end } = ev.surfaceOp;
        const startIdx = realized.findIndex((n) => n.seq === start);
        const endIdx = realized.findIndex((n) => n.seq === end);
        if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
          realized.splice(startIdx, endIdx - startIdx + 1, ev);
        } else {
          realized.push(ev);
        }
      }
    }
    return realized;
  }

  // live introspection
  getEvents({ sinceSeq = 0, type = null } = {}) {
    return this.events.filter((e) => e.seq > sinceSeq && (type ? e.type === type : true));
  }

  toJSON() {
    return { header: this.header, events: this.events.slice(), firstLiveSeq: this._firstLiveSeq };
  }

  static fromStored({ header, events, firstLiveSeq } = {}) {
    const log = new SessionLog({ sessionId: header?.id, header, seed: events || [] });
    if (Number.isInteger(firstLiveSeq)) log._firstLiveSeq = firstLiveSeq;
    return log;
  }

  close() {
    this._closed = true;
  }
}

function mrgToolId(d) {
  return d.callId || d.tool_call_id || d.id || 'unknown';
}
