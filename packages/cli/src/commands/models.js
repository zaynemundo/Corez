import { ModelProviderRouter } from '../../../agent-core/index.js';

export async function handleModelsCommand(args, _options = {}, ui) {
  const router = new ModelProviderRouter();
  const available = router.getAvailableModels();

  ui.banner();
  console.log('Available CoreZ AI Models:\n');
  
  for (const m of available) {
    const statusTag = m.configured ? '✓ Configured' : 'ℹ Local/Fallback';
    console.log(`- ${m.id} (${m.name})`);
    console.log(`  Provider: ${m.provider} | Role: ${m.role} | Status: ${statusTag}\n`);
  }
}
