import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { isCorezEvent } from '../contracts/events.js';

const INDEX_FIELDS = Object.freeze([
  'id', 'projectPath', 'model', 'policy', 'title',
  'createdAt', 'updatedAt', 'status'
]);
const UPDATE_FIELDS = Object.freeze(['model', 'policy', 'status', 'title']);
const SESSION_STATUSES = new Set([
  'active', 'completed', 'cancelled', 'failed', 'corrupt'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVENT_FIELDS = Object.freeze(['data', 'timestamp', 'type']);
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedString(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(`Session ${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Session ${field} must not be empty.`);
  }
  return normalized;
}

function normalizedProjectPath(value) {
  const projectPath = normalizedString(value, 'projectPath');
  if (!path.isAbsolute(projectPath)) {
    throw new TypeError('Session projectPath must be absolute.');
  }
  return path.resolve(projectPath);
}

function normalizedTimestamp(value, field) {
  const timestamp = normalizedString(value, field);
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
    throw new TypeError(`Session ${field} must be an ISO timestamp.`);
  }
  return timestamp;
}

function normalizedStatus(value) {
  const status = normalizedString(value, 'status');
  if (!SESSION_STATUSES.has(status)) {
    throw new TypeError(`Unknown session status: ${status}`);
  }
  return status;
}

function normalizedCreateInput(input) {
  if (!plainObject(input)) throw new TypeError('Session metadata must be an object.');
  return {
    projectPath: normalizedProjectPath(input.projectPath),
    model: normalizedString(input.model, 'model'),
    policy: normalizedString(input.policy, 'policy'),
    title: normalizedString(input.title, 'title')
  };
}

function normalizedUpdate(patch) {
  if (!plainObject(patch)) throw new TypeError('Session metadata patch must be an object.');
  const update = {};
  for (const field of UPDATE_FIELDS) {
    if (!Object.hasOwn(patch, field)) continue;
    update[field] = field === 'status'
      ? normalizedStatus(patch[field])
      : normalizedString(patch[field], field);
  }
  return update;
}

function sessionError(code, message, details = {}, options = {}) {
  return new CorezError(code, message, details, options);
}

function corruption(message, details = {}, cause) {
  return sessionError(
    ERROR_CODES.SESSION_CORRUPT,
    message,
    details,
    cause ? { cause } : {}
  );
}

function decodeEvent(value) {
  if (!plainObject(value)) throw new TypeError('Session event must be an object.');
  const fields = Object.keys(value).sort();
  if (fields.length !== EVENT_FIELDS.length
    || fields.some((field, index) => field !== EVENT_FIELDS[index])) {
    throw new TypeError('Session event contains unexpected fields.');
  }
  if (!isCorezEvent(value)) throw new TypeError('Session event type is invalid.');
  normalizedTimestamp(value.timestamp, 'event timestamp');
  if (!plainObject(value.data)) throw new TypeError('Session event data must be an object.');
  return value;
}

function decodeIndexRecord(value) {
  if (!plainObject(value)) throw new TypeError('Session index record must be an object.');
  const fields = Object.keys(value).sort();
  const expected = [...INDEX_FIELDS].sort();
  if (fields.length !== expected.length
    || fields.some((field, index) => field !== expected[index])) {
    throw new TypeError('Session index record contains unexpected fields.');
  }
  if (typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) {
    throw new TypeError('Session ID must be a UUID v4.');
  }
  if (normalizedProjectPath(value.projectPath) !== value.projectPath) {
    throw new TypeError('Session projectPath must be canonical.');
  }
  for (const field of ['model', 'policy', 'title']) {
    if (normalizedString(value[field], field) !== value[field]) {
      throw new TypeError(`Session ${field} must be normalized.`);
    }
  }
  normalizedStatus(value.status);
  normalizedTimestamp(value.createdAt, 'createdAt');
  normalizedTimestamp(value.updatedAt, 'updatedAt');
  if (value.updatedAt < value.createdAt) {
    throw new TypeError('Session updatedAt must not precede createdAt.');
  }
  return value;
}

function decodeIndex(value) {
  if (!Array.isArray(value)) throw new TypeError('Session index must contain an array.');
  const ids = new Set();
  return value.map(record => {
    const decoded = decodeIndexRecord(record);
    if (ids.has(decoded.id)) throw new TypeError('Session index IDs must be unique.');
    ids.add(decoded.id);
    return decoded;
  });
}

export class JsonlSessionStore {
  constructor({
    rootDir,
    now = () => new Date(),
    lockTimeoutMs = 5_000,
    staleLockMs = 30_000
  } = {}) {
    if (!rootDir) throw new TypeError('Session root directory is required.');
    if (typeof now !== 'function') throw new TypeError('Session clock must be a function.');
    if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 1) {
      throw new TypeError('Session lock timeout must be positive.');
    }
    if (!Number.isFinite(staleLockMs) || staleLockMs < 1) {
      throw new TypeError('Session stale lock threshold must be positive.');
    }

    this.rootDir = path.resolve(rootDir);
    this.now = now;
    this.lockTimeoutMs = lockTimeoutMs;
    this.staleLockMs = staleLockMs;
    this.indexPath = path.join(this.rootDir, 'index.json');
    this.lockPath = path.join(this.rootDir, 'index.lock');
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  create(input = {}) {
    const metadata = normalizedCreateInput(input);
    return this.#withLock(() => {
      const records = this.#readIndex();
      const id = crypto.randomUUID();
      const timestamp = this.#timestamp();
      const record = {
        id,
        ...metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'active'
      };
      const eventPath = this.#eventPath(id);
      let descriptor;
      try {
        descriptor = fs.openSync(eventPath, 'wx');
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        this.#syncDirectory();
      } catch (error) {
        if (descriptor !== undefined) {
          try {
            fs.closeSync(descriptor);
          } catch {
            // Preserve the original durability failure.
          }
        }
        fs.rmSync(eventPath, { force: true });
        try {
          this.#syncDirectory();
        } catch {
          // Preserve the original durability failure.
        }
        throw error;
      }

      try {
        this.#writeIndex([...records, record]);
      } catch (error) {
        try {
          this.#writeIndex(records);
        } catch {
          // Preserve the original write failure while making a best-effort rollback.
        }
        fs.rmSync(eventPath, { force: true });
        this.#syncDirectory();
        throw error;
      }
      return { ...record };
    });
  }

  list() {
    return this.#readIndex().map(record => ({ ...record }));
  }

  get(id) {
    const record = this.#readIndex().find(session => session.id === id);
    return record ? { ...record } : undefined;
  }

  append(id, event) {
    decodeEvent(event);
    const serialized = JSON.stringify(event);
    return this.#withLock(() => {
      const records = this.#readIndex();
      const index = records.findIndex(session => session.id === id);
      if (index < 0) throw this.#notFound(id);
      const updatedAt = this.#timestamp();
      const eventPath = this.#eventPath(id);
      const descriptor = this.#openEventLog(eventPath, id, true);
      const originalSize = fs.fstatSync(descriptor).size;
      const updatedRecords = records.map((record, recordIndex) => (
        recordIndex === index ? { ...record, updatedAt } : record
      ));

      try {
        fs.writeSync(descriptor, `${serialized}\n`, originalSize, 'utf8');
        fs.fsyncSync(descriptor);
        try {
          this.#writeIndex(updatedRecords);
        } catch (error) {
          fs.ftruncateSync(descriptor, originalSize);
          fs.fsyncSync(descriptor);
          try {
            this.#writeIndex(records);
          } catch {
            // Preserve the original write failure after best-effort index rollback.
          }
          throw error;
        }
      } catch (error) {
        const size = fs.fstatSync(descriptor).size;
        if (size !== originalSize) {
          fs.ftruncateSync(descriptor, originalSize);
          fs.fsyncSync(descriptor);
        }
        throw error;
      } finally {
        fs.closeSync(descriptor);
      }
      return event;
    });
  }

  readEvents(id) {
    this.#require(id);
    const eventPath = this.#eventPath(id);
    const descriptor = this.#openEventLog(eventPath, id);
    let contents;
    try {
      contents = fs.readFileSync(descriptor, 'utf8');
    } catch (error) {
      if (error?.code === ERROR_CODES.SESSION_CORRUPT) throw error;
      throw corruption(
        `Session event log is unavailable for "${id}".`,
        { sessionId: id },
        error
      );
    } finally {
      fs.closeSync(descriptor);
    }
    if (contents === '') return [];

    const lines = contents.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.map((line, index) => {
      try {
        return decodeEvent(JSON.parse(line));
      } catch (error) {
        throw corruption(
          `Session "${id}" has a corrupt event at line ${index + 1}.`,
          { sessionId: id, line: index + 1 },
          error
        );
      }
    });
  }

  update(id, patch = {}) {
    const normalizedPatch = normalizedUpdate(patch);
    return this.#withLock(() => {
      const records = this.#readIndex();
      const index = records.findIndex(session => session.id === id);
      if (index < 0) throw this.#notFound(id);
      const updated = {
        ...records[index],
        ...normalizedPatch,
        updatedAt: this.#timestamp()
      };
      const updatedRecords = [...records];
      updatedRecords[index] = updated;
      try {
        this.#writeIndex(updatedRecords);
      } catch (error) {
        try {
          this.#writeIndex(records);
        } catch {
          // Preserve the original write failure after best-effort rollback.
        }
        throw error;
      }
      return { ...updated };
    });
  }

  delete(id) {
    return this.#withLock(() => {
      const records = this.#readIndex();
      const index = records.findIndex(session => session.id === id);
      if (index < 0) throw this.#notFound(id);
      const eventPath = this.#eventPath(id);
      this.#assertEventLog(eventPath, id);
      const tombstone = path.join(
        this.rootDir,
        `${id}.delete.${process.pid}.${crypto.randomUUID()}`
      );
      const [deleted] = records.splice(index, 1);
      const originalRecords = [...records.slice(0, index), deleted, ...records.slice(index)];
      fs.renameSync(eventPath, tombstone);
      this.#syncDirectory();

      try {
        this.#writeIndex(records);
        fs.unlinkSync(tombstone);
        this.#syncDirectory();
      } catch (error) {
        try {
          this.#writeIndex(originalRecords);
        } catch {
          // Preserve the deletion failure after best-effort index rollback.
        }
        if (fs.existsSync(tombstone) && !fs.existsSync(eventPath)) {
          fs.renameSync(tombstone, eventPath);
          this.#syncDirectory();
        }
        throw error;
      }
      return { ...deleted };
    });
  }

  #acquireLock() {
    const deadline = Date.now() + this.lockTimeoutMs;
    const token = crypto.randomUUID();
    while (true) {
      let descriptor;
      let created = false;
      try {
        descriptor = fs.openSync(this.lockPath, 'wx');
        created = true;
        fs.writeFileSync(descriptor, JSON.stringify({
          token,
          pid: process.pid,
          createdAt: Date.now()
        }));
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        this.#syncDirectory();
        return token;
      } catch (error) {
        if (descriptor !== undefined) {
          try {
            fs.closeSync(descriptor);
          } catch {
            // The descriptor may already be closed.
          }
        }
        if (created) {
          fs.rmSync(this.lockPath, { force: true });
          try {
            this.#syncDirectory();
          } catch {
            // Preserve the original acquisition failure.
          }
        }
        if (error?.code !== 'EEXIST') throw error;
        this.#recoverStaleLock();
        if (Date.now() >= deadline) {
          throw new Error('Timed out acquiring the session store lock.', { cause: error });
        }
        Atomics.wait(WAIT_BUFFER, 0, 0, 5);
      }
    }
  }

  #assertEventLog(eventPath, id) {
    try {
      if (!fs.lstatSync(eventPath).isFile()) {
        throw new TypeError('Session event log is not a file.');
      }
    } catch (error) {
      throw corruption(
        `Session event log is unavailable for "${id}".`,
        { sessionId: id },
        error
      );
    }
  }

  #eventPath(id) {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      throw corruption('Session index contains an unsafe ID.', { sessionId: id });
    }
    const eventPath = path.resolve(this.rootDir, `${id}.jsonl`);
    if (path.dirname(eventPath) !== this.rootDir) {
      throw corruption('Session event path escapes the session root.', { sessionId: id });
    }
    return eventPath;
  }

  #notFound(id) {
    return sessionError(
      ERROR_CODES.SESSION_NOT_FOUND,
      `Session "${id}" was not found.`,
      { sessionId: id }
    );
  }

  #openEventLog(eventPath, id, writable = false) {
    let descriptor;
    try {
      const access = writable ? fs.constants.O_RDWR : fs.constants.O_RDONLY;
      descriptor = fs.openSync(eventPath, access | (fs.constants.O_NOFOLLOW ?? 0));
      if (!fs.fstatSync(descriptor).isFile()) {
        fs.closeSync(descriptor);
        descriptor = undefined;
        throw new TypeError('Session event log is not a file.');
      }
      return descriptor;
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
          // Preserve the original open failure.
        }
      }
      throw corruption(
        `Session event log is unavailable for "${id}".`,
        { sessionId: id },
        error
      );
    }
  }

  #readIndex() {
    if (!fs.existsSync(this.indexPath)) return [];
    try {
      return decodeIndex(JSON.parse(fs.readFileSync(this.indexPath, 'utf8')));
    } catch (error) {
      if (error?.code === ERROR_CODES.SESSION_CORRUPT) throw error;
      throw corruption('Session index is corrupt.', {}, error);
    }
  }

  #recoverStaleLock() {
    let firstStat;
    try {
      firstStat = fs.statSync(this.lockPath);
      if (Date.now() - firstStat.mtimeMs <= this.staleLockMs) return;
      const lock = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
      const secondStat = fs.statSync(this.lockPath);
      if (firstStat.ino !== secondStat.ino
        || Date.now() - secondStat.mtimeMs <= this.staleLockMs) return;
      if (this.#processIsAlive(lock.pid)) return;
      const stalePath = `${this.lockPath}.stale.${process.pid}.${crypto.randomUUID()}`;
      fs.renameSync(this.lockPath, stalePath);
      fs.rmSync(stalePath, { force: true });
      this.#syncDirectory();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  #processIsAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === 'EPERM';
    }
  }

  #releaseLock(token) {
    try {
      const lock = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
      if (lock.token !== token) return;
      fs.unlinkSync(this.lockPath);
      this.#syncDirectory();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  #require(id) {
    const record = this.get(id);
    if (!record) throw this.#notFound(id);
    return record;
  }

  #syncDirectory() {
    const descriptor = fs.openSync(this.rootDir, 'r');
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  #timestamp() {
    const value = this.now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError('Session clock must return a valid Date.');
    }
    return value.toISOString();
  }

  #withLock(operation) {
    const token = this.#acquireLock();
    try {
      return operation();
    } finally {
      this.#releaseLock(token);
    }
  }

  #writeIndex(records) {
    decodeIndex(records);
    const temporaryIndexPath = path.join(
      this.rootDir,
      `index.json.tmp.${process.pid}.${crypto.randomUUID()}`
    );
    let descriptor;
    try {
      descriptor = fs.openSync(temporaryIndexPath, 'wx');
      fs.writeFileSync(descriptor, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryIndexPath, this.indexPath);
      this.#syncDirectory();
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
          // Preserve the original write failure.
        }
      }
      fs.rmSync(temporaryIndexPath, { force: true });
      throw error;
    }
  }
}
