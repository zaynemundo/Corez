import { ContextEngine, loadCorezConfig } from '../../../agent-core/index.js';

export async function handleStatusCommand(args, options = {}, ui) {
  const cwd = options.cwd || process.cwd();
  const config = loadCorezConfig(cwd);
  const context = new ContextEngine(cwd);
  const projectInfo = context.inspectProject();

  ui.banner();
  ui.header({
    project: projectInfo.name,
    model: config.model,
    mode: config.mode,
    branch: projectInfo.gitBranch
  });

  ui.status('✓', `Workspace CWD: ${projectInfo.cwd}`);
  ui.status('✓', `Package Name: ${projectInfo.name} (v${projectInfo.version})`);
  ui.status('✓', `Git Status: ${projectInfo.gitStatusShort ? 'Modified files present' : 'Clean working directory'}`);
  ui.status('✓', `Default Model: ${config.model} (Reasoning: ${config.reasoning})`);
  ui.status('✓', `Permissions: workspaceWrite=${config.permissions.workspaceWrite}, shell=${config.permissions.shell}`);

  const instructions = context.loadInstructions();
  if (instructions.length > 0) {
    ui.status('✓', `Instruction Files: ${instructions.map(i => i.filename).join(', ')}`);
  }
}
