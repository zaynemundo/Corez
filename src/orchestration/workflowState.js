/**
 * CoreZ Workflow State Machine
 * Manages explicit execution stages, stage metadata, review gates, and verification evidence enforcement.
 */

export const WORKFLOW_STAGES = {
  RECEIVED: 'RECEIVED',
  INTENT_CLASSIFIED: 'INTENT_CLASSIFIED',
  SKILLS_RESOLVED: 'SKILLS_RESOLVED',
  BRAINSTORMING: 'BRAINSTORMING',
  SPEC_READY: 'SPEC_READY',
  PLANNING: 'PLANNING',
  PLAN_READY: 'PLAN_READY',
  IMPLEMENTING: 'IMPLEMENTING',
  REVIEWING: 'REVIEWING',
  VERIFYING: 'VERIFYING',
  REPAIRING: 'REPAIRING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
};

export class WorkflowState {
  constructor(initialData = {}) {
    this.id = initialData.id || `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentStage = WORKFLOW_STAGES.RECEIVED;
    this.intent = initialData.intent || null;
    this.resolvedSkills = [];
    this.stages = {};
    this.verificationRecords = [];
    this.reviewFindings = [];
    this.startedAt = Date.now();
    this.completedAt = null;

    for (const stage of Object.values(WORKFLOW_STAGES)) {
      this.stages[stage] = {
        status: 'PENDING',
        input: null,
        output: null,
        startedAt: null,
        completedAt: null,
        agent: null,
        skill: null,
        attempt: 0,
        error: null
      };
    }

    this.startStage(WORKFLOW_STAGES.RECEIVED, { userPrompt: initialData.prompt });
  }

  startStage(stage, input = null, options = {}) {
    if (!WORKFLOW_STAGES[stage]) {
      throw new Error(`Invalid stage: ${stage}`);
    }

    this.currentStage = stage;
    const stageObj = this.stages[stage];
    stageObj.status = 'IN_PROGRESS';
    stageObj.input = input;
    stageObj.startedAt = Date.now();
    stageObj.attempt += 1;
    stageObj.agent = options.agent || null;
    stageObj.skill = options.skill || null;
  }

  completeStage(stage, output = null) {
    const stageObj = this.stages[stage];
    if (!stageObj) return;

    stageObj.status = 'COMPLETED';
    stageObj.output = output;
    stageObj.completedAt = Date.now();
  }

  failStage(stage, error) {
    const stageObj = this.stages[stage];
    if (!stageObj) return;

    stageObj.status = 'FAILED';
    stageObj.error = error;
    stageObj.completedAt = Date.now();
    this.currentStage = WORKFLOW_STAGES.FAILED;
  }

  addVerificationRecord(record) {
    if (!record || typeof record !== 'object') return;
    const formatted = {
      command: record.command || 'runtime-check',
      exitCode: typeof record.exitCode === 'number' ? record.exitCode : 0,
      passed: record.passed || 0,
      failed: record.failed || 0,
      timestamp: record.timestamp || new Date().toISOString()
    };
    this.verificationRecords.push(formatted);
    return formatted;
  }

  addReviewFinding(finding) {
    if (!finding || typeof finding !== 'object') return;
    const formatted = {
      severity: finding.severity || 'info', // 'critical' | 'important' | 'info'
      category: finding.category || 'code-quality', // 'spec-compliance' | 'code-quality'
      message: finding.message || '',
      file: finding.file || null
    };
    this.reviewFindings.push(formatted);
    return formatted;
  }

  hasCriticalReviewFindings() {
    return this.reviewFindings.some(f => f.severity === 'critical');
  }

  hasVerificationEvidence() {
    return this.verificationRecords.length > 0 && this.verificationRecords.some(r => r.exitCode === 0);
  }

  transitionToComplete() {
    if (!this.hasVerificationEvidence()) {
      throw new Error('Verification Gate Failure: Cannot transition workflow to COMPLETE without fresh verification evidence.');
    }
    this.completeStage(WORKFLOW_STAGES.VERIFYING);
    this.currentStage = WORKFLOW_STAGES.COMPLETE;
    this.completedAt = Date.now();
  }

  getTrace() {
    const activeSkills = this.resolvedSkills.map(s => s.name || s.id);
    const stageSummaries = Object.entries(this.stages)
      .filter(([_, data]) => data.status !== 'PENDING')
      .map(([stage, data]) => ({
        stage,
        status: data.status,
        agent: data.agent,
        skill: data.skill,
        durationMs: data.completedAt && data.startedAt ? data.completedAt - data.startedAt : null
      }));

    return {
      workflowId: this.id,
      intent: this.intent,
      currentStage: this.currentStage,
      resolvedSkills: activeSkills,
      stages: stageSummaries,
      verificationEvidenceCount: this.verificationRecords.length,
      hasCriticalFindings: this.hasCriticalReviewFindings()
    };
  }
}
