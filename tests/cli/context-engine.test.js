import { describe, it, expect } from 'vitest';
import { ContextEngine } from '../../packages/agent-core/context/index.js';

describe('ContextEngine', () => {
  it('inspects project package.json and git status', () => {
    const engine = new ContextEngine(process.cwd());
    const info = engine.inspectProject();

    expect(info.cwd).toBe(process.cwd());
    expect(info.name).toBeDefined();
    expect(info.scripts).toBeDefined();
    expect(info.dependencies).toBeDefined();
  });

  it('tracks inspected and modified files', () => {
    const engine = new ContextEngine(process.cwd());
    engine.recordInspectedFile('package.json');
    engine.recordModifiedFile('src/App.jsx');

    expect(engine.inspectedFiles.has('package.json')).toBe(true);
    expect(engine.modifiedFiles.has('src/App.jsx')).toBe(true);
  });

  it('loads project instructions like AGENTS.md or COREZ.md', () => {
    const engine = new ContextEngine(process.cwd());
    const instructions = engine.loadInstructions();
    expect(Array.isArray(instructions)).toBe(true);
    expect(instructions.some(i => i.filename === 'AGENTS.md')).toBe(true);
  });
});
