import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';

const CREATE_FIELDS = ['projectPath', 'model', 'policy', 'title'];
const UPDATE_FIELDS = ['model', 'policy', 'status', 'title'];

function selectFields(input, fields) {
  return Object.fromEntries(
    fields
      .filter(field => Object.hasOwn(input, field))
      .map(field => [field, input[field]])
  );
}

function sessionError(code, message, details = {}, options = {}) {
  return new CorezError(code, message, details, options);
}

export class JsonlSessionStore {
  constructor({ rootDir, now = () => new Date() } = {}) {
    if (!rootDir) throw new TypeError('Session root directory is required.');
    if (typeof now !== 'function') throw new TypeError('Session clock must be a function.');

    this.rootDir = path.resolve(rootDir);
    this.now = now;
    this.indexPath = path.join(this.rootDir, 'index.json');
    this.temporaryIndexPath = path.join(this.rootDir, 'index.json.tmp');
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  create(input = {}) {
    const id = crypto.randomUUID();
    const timestamp = this.#timestamp();
    const record = {
      id,
      ...selectFields(input, CREATE_FIELDS),
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active'
    };
    const eventPath = this.#eventPath(id);
    fs.writeFileSync(eventPath, '', { flag: 'wx' });

    try {
      this.#writeIndex([...this.#readIndex(), record]);
    } catch (error) {
      fs.rmSync(eventPath, { force: true });
      throw error;
    }
    return { ...record };
  }

  list() {
    return this.#readIndex().map(record => ({ ...record }));
  }

  get(id) {
    const record = this.#readIndex().find(session => session.id === id);
    return record ? { ...record } : undefined;
  }

  append(id, event) {
    this.#require(id);
    const serialized = JSON.stringify(event);
    if (typeof serialized !== 'string') {
      throw new TypeError('Session event must be JSON serializable.');
    }

    const descriptor = fs.openSync(this.#eventPath(id), 'a');
    try {
      fs.writeFileSync(descriptor, `${serialized}\n`, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    this.update(id, {});
    return event;
  }

  readEvents(id) {
    this.#require(id);
    let contents;
    try {
      contents = fs.readFileSync(this.#eventPath(id), 'utf8');
    } catch (error) {
      throw sessionError(
        ERROR_CODES.SESSION_CORRUPT,
        `Session event log is unavailable for "${id}".`,
        { sessionId: id },
        { cause: error }
      );
    }
    if (contents === '') return [];

    const lines = contents.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw sessionError(
          ERROR_CODES.SESSION_CORRUPT,
          `Session "${id}" has a corrupt event at line ${index + 1}.`,
          { sessionId: id, line: index + 1 },
          { cause: error }
        );
      }
    });
  }

  update(id, patch = {}) {
    const records = this.#readIndex();
    const index = records.findIndex(session => session.id === id);
    if (index < 0) throw this.#notFound(id);

    const updated = {
      ...records[index],
      ...selectFields(patch, UPDATE_FIELDS),
      updatedAt: this.#timestamp()
    };
    records[index] = updated;
    this.#writeIndex(records);
    return { ...updated };
  }

  delete(id) {
    const records = this.#readIndex();
    const index = records.findIndex(session => session.id === id);
    if (index < 0) throw this.#notFound(id);

    const [deleted] = records.splice(index, 1);
    this.#writeIndex(records);
    fs.rmSync(this.#eventPath(id), { force: true });
    return { ...deleted };
  }

  #eventPath(id) {
    return path.join(this.rootDir, `${id}.jsonl`);
  }

  #notFound(id) {
    return sessionError(
      ERROR_CODES.SESSION_NOT_FOUND,
      `Session "${id}" was not found.`,
      { sessionId: id }
    );
  }

  #readIndex() {
    if (!fs.existsSync(this.indexPath)) return [];
    try {
      const records = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!Array.isArray(records)) throw new TypeError('Session index must contain an array.');
      return records;
    } catch (error) {
      if (error?.code === ERROR_CODES.SESSION_CORRUPT) throw error;
      throw sessionError(
        ERROR_CODES.SESSION_CORRUPT,
        'Session index is corrupt.',
        {},
        { cause: error }
      );
    }
  }

  #require(id) {
    const record = this.get(id);
    if (!record) throw this.#notFound(id);
    return record;
  }

  #timestamp() {
    const value = this.now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError('Session clock must return a valid Date.');
    }
    return value.toISOString();
  }

  #writeIndex(records) {
    const descriptor = fs.openSync(this.temporaryIndexPath, 'w');
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
      fs.fsyncSync(descriptor);
    } catch (error) {
      fs.closeSync(descriptor);
      fs.rmSync(this.temporaryIndexPath, { force: true });
      throw error;
    }
    fs.closeSync(descriptor);

    try {
      fs.renameSync(this.temporaryIndexPath, this.indexPath);
    } catch (error) {
      fs.rmSync(this.temporaryIndexPath, { force: true });
      throw error;
    }
  }
}
