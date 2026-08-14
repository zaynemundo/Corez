import { describe, it, expect } from 'vitest';
import { ToolResultPruner } from '../packages/agent-core/tools/ToolResultPruner.js';
import { OutputSpillManager } from '../packages/agent-core/tools/OutputSpillManager.js';

describe('ToolResultPruner & OutputSpillManager', () => {
  it('leaves small outputs unchanged', () => {
    const pruner = new ToolResultPruner({ maxChars: 1000, maxLines: 50 });
    const output = 'line 1\nline 2\nline 3';
    const result = pruner.prune(output);

    expect(result.pruned).toBe(false);
    expect(result.result).toBe(output);
  });

  it('prunes outputs that exceed character or line limits with head and tail preserved', () => {
    const pruner = new ToolResultPruner({ maxChars: 200, maxLines: 10, headLines: 2, tailLines: 2 });
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: detailed output information`);
    const bigOutput = lines.join('\n');

    const res = pruner.prune(bigOutput, { toolName: 'exec_command' });

    expect(res.pruned).toBe(true);
    expect(typeof res.result).toBe('string');
    expect(res.result).toContain('Line 1:');
    expect(res.result).toContain('Line 2:');
    expect(res.result).toContain('Line 30:');
    expect(res.result).toContain('Truncated 26 lines');
  });

  it('prunes object-wrapped results like stdout correctly', () => {
    const pruner = new ToolResultPruner({ maxChars: 100, maxLines: 5, headLines: 1, tailLines: 1 });
    const lines = Array.from({ length: 20 }, (_, i) => `log ${i}`);
    const objResult = { exitCode: 0, stdout: lines.join('\n') };

    const res = pruner.prune(objResult, { toolName: 'exec_command' });

    expect(res.pruned).toBe(true);
    expect(res.result.exitCode).toBe(0);
    expect(res.result.stdout).toContain('log 0');
    expect(res.result.stdout).toContain('log 19');
    expect(res.result.stdout).toContain('Truncated 18 lines');
  });

  it('spills full output to memory or disk and provides spill reference', () => {
    const spillManager = new OutputSpillManager({ inMemory: true });
    const pruner = new ToolResultPruner({ maxChars: 50, maxLines: 5, headLines: 1, tailLines: 1, spillManager });

    const lines = Array.from({ length: 20 }, (_, i) => `item number ${i}`);
    const fullText = lines.join('\n');

    const res = pruner.prune(fullText, { toolName: 'grep_search', spillId: 'test_spill_1' });

    expect(res.pruned).toBe(true);
    expect(res.result).toContain('Full un-truncated output saved in spill buffer "test_spill_1"');

    // Retrieve from spill manager
    const retrieved = spillManager.getSpill('test_spill_1');
    expect(retrieved).toBe(fullText);

    // Read slice from spill manager
    const slice = spillManager.readSlice('test_spill_1', 1, 3);
    expect(slice.startLine).toBe(1);
    expect(slice.endLine).toBe(3);
    expect(slice.slice).toBe('item number 0\nitem number 1\nitem number 2');
  });
});
