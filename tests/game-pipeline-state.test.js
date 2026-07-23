import { describe, it, expect } from 'vitest';
import { PipelineJobTracker, PIPELINE_STAGES } from '../src/services/gamePipeline/pipelineTracker.js';

describe('Pipeline Job & State Tracker', () => {
  it('initializes job with default stage and progress', () => {
    const tracker = new PipelineJobTracker('job_test_1', 'Build arcade game');
    expect(tracker.job.jobId).toBe('job_test_1');
    expect(tracker.job.status).toBe(PIPELINE_STAGES.CLASSIFYING_INTENT);
    expect(tracker.job.progress).toBe(5);
  });

  it('transitions state and calculates asset progress dynamically', () => {
    const tracker = new PipelineJobTracker('job_test_2', 'Build knight platformer');
    tracker.transitionTo(PIPELINE_STAGES.PLANNING_GAME);
    expect(tracker.job.status).toBe(PIPELINE_STAGES.PLANNING_GAME);
    expect(tracker.job.progress).toBe(20);

    tracker.setManifest({
      assetManifest: {
        assets: [{ id: 'bg' }, { id: 'player' }]
      }
    });

    tracker.recordAssetCompleted('bg', { url: 'data:image/png;base64,...' });
    expect(tracker.job.assetsCompleted).toBe(1);
    expect(tracker.job.progress).toBe(50); // 40 + (1/2)*20 = 50

    tracker.recordAssetCompleted('player', { url: 'data:image/png;base64,...' });
    expect(tracker.job.assetsCompleted).toBe(2);
    expect(tracker.job.progress).toBe(60);
  });

  it('tracks repair attempts and enforces max limit', () => {
    const tracker = new PipelineJobTracker('job_test_3', 'Build puzzle game');
    expect(tracker.incrementRepairAttempt()).toBe(true); // 1 <= 3
    expect(tracker.incrementRepairAttempt()).toBe(true); // 2 <= 3
    expect(tracker.incrementRepairAttempt()).toBe(true); // 3 <= 3
    expect(tracker.incrementRepairAttempt()).toBe(false); // 4 > 3
  });

  it('notifies subscribers on state change', () => {
    const tracker = new PipelineJobTracker('job_test_4', 'Build shooter');
    let notifiedState = null;

    tracker.subscribe(state => {
      notifiedState = state;
    });

    tracker.transitionTo(PIPELINE_STAGES.SYNTHESIS_GAME, 'Synthesizing code');
    expect(notifiedState).not.toBeNull();
    expect(notifiedState.status).toBe(PIPELINE_STAGES.SYNTHESIS_GAME);
  });
});
