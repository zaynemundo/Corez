import { AgentRuntime, PermissionManager } from '../../../agent-core/index.js';

export async function handlePlanCommand(prompt, options = {}, ui) {
  if (!prompt || typeof prompt !== 'string') {
    ui.error('Plan command requires a prompt or task description.\nExample: corez plan "add Stripe subscriptions"');
    return;
  }

  ui.banner();
  ui.status('◐', `Analyzing codebase for plan: "${prompt}"...`);

  // Read-only permission manager
  const readOnlyPermissions = new PermissionManager({
    read: true,
    workspaceWrite: false,
    shell: false,
    network: false,
    dangerous: false
  });

  const runtime = new AgentRuntime({
    cwd: options.cwd || process.cwd(),
    permissionManager: readOnlyPermissions
  });

  const planPrompt = `ANALYZE THE CODEBASE AND CREATE AN IMPLEMENTATION PLAN ONLY. DO NOT MODIFY FILES.
Task: ${prompt}

Output format:
1. Architectural Overview
2. Relevant Files to Modify/Create
3. Step-by-Step Implementation Steps
4. Verification & Testing Strategy`;

  try {
    const result = await runtime.runTask(planPrompt, {
      signal: options.signal,
      onStatus: (st) => {
        if (st.type === 'tool_start') ui.status('◐', `Executing read tool: ${st.name}`);
      }
    });

    ui.divider();
    ui.success('CoreZ Implementation Plan Generated:');
    console.log(`\n${result.response}\n`);
    ui.info(`Inspected ${result.inspectedFiles.length} files during planning.`);
  } catch (err) {
    ui.error(err.message);
  }
}
