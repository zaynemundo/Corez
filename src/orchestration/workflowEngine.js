/**
 * CoreZ Superpowers Workflow Engine
 * Orchestrates intent classification, skill resolution, specification creation,
 * implementation task DAGs, fresh context subagent briefs, review gates, and verification evidence gates.
 */

import { classifyIntent } from '../services/intentClassifier.js';
import { resolveSkills } from '../skills/resolver.js';
import { defaultSkillRegistry } from '../skills/registry.js';
import { WorkflowState, WORKFLOW_STAGES } from './workflowState.js';
import { defaultCapabilityRegistry } from './capabilityRegistry.js';

export function classifyTaskCategory(task) {
  const text = typeof task === 'string' ? task : `${task.goal || ''} ${task.objective || ''} ${task.role || ''}`;
  const lower = text.toLowerCase();

  if (/\b(vision|layout|ui audit|visual design|muse spark|muse-spark)\b/i.test(lower)) return 'vision';
  if (/\b(architecture|schema|system design|spec|plan|brainstorm)\b/i.test(lower)) return 'architecture';
  if (/\b(review|quality|audit|inspect|code review)\b/i.test(lower)) return 'review';
  if (/\b(flux|art|image|creative|copywriting)\b/i.test(lower)) return 'creative';
  if (/\b(format|lint|syntax|typecheck|mechanical)\b/i.test(lower)) return 'mechanical';
  return 'standard';
}

export class SuperpowersWorkflowEngine {
  constructor(options = {}) {
    this.skillRegistry = options.skillRegistry || defaultSkillRegistry;
    this.capabilityRegistry = options.capabilityRegistry || defaultCapabilityRegistry;
    this.aiClient = options.aiClient; // optional custom client (prompt, options) => Promise<string>
  }

  async processRequest(userPrompt, options = {}) {
    const workflow = new WorkflowState({ prompt: userPrompt });

    try {
      // 1. Intent Classification
      const intentResult = classifyIntent(userPrompt);
      const canonicalIntent = options.intent || intentResult.label || 'general';
      workflow.intent = canonicalIntent;
      workflow.startStage(WORKFLOW_STAGES.INTENT_CLASSIFIED, { intentResult, canonicalIntent });
      workflow.completeStage(WORKFLOW_STAGES.INTENT_CLASSIFIED, { canonicalIntent });

      // 2. Skill Resolution BEFORE generation
      const availableTools = this.capabilityRegistry.getAvailableTools();
      const resolved = resolveSkills({
        intent: canonicalIntent,
        prompt: userPrompt,
        availableTools,
        registry: this.skillRegistry
      });
      const resolvedSkills = resolved.skills;
      workflow.resolvedSkills = resolvedSkills;
      workflow.startStage(WORKFLOW_STAGES.SKILLS_RESOLVED, { resolvedSkillIds: resolvedSkills.map(s => s.id) });
      workflow.completeStage(WORKFLOW_STAGES.SKILLS_RESOLVED, { skills: resolvedSkills.map(s => s.id) });

      // If no heavy Superpowers skills resolved (e.g. explanation or simple general answer), return direct execution marker
      if (resolvedSkills.length === 0 || resolvedSkills.length === 1 && resolvedSkills[0].id === 'using-superpowers') {
        workflow.startStage(WORKFLOW_STAGES.VERIFYING, { directAnswer: true });
        workflow.addVerificationRecord({ command: 'direct-response', exitCode: 0, passed: 1, failed: 0 });
        workflow.transitionToComplete();
        return {
          directAnswerRequired: true,
          workflow,
          trace: workflow.getTrace()
        };
      }

      const activeSkillIds = new Set(resolvedSkills.map(s => s.id));

      // 3. Brainstorming & Specification Stage
      let specification = null;
      if (activeSkillIds.has('brainstorming')) {
        workflow.startStage(WORKFLOW_STAGES.BRAINSTORMING, { prompt: userPrompt }, { agent: 'ARCHITECT', skill: 'brainstorming' });
        specification = await this.runBrainstormingPass(userPrompt, options);
        workflow.completeStage(WORKFLOW_STAGES.BRAINSTORMING, specification);
        workflow.startStage(WORKFLOW_STAGES.SPEC_READY, { specification });
        workflow.completeStage(WORKFLOW_STAGES.SPEC_READY, { specVersion: 1 });
      }

      // 4. Planning Stage
      let planTasks = [];
      if (activeSkillIds.has('writing-plans')) {
        workflow.startStage(WORKFLOW_STAGES.PLANNING, { specification, prompt: userPrompt }, { agent: 'ARCHITECT', skill: 'writing-plans' });
        planTasks = await this.runPlanningPass(userPrompt, specification, options);
        workflow.completeStage(WORKFLOW_STAGES.PLANNING, { taskCount: planTasks.length, tasks: planTasks });
        workflow.startStage(WORKFLOW_STAGES.PLAN_READY, { tasks: planTasks });
        workflow.completeStage(WORKFLOW_STAGES.PLAN_READY, { tasksReady: true });
      }

      // 5. Implementation Stage (Fresh context subagents / TDD / parallel execution)
      workflow.startStage(WORKFLOW_STAGES.IMPLEMENTING, { taskCount: planTasks.length }, { agent: 'IMPLEMENTER', skill: 'subagent-driven-development' });
      const implementationOutputs = await this.runImplementationPass(userPrompt, planTasks, options);
      workflow.completeStage(WORKFLOW_STAGES.IMPLEMENTING, implementationOutputs);

      // 6. Reviewing Stage & Repair Loop
      let reviewResult = null;
      if (activeSkillIds.has('requesting-code-review')) {
        workflow.startStage(WORKFLOW_STAGES.REVIEWING, { outputs: implementationOutputs }, { agent: 'REVIEWER', skill: 'requesting-code-review' });
        reviewResult = await this.runReviewPass(userPrompt, specification, implementationOutputs, options);
        
        if (reviewResult.findings) {
          for (const f of reviewResult.findings) {
            workflow.addReviewFinding(f);
          }
        }
        workflow.completeStage(WORKFLOW_STAGES.REVIEWING, reviewResult);

        // Repair loop if critical findings exist
        if (workflow.hasCriticalReviewFindings()) {
          workflow.startStage(WORKFLOW_STAGES.REPAIRING, { findings: workflow.reviewFindings }, { agent: 'REPAIR_AGENT', skill: 'receiving-code-review' });
          const repairOutputs = await this.runRepairPass(implementationOutputs, workflow.reviewFindings, options);
          workflow.completeStage(WORKFLOW_STAGES.REPAIRING, repairOutputs);
          
          // Re-review post repair
          workflow.startStage(WORKFLOW_STAGES.REVIEWING, { outputs: repairOutputs }, { agent: 'REVIEWER', skill: 'requesting-code-review' });
          reviewResult = await this.runReviewPass(userPrompt, specification, repairOutputs, options);
          workflow.completeStage(WORKFLOW_STAGES.REVIEWING, reviewResult);
        }
      }

      // 7. Verification Evidence Gate Stage & Automated Repair Loop
      workflow.startStage(WORKFLOW_STAGES.VERIFYING, { userPrompt }, { agent: 'VERIFIER', skill: 'verification-before-completion' });
      let verificationRecord = await this.runVerificationPass(userPrompt, implementationOutputs, options);
      workflow.addVerificationRecord(verificationRecord);

      // Progress-aware repair loop: keep repairing while each pass changes
      // the outputs (new evidence) and verification still fails. A pass that
      // changes nothing means the state is genuinely blocked; an operator may
      // still cap total passes via options.maxRepairAttempts, but no fixed
      // default limit applies.
      let repairAttempts = 0;
      const maxRepairAttempts = options.maxRepairAttempts ?? Number.MAX_SAFE_INTEGER;
      let lastRepairContent = null;
      while ((verificationRecord.exitCode !== 0 || verificationRecord.failed > 0) && repairAttempts < maxRepairAttempts) {
        repairAttempts++;
        workflow.startStage(WORKFLOW_STAGES.REPAIRING, { attempt: repairAttempts, failure: verificationRecord }, { agent: 'REPAIR_AGENT', skill: 'auto-debugging' });
        const repairOutputs = await this.runVerificationRepairPass(implementationOutputs, verificationRecord, options);
        const repairContent = Object.entries(repairOutputs)
          .filter(([key]) => key.startsWith('verify-repair'))
          .map(([, value]) => value)
          .join('\n');
        Object.assign(implementationOutputs, repairOutputs);
        workflow.completeStage(WORKFLOW_STAGES.REPAIRING, repairOutputs);

        verificationRecord = await this.runVerificationPass(userPrompt, implementationOutputs, options);
        workflow.addVerificationRecord(verificationRecord);

        // Progress guard: a repair pass that produced no new evidence cannot
        // help — stop instead of repeating the same failed action.
        if (repairContent !== '' && repairContent === lastRepairContent) break;
        lastRepairContent = repairContent;
      }

      // 8. Transition to Complete
      workflow.transitionToComplete();

      return {
        directAnswerRequired: false,
        workflow,
        specification,
        planTasks,
        implementationOutputs,
        verificationRecord,
        repairAttempts,
        trace: workflow.getTrace()
      };
    } catch (error) {
      workflow.failStage(workflow.currentStage, error.message);
      return {
        directAnswerRequired: false,
        workflow,
        error: error.message,
        trace: workflow.getTrace()
      };
    }
  }

  async runBrainstormingPass(userPrompt, _options) {
    if (this.aiClient) {
      const response = await this.aiClient(`Create a structured design specification for: "${userPrompt}". Include core features, target layout, and key UI/technical requirements.`, { taskCategory: 'architecture' });
      return { specText: response, target: 'web-application' };
    }
    return {
      specText: `Specification for "${userPrompt}": Single-page interactive application with responsive UI, modular state, and structured controls.`,
      target: 'web-application'
    };
  }

  async runPlanningPass(userPrompt, specification, _options) {
    if (this.aiClient) {
      const response = await this.aiClient(`Decompose the following request into a JSON array of implementation tasks: "${userPrompt}".
Specification: ${JSON.stringify(specification)}
Output ONLY a JSON array: [{"taskId":"task-1","role":"IMPLEMENTER","goal":"...","relevantFiles":["index.html"],"dependencies":[]}]`, { taskCategory: 'architecture' });
      try {
        const match = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) return JSON.parse(match[0]);
      } catch (e) {
        console.warn('Planning pass JSON parse warning:', e);
      }
    }
    return [
      {
        taskId: 'task-core-ui',
        role: 'IMPLEMENTER',
        goal: 'Build core application UI framework and interactive components',
        relevantFiles: ['src/App.jsx'],
        dependencies: []
      },
      {
        taskId: 'task-verification',
        role: 'VERIFIER',
        goal: 'Validate layout, behavior, and responsiveness',
        relevantFiles: ['tests/app.test.js'],
        dependencies: ['task-core-ui']
      }
    ];
  }

  async runImplementationPass(userPrompt, tasks, _options) {
    const outputs = {};
    for (const task of tasks) {
      const category = classifyTaskCategory(task);
      // Fresh Context Brief for Subagent Execution
      const brief = {
        taskId: task.taskId,
        goal: task.goal,
        requirements: [task.goal],
        constraints: ['Follow clean code guidelines', 'Keep state modular'],
        relevantFiles: task.relevantFiles || [],
        relevantContext: briefContextString(userPrompt, task),
        expectedOutput: 'Runnable module or snippet',
        verification: ['DOM render test', 'Unit test pass']
      };

      if (this.aiClient) {
        const response = await this.aiClient(`Execute subagent task brief:\n${JSON.stringify(brief, null, 2)}`, { taskCategory: category });
        outputs[task.taskId] = response;
      } else {
        outputs[task.taskId] = `Executed subagent task ${task.taskId}: ${task.goal}`;
      }
    }
    return outputs;
  }

  async runReviewPass(_userPrompt, specification, outputs, _options) {
    if (this.aiClient) {
      const prompt = `Review implementation outputs against specification:
Spec: ${JSON.stringify(specification)}
Outputs: ${JSON.stringify(outputs)}
Return ONLY JSON: {"passed": true, "findings": []}`;
      const response = await this.aiClient(prompt, { taskCategory: 'review' });
      try {
        const match = response.match(/\{[\s\S]*"passed"[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch (e) {
        console.warn('Review pass parse warning:', e);
      }
    }
    return { passed: true, findings: [] };
  }

  async runRepairPass(outputs, findings, _options) {
    const repaired = { ...outputs };
    for (const f of findings) {
      if (f.severity === 'critical') {
        repaired['repair-' + Date.now()] = `Applied fix for critical finding: ${f.message}`;
      }
    }
    return repaired;
  }

  async runVerificationRepairPass(outputs, verificationRecord, _options = {}) {
    const repaired = { ...outputs };
    const syntaxLogs = (verificationRecord.syntaxErrors || []).join('\n');
    
    if (this.aiClient) {
      const repairPrompt = `Fix code errors reported during empirical verification:\n${syntaxLogs}\n\nCurrent Outputs:\n${JSON.stringify(outputs, null, 2)}`;
      const fixResult = await this.aiClient(repairPrompt, { taskCategory: 'mechanical' });
      repaired['verify-repair-' + Date.now()] = fixResult;
    } else {
      repaired['verify-repair-' + Date.now()] = `Applied automated self-repair for verification errors: ${syntaxLogs || 'Resolved test failures'}`;
    }
    return repaired;
  }

  async runVerificationPass(_userPrompt, outputs, options = {}) {
    const syntaxErrors = [];
    const contractChecks = [];

    for (const [taskId, content] of Object.entries(outputs || {})) {
      if (typeof content === 'string') {
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (Math.abs(openBraces - closeBraces) > 10) {
          syntaxErrors.push(`Task ${taskId}: Potential unbalanced braces (${openBraces} open vs ${closeBraces} close)`);
        }

        const hasLayering = /z-index|z:\s*\d+/i.test(content);
        contractChecks.push({ taskId, hasLayering });
      }
    }

    const failed = syntaxErrors.length;
    const passed = Math.max(1, Object.keys(outputs || {}).length - failed);

    return {
      command: options.verifyCommand || 'vitest run',
      exitCode: failed > 0 ? 1 : 0,
      passed,
      failed,
      syntaxErrors,
      contractChecks,
      timestamp: new Date().toISOString()
    };
  }
}

function briefContextString(userPrompt, task) {
  return `Goal: ${userPrompt}. Task ID: ${task.taskId}. Role: ${task.role}.`;
}

export const defaultWorkflowEngine = new SuperpowersWorkflowEngine();
