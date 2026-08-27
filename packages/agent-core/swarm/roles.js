// CoreZ Swarm Role Catalog and Prompt Registry
//
// Defines system instructions, output contracts, and prompt builders for
// all specialist agents in the CoreZ Swarm DAG.

export const SWARM_ROLES = Object.freeze({
  ORCHESTRATOR: 'orchestrator',
  EXPLORER: 'explorer',
  ARCHITECT: 'architect',
  ENGINEER: 'engineer',
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DATABASE: 'database',
  AUTH: 'auth',
  DEBUGGER: 'debugger',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  SECURITY: 'security',
  INTEGRATION: 'integration',
  ART_DIRECTOR: 'art-director',
  ACCESSIBILITY: 'accessibility',
  PERFORMANCE: 'performance'
});

export const ROLE_DEFINITIONS = Object.freeze({
  [SWARM_ROLES.ORCHESTRATOR]: {
    title: 'Swarm Orchestrator',
    systemPrompt:
      'You are the CoreZ Swarm Orchestrator. You coordinate multi-agent execution graphs, enforce contracts, and route work.',
    outputSchema: { type: 'object' },
    defaultOwnedResources: ['context/orchestration.json']
  },
  [SWARM_ROLES.EXPLORER]: {
    title: 'Workspace Explorer',
    systemPrompt:
      'You are the CoreZ Workspace Explorer. Your role is read-only codebase discovery, inspecting project structure, dependencies, package configurations, and existing implementations. Provide concise, factual findings.',
    outputSchema: { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array' } } },
    defaultOwnedResources: ['context/workspace.json']
  },
  [SWARM_ROLES.ARCHITECT]: {
    title: 'System Architect',
    systemPrompt:
      'You are the CoreZ System Architect. Design modular architecture, state flow, interface boundaries, and dynamic subtask DAGs. Output structured implementation plans and component specifications.',
    outputSchema: { type: 'object', properties: { architecture: { type: 'string' }, subtasks: { type: 'array' } } },
    defaultOwnedResources: ['spec/architecture.json']
  },
  [SWARM_ROLES.ENGINEER]: {
    title: 'Software Engineer',
    systemPrompt:
      'You are the CoreZ Software Engineer. Implement clean, robust, production-grade code adhering strictly to specifications, type safety, and existing conventions.',
    outputSchema: { type: 'object', properties: { code: { type: 'string' }, filesModified: { type: 'array' } } },
    defaultOwnedResources: ['src/']
  },
  [SWARM_ROLES.FRONTEND]: {
    title: 'Frontend Engineer',
    systemPrompt:
      'You are the CoreZ Frontend Engineer. Build modern, responsive, accessible UI components with clean state management, keyboard accessibility, and delightful micro-interactions.',
    outputSchema: { type: 'object', properties: { components: { type: 'array' }, styles: { type: 'string' } } },
    defaultOwnedResources: ['src/components/']
  },
  [SWARM_ROLES.BACKEND]: {
    title: 'Backend Engineer',
    systemPrompt:
      'You are the CoreZ Backend Engineer. Build resilient API routes, data validation schemas, error handlers, and backend services adhering to security and performance standards.',
    outputSchema: { type: 'object', properties: { routes: { type: 'array' }, services: { type: 'array' } } },
    defaultOwnedResources: ['src/services/']
  },
  [SWARM_ROLES.DATABASE]: {
    title: 'Database Engineer',
    systemPrompt:
      'You are the CoreZ Database Engineer. Design normalized database schemas, queries, migration scripts, and indexing strategies for high throughput and consistency.',
    outputSchema: { type: 'object', properties: { schema: { type: 'string' }, migrations: { type: 'array' } } },
    defaultOwnedResources: ['src/db/']
  },
  [SWARM_ROLES.AUTH]: {
    title: 'Authentication & Identity Specialist',
    systemPrompt:
      'You are the CoreZ Auth Specialist. Implement secure authentication, authorization, session management, token validation, and password/credential policies.',
    outputSchema: { type: 'object', properties: { authHandlers: { type: 'array' }, securityRules: { type: 'array' } } },
    defaultOwnedResources: ['src/auth/']
  },
  [SWARM_ROLES.ART_DIRECTOR]: {
    title: 'Art Director',
    systemPrompt:
      'You are the CoreZ Art Director. Define cohesive color palettes, typography scales, spacing tokens, and visual direction. Avoid flat cards and cliché purple gradients.',
    outputSchema: { type: 'object', properties: { palette: { type: 'object' }, typography: { type: 'object' }, tokens: { type: 'string' } } },
    defaultOwnedResources: ['src/styles/tokens.css']
  },
  [SWARM_ROLES.ACCESSIBILITY]: {
    title: 'Accessibility Specialist',
    systemPrompt:
      'You are the CoreZ Accessibility Specialist. Enforce strict WCAG 2.2 AA standards, semantic HTML landmarks, focus management, high-contrast ratios, and screen reader ARIA contracts.',
    outputSchema: { type: 'object', properties: { audit: { type: 'array' }, fixes: { type: 'array' } } },
    defaultOwnedResources: ['artifacts/a11y-audit.json']
  },
  [SWARM_ROLES.PERFORMANCE]: {
    title: 'Performance Engineer',
    systemPrompt:
      'You are the CoreZ Performance Engineer. Optimize bundle size, critical rendering paths, lazy loading, memory footprints, and execution throughput.',
    outputSchema: { type: 'object', properties: { optimizations: { type: 'array' } } },
    defaultOwnedResources: ['artifacts/perf-audit.json']
  },
  [SWARM_ROLES.DEBUGGER]: {
    title: 'Debugger & Diagnostic Specialist',
    systemPrompt:
      'You are the CoreZ Debugger. Isolate root causes, analyze stack traces, inspect failing test diagnostics, and formulate precise surgical bug fixes.',
    outputSchema: { type: 'object', properties: { rootCause: { type: 'string' }, fix: { type: 'string' } } },
    defaultOwnedResources: ['artifacts/debug-report.json']
  },
  [SWARM_ROLES.TESTER]: {
    title: 'QA & Test Engineer',
    systemPrompt:
      'You are the CoreZ QA & Test Engineer. Write comprehensive automated unit, integration, and contract test suites with clear assertions and deterministic fixtures.',
    outputSchema: { type: 'object', properties: { testFiles: { type: 'array' }, coverageSummary: { type: 'string' } } },
    defaultOwnedResources: ['tests/']
  },
  [SWARM_ROLES.REVIEWER]: {
    title: 'Code Reviewer & Security Auditor',
    systemPrompt:
      'You are the CoreZ Code Reviewer. Review code diffs for security vulnerabilities, architectural integrity, edge cases, error handling, and performance regressions.',
    outputSchema: { type: 'object', properties: { approved: { type: 'boolean' }, comments: { type: 'array' } } },
    defaultOwnedResources: ['artifacts/review.json']
  },
  [SWARM_ROLES.SECURITY]: {
    title: 'Security Specialist',
    systemPrompt:
      'You are the CoreZ Security Specialist. Enforce input sanitization, CSRF/XSS protection, rate limiting, least-privilege permissions, and secret isolation.',
    outputSchema: { type: 'object', properties: { securityAudit: { type: 'array' } } },
    defaultOwnedResources: ['artifacts/security-audit.json']
  },
  [SWARM_ROLES.INTEGRATION]: {
    title: 'Integration Specialist',
    systemPrompt:
      'You are the CoreZ Integration Specialist. Assemble and harmonize multi-module implementations, wire endpoints to UI components, and guarantee end-to-end cohesion.',
    outputSchema: { type: 'object', properties: { integratedFiles: { type: 'array' }, bundle: { type: 'string' } } },
    defaultOwnedResources: ['dist/']
  }
});

export function getRoleDefinition(role) {
  return ROLE_DEFINITIONS[role] || {
    title: `${role} Agent`,
    systemPrompt: `You are the CoreZ ${role} specialist agent. Execute your assigned objective cleanly and professionally.`,
    outputSchema: {},
    defaultOwnedResources: []
  };
}

export function getRoleSystemPrompt(role) {
  return getRoleDefinition(role).systemPrompt;
}

/**
 * Builds the structured prompt for a specialist agent, injecting upstream dependency outputs
 * and self-correction retry feedback if present.
 */
export function formatRoleUserPrompt({ role, objective, userPrompt, upstreamContexts = [], retryContext = null }) {
  const sections = [];

  sections.push(`### Assignment for ${role}`);
  sections.push(`Objective: ${objective}`);
  sections.push(`Overall User Goal: ${userPrompt}`);

  if (Array.isArray(upstreamContexts) && upstreamContexts.length > 0) {
    sections.push(`\n### Upstream Context & Deliverables:`);
    for (const ctx of upstreamContexts) {
      const outputText = typeof ctx.output === 'object' ? JSON.stringify(ctx.output, null, 2) : String(ctx.output ?? '');
      sections.push(`--- Context from [${ctx.taskId}] (${ctx.role}) ---\n${outputText}`);
    }
  }

  if (retryContext && retryContext.attempt > 1) {
    sections.push(`\n### Self-Correction Retry (Attempt ${retryContext.attempt}/${retryContext.maxAttempts}):`);
    if (retryContext.lastError) {
      sections.push(`Previous execution failed with error: ${retryContext.lastError}`);
    }
    if (retryContext.verificationEvidence) {
      sections.push(`Verifier feedback: ${retryContext.verificationEvidence}`);
    }
    sections.push(`Please analyze the failure above and fix the issue in your revised output.`);
  }

  return sections.join('\n\n');
}
