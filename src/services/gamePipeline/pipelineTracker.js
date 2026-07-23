/**
 * Pipeline Job and Resumable State Tracker
 * Manages game generation job lifecycle, state transitions, progress tracking, and error recovery.
 */

export const PIPELINE_STAGES = {
  CLASSIFYING_INTENT: 'classifying_intent',
  PLANNING_GAME: 'planning_game',
  GENERATING_ASSETS: 'generating_assets',
  BUILDING_ENGINE: 'building_engine',
  PROCESSING_ASSETS: 'processing_assets',
  SYNTHESIS_GAME: 'synthesising_game',
  TESTING_GAME: 'testing_game',
  REPAIRING_GAME: 'repairing_game',
  READY: 'ready',
  FAILED: 'failed'
};

const STAGE_PROGRESS_MAP = {
  [PIPELINE_STAGES.CLASSIFYING_INTENT]: 5,
  [PIPELINE_STAGES.PLANNING_GAME]: 20,
  [PIPELINE_STAGES.GENERATING_ASSETS]: 40,
  [PIPELINE_STAGES.BUILDING_ENGINE]: 55,
  [PIPELINE_STAGES.PROCESSING_ASSETS]: 70,
  [PIPELINE_STAGES.SYNTHESIS_GAME]: 85,
  [PIPELINE_STAGES.TESTING_GAME]: 92,
  [PIPELINE_STAGES.REPAIRING_GAME]: 95,
  [PIPELINE_STAGES.READY]: 100,
  [PIPELINE_STAGES.FAILED]: 0
};

export class PipelineJobTracker {
  constructor(jobId, prompt) {
    this.job = {
      jobId: jobId || `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt,
      status: PIPELINE_STAGES.CLASSIFYING_INTENT,
      progress: STAGE_PROGRESS_MAP[PIPELINE_STAGES.CLASSIFYING_INTENT],
      currentStage: 'Classifying intent',
      assetsCompleted: 0,
      assetsTotal: 0,
      manifest: null,
      assets: {},
      engineSkeleton: null,
      synthesizedHtml: null,
      errors: [],
      repairAttempts: 0,
      maxRepairAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.job.updatedAt = new Date().toISOString();
    this.listeners.forEach(fn => {
      try { fn({ ...this.job }); } catch {
        // Ignored listener error
      }
    });
  }

  transitionTo(stage, stageDescription = '') {
    this.job.status = stage;
    this.job.currentStage = stageDescription || stage;
    this.job.progress = STAGE_PROGRESS_MAP[stage] || this.job.progress;
    this.notify();
  }

  setManifest(manifest) {
    this.job.manifest = manifest;
    if (manifest && manifest.assetManifest && Array.isArray(manifest.assetManifest.assets)) {
      this.job.assetsTotal = manifest.assetManifest.assets.length;
    }
    this.notify();
  }

  recordAssetCompleted(assetId, assetData) {
    this.job.assets[assetId] = assetData;
    this.job.assetsCompleted = Object.keys(this.job.assets).length;
    if (this.job.assetsTotal > 0) {
      const assetProgressPart = (this.job.assetsCompleted / this.job.assetsTotal) * 20;
      this.job.progress = 40 + Math.round(assetProgressPart);
    }
    this.notify();
  }

  addError(errMessage) {
    this.job.errors.push({
      message: errMessage,
      stage: this.job.status,
      timestamp: new Date().toISOString()
    });
    this.notify();
  }

  incrementRepairAttempt() {
    this.job.repairAttempts += 1;
    this.notify();
    return this.job.repairAttempts <= this.job.maxRepairAttempts;
  }

  fail(reason) {
    this.addError(reason);
    this.transitionTo(PIPELINE_STAGES.FAILED, `Job Failed: ${reason}`);
  }

  complete(finalHtml) {
    this.job.synthesizedHtml = finalHtml;
    this.transitionTo(PIPELINE_STAGES.READY, 'Game generation ready');
  }

  toJSON() {
    return { ...this.job };
  }
}
