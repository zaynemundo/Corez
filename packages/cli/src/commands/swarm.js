import { GenericSwarmOrchestrator, ModelProviderRouter } from '../../../agent-core/index.js';

export async function handleSwarmCommand(prompt, options = {}, ui) {
  if (!prompt || typeof prompt !== 'string') {
    ui.error('Swarm command requires a prompt or task description.\nExample: corez swarm "build a browser game"');
    return false;
  }

  ui.banner();
  ui.status('◐', `Initializing Multi-Agent Swarm Orchestrator for: "${prompt}"...`);

  const orchestrator = new GenericSwarmOrchestrator({
    providerRouter: new ModelProviderRouter({ defaultModel: 'deepseek-v4-pro' })
  });

  try {
    const result = await orchestrator.executeSwarmJob(prompt, {
      signal: options.signal,
      onStatus: (st) => {
        if (st.step === 'agent_start') {
          ui.status('●', `${st.role.toUpperCase()}: ${st.objective}`);
        } else if (st.step === 'agent_complete') {
          ui.status('✓', `${st.role.toUpperCase()} complete`);
        }
      }
    });

    ui.divider();
    if (result.completed === false) {
      ui.error(`Swarm execution incomplete: ${result.failedTasks?.length || 0} task(s) failed, ${result.incompleteTasks?.length || 0} incomplete.`);
      return false;
    }
    ui.success('CoreZ Swarm Execution Completed Successfully!');
    ui.status('✓', `Total Agent Tasks Executed: ${result.tasksCount}`);
    return true;
  } catch (err) {
    ui.error(err.message);
    return false;
  }
}
