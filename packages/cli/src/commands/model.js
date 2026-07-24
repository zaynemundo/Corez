import { ModelProviderRouter, loadCorezConfig, saveCorezConfig } from '../../../agent-core/index.js';

export async function handleModelCommand(args = [], options = {}, ui) {
  const cwd = options.cwd || process.cwd();
  const router = new ModelProviderRouter();
  const availableModels = router.getAvailableModels();
  const currentConfig = loadCorezConfig(cwd);

  const targetModelArg = Array.isArray(args) ? args[0] : args;

  // 1. If a model ID or set command is supplied, switch model
  if (targetModelArg) {
    const requestedId = targetModelArg.replace(/^set\s+/i, '').trim().toLowerCase();
    const matched = availableModels.find(m => m.id.toLowerCase() === requestedId);

    if (!matched) {
      ui.banner();
      ui.error(`Invalid model ID "${targetModelArg}".`);
      console.log('\nAvailable model IDs:');
      availableModels.forEach(m => console.log(`  - ${m.id}`));
      console.log('');
      return { success: false, model: currentConfig.model };
    }

    // Save updated model configuration
    saveCorezConfig({ model: matched.id }, cwd);

    ui.banner();
    ui.success(`Active AI model set to: ${matched.name} (${matched.id})`);
    ui.status('✓', `Saved to workspace configuration (.corez/config.json)`);
    console.log('');
    return { success: true, model: matched.id };
  }

  // 2. Otherwise display active model and options
  ui.banner();
  console.log(`Active Model: \x1b[36m${currentConfig.model}\x1b[0m\n`);
  console.log('Available CoreZ AI Models:\n');

  for (const m of availableModels) {
    const isCurrent = m.id === currentConfig.model ? ' \x1b[32m[Active]\x1b[0m' : '';
    console.log(`- ${m.id} (${m.name})${isCurrent}`);
    console.log(`  Provider: ${m.provider} | Role: ${m.role}\n`);
  }

  console.log('To switch active model, run:');
  console.log('  corez-code model <model-id>');
  console.log('  /model <model-id>\n');

  return { success: true, model: currentConfig.model };
}
