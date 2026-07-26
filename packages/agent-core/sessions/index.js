import fs from 'node:fs';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { JsonlSessionStore } from './jsonl-store.js';

function notFound(id, projectPath) {
  const details = id ? { sessionId: id } : { projectPath };
  const subject = id ? `Session "${id}"` : `A session for "${projectPath}"`;
  return new CorezError(
    ERROR_CODES.SESSION_NOT_FOUND,
    `${subject} was not found.`,
    details
  );
}

export class SessionService {
  constructor({
    store,
    realpath = fs.realpathSync,
    now = () => new Date()
  } = {}) {
    if (!store) throw new TypeError('Session store is required.');
    if (typeof realpath !== 'function') throw new TypeError('Session realpath must be a function.');
    if (typeof now !== 'function') throw new TypeError('Session clock must be a function.');
    this.store = store;
    this.realpath = realpath;
    this.now = now;
  }

  create(input) {
    return this.store.create({
      ...input,
      projectPath: this.#canonical(input.projectPath)
    });
  }

  append(id, event, projectPath) {
    this.resume(id, projectPath);
    return this.store.append(id, event);
  }

  resume(id, projectPath) {
    const expectedProject = this.#canonical(projectPath);
    const session = this.#get(id);
    const sessionProject = this.#canonical(session.projectPath);
    if (sessionProject !== expectedProject) {
      throw new CorezError(
        ERROR_CODES.SESSION_PROJECT_MISMATCH,
        `Session "${id}" belongs to a different project.`,
        {
          sessionId: id,
          projectPath: expectedProject,
          sessionProjectPath: sessionProject
        }
      );
    }
    return session;
  }

  continue(projectPath) {
    const sessions = this.list(projectPath)
      .sort((left, right) => (
        right.updatedAt.localeCompare(left.updatedAt)
        || right.createdAt.localeCompare(left.createdAt)
      ));
    if (sessions.length === 0) throw notFound(undefined, this.#canonical(projectPath));
    return sessions[0];
  }

  list(projectPath) {
    const canonicalProject = this.#canonical(projectPath);
    const sessions = this.store.list();
    return sessions.filter(session => (
      this.#canonical(session.projectPath) === canonicalProject
    ));
  }

  show(id, projectPath) {
    const session = this.resume(id, projectPath);
    return {
      ...session,
      events: this.store.readEvents(id)
    };
  }

  async compact(id, projectPath, summarizer) {
    if (typeof summarizer !== 'function') {
      throw new TypeError('Session summarizer must be a function.');
    }
    const session = this.resume(id, projectPath);
    const events = this.store.readEvents(id);
    const summary = await summarizer(events, session);
    const event = {
      type: 'compaction.summary',
      timestamp: this.#timestamp(),
      data: { summary }
    };
    this.store.append(id, event);
    return event;
  }

  delete(id, projectPath) {
    const session = this.resume(id, projectPath);
    this.store.delete(id);
    return session;
  }

  #canonical(projectPath) {
    if (typeof projectPath !== 'string' || projectPath.length === 0) {
      throw new TypeError('Session project path is required.');
    }
    return this.realpath(projectPath);
  }

  #get(id) {
    const session = this.store.get(id);
    if (!session) throw notFound(id);
    return session;
  }

  #timestamp() {
    const value = this.now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError('Session clock must return a valid Date.');
    }
    return value.toISOString();
  }
}

export { JsonlSessionStore };
