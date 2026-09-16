import { describe, it, expect } from 'vitest';
import { buildPhaseLabel, BUILD_PHASE_LABELS } from '../src/utils/buildPhaseLabel.js';

describe('build phase labels', () => {
  it('labels every phase the harness emits', () => {
    for (const phase of [
      'planning',
      'swarm-planning',
      'building',
      'continuing',
      'verifying',
      'repairing',
      'reviewing',
      'resuming',
      'waiting-for-build',
      'retrying',
    ]) {
      const label = buildPhaseLabel(phase);
      expect(label, phase).toBeTruthy();
      expect(label.length).toBeLessThanOrEqual(48);
      expect(label).not.toContain('_');
    }
  });

  it('never renders an unknown phase or a raw identifier', () => {
    expect(buildPhaseLabel('teleporting')).toBe('');
    expect(buildPhaseLabel(undefined)).toBe('');
    expect(buildPhaseLabel(null)).toBe('');
    expect(buildPhaseLabel(42)).toBe('');
    // Every label is a human sentence fragment, not a phase key.
    for (const [phase, label] of Object.entries(BUILD_PHASE_LABELS)) {
      expect(label.toLowerCase()).not.toBe(phase.toLowerCase());
    }
  });

  it('explains that a resumed build is continuing, not restarting from zero', () => {
    expect(buildPhaseLabel('resuming')).toMatch(/resuming/i);
    expect(buildPhaseLabel('repairing')).toMatch(/fixing/i);
  });
});
