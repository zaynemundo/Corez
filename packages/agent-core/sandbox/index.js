import fs from 'node:fs';
import path from 'node:path';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function outsideWorkspace(root, inputPath) {
  return new CorezError(
    ERROR_CODES.PATH_OUTSIDE_WORKSPACE,
    'Path is outside the workspace.',
    { root, inputPath }
  );
}

function findExistingAncestor(candidate) {
  let ancestor = candidate;
  const unresolvedSegments = [];

  while (true) {
    try {
      fs.lstatSync(ancestor);
      return { ancestor, unresolvedSegments };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      throw new Error(`No existing ancestor for path: ${candidate}`);
    }
    unresolvedSegments.unshift(path.basename(ancestor));
    ancestor = parent;
  }
}

export class WorkspaceSandbox {
  static create(root) {
    return new WorkspaceSandbox(fs.realpathSync.native(root));
  }

  constructor(root) {
    this.root = root;
  }

  resolveExisting(inputPath) {
    const candidate = this.#resolveLexical(inputPath);
    const canonicalPath = fs.realpathSync.native(candidate);
    if (!isWithin(this.root, canonicalPath)) {
      throw outsideWorkspace(this.root, inputPath);
    }
    return canonicalPath;
  }

  resolveForCreate(inputPath) {
    const candidate = this.#resolveLexical(inputPath);
    const { ancestor, unresolvedSegments } = findExistingAncestor(candidate);
    const canonicalAncestor = fs.realpathSync.native(ancestor);
    if (!isWithin(this.root, canonicalAncestor)) {
      throw outsideWorkspace(this.root, inputPath);
    }
    return path.join(canonicalAncestor, ...unresolvedSegments);
  }

  #resolveLexical(inputPath) {
    const candidate = path.resolve(this.root, inputPath);
    if (!isWithin(this.root, candidate)) {
      throw outsideWorkspace(this.root, inputPath);
    }
    return candidate;
  }
}
