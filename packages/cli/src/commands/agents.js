import { SWARM_ROLES } from '../../../agent-core/index.js';

export async function handleAgentsCommand(args, _options = {}, ui) {
  ui.banner();
  console.log('Configured CoreZ Agent Roles & Swarm Architecture:\n');

  const agentDescriptions = [
    { role: SWARM_ROLES.ORCHESTRATOR, desc: 'Lead architect decomposing tasks into execution DAGs' },
    { role: SWARM_ROLES.EXPLORER, desc: 'Inspects project structure, files, dependencies, and git state' },
    { role: SWARM_ROLES.ARCHITECT, desc: 'Designs software architecture, contracts, and module boundaries' },
    { role: SWARM_ROLES.FRONTEND, desc: 'Crafts client UIs, components, responsive layouts, and styles' },
    { role: SWARM_ROLES.BACKEND, desc: 'Implements server endpoints, database schemas, and business logic' },
    { role: SWARM_ROLES.DEBUGGER, desc: 'Diagnoses runtime errors, stack traces, and failing assertions' },
    { role: SWARM_ROLES.TESTER, desc: 'Runs vitest/jest test suites and builds verification specs' },
    { role: SWARM_ROLES.REVIEWER, desc: 'Audits diffs for security, correctness, and maintainability' },
    { role: SWARM_ROLES.SECURITY, desc: 'Enforces OWASP standards, permissions, and input validation' },
    { role: SWARM_ROLES.INTEGRATION, desc: 'Manages multi-agent workflow state and git branch integration' }
  ];

  for (const a of agentDescriptions) {
    console.log(`- ${a.role.toUpperCase()}`);
    console.log(`  Role Objective: ${a.desc}\n`);
  }
}
