/**
 * Per-file lifecycle and relevant-file evidence tracking for the gate.
 *
 * The lifecycle map records, per file path, whether the file existed before
 * the task started, when it was first/last read successfully, when writes
 * happened, and whether the final diff covered it. Read-before-write is
 * enforced from this evidence at tool-execution time.
 */

import fs from 'node:fs';

export function createFileLifecycle(filePath) {
  return {
    path: filePath,
    existedBeforeTask: null,
    firstReadAt: null,
    lastReadAt: null,
    firstWriteAttemptAt: null,
    firstSuccessfulWriteAt: null,
    lastSuccessfulWriteAt: null,
    finalDiffReviewedAt: null,
    readSucceeded: false,
    unreadModified: false
  };
}

export function ensureFileLifecycle(gate, filePath) {
  if (!gate || !gate.fileLifecycles) return null;
  let entry = gate.fileLifecycles.get(filePath);
  if (!entry) {
    entry = createFileLifecycle(filePath);
    gate.fileLifecycles.set(filePath, entry);
  }
  return entry;
}

export function ensureRelevantFile(gate, filePath, fields = {}) {
  if (!gate || !gate.relevantFiles) return null;
  const existing = gate.relevantFiles.get(filePath);
  const entry = {
    path: filePath,
    relevanceReason: fields.relevanceReason
      || (fields.readSuccessfully
        ? 'Read by the agent while working on the task'
        : 'Written by the agent while working on the task'),
    discoveredBy: existing?.discoveredBy || fields.discoveredBy || 'model',
    readSuccessfully: fields.readSuccessfully ?? existing?.readSuccessfully ?? false,
    modified: fields.modified ?? existing?.modified ?? false,
    testedBy: fields.testedBy ?? existing?.testedBy ?? null
  };
  gate.relevantFiles.set(filePath, entry);
  return entry;
}

/**
 * Record a successful read. Failed reads must never reach this function.
 * Reading AFTER a write that happened without a prior read never satisfies
 * read-before-write: the file stays permanently flagged `unreadModified`.
 */
export function recordFileRead(gate, filePath) {
  const entry = ensureFileLifecycle(gate, filePath);
  if (!entry) return null;
  if (entry.unreadModified) return entry;
  const now = Date.now();
  if (entry.firstReadAt === null) entry.firstReadAt = now;
  entry.lastReadAt = now;
  entry.readSucceeded = true;
  return entry;
}

/**
 * Record a successful write. `existedBeforeTask` may be supplied by the
 * caller (captured before the write); otherwise it falls back to the current
 * filesystem state, which is only accurate when no write occurred yet.
 * Failed or rejected writes must never reach this function.
 */
export function recordFileWritten(gate, filePath, existedBeforeTask) {
  const entry = ensureFileLifecycle(gate, filePath);
  if (!entry) return null;
  if (entry.existedBeforeTask === null) {
    entry.existedBeforeTask = existedBeforeTask !== undefined ? existedBeforeTask : fs.existsSync(filePath);
  }
  const now = Date.now();
  if (entry.firstWriteAttemptAt === null) entry.firstWriteAttemptAt = now;
  if (entry.firstSuccessfulWriteAt === null) entry.firstSuccessfulWriteAt = now;
  entry.lastSuccessfulWriteAt = now;
  if (entry.existedBeforeTask === true && entry.readSucceeded !== true) {
    entry.unreadModified = true;
  }
  return entry;
}

/**
 * Mark every modified file as covered by the latest diff inspection.
 */
export function recordDiffReviewed(gate) {
  if (!gate || !gate.fileLifecycles) return;
  const now = Date.now();
  for (const entry of gate.fileLifecycles.values()) {
    if (entry.lastSuccessfulWriteAt !== null && entry.finalDiffReviewedAt === null) {
      entry.finalDiffReviewedAt = now;
    }
  }
}

/**
 * Read-before-write enforcement used by write_file/edit_file at execution
 * time. New files (did not exist before the task) may be created without a
 * read. Existing files must have been read successfully first.
 */
export function checkReadBeforeWrite(gate, filePath) {
  if (!gate) return { ok: true };
  const entry = ensureFileLifecycle(gate, filePath);
  if (!entry) return { ok: true };
  if (entry.existedBeforeTask === null) {
    entry.existedBeforeTask = fs.existsSync(filePath);
  }
  if (entry.existedBeforeTask !== true) return { ok: true };
  if (entry.readSucceeded === true) return { ok: true };
  return {
    ok: false,
    code: 'READ_BEFORE_WRITE',
    error: 'read-before-write',
    message: `File must be read successfully before modification. Read the file first: ${filePath}`
  };
}
