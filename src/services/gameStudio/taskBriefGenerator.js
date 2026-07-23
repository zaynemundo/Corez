/**
 * CoreZ AI Game Studio Task Brief Generator
 * Formulates structured task briefs with file boundaries and acceptance criteria.
 */

export function createTaskBrief({
  task = '',
  role = 'gameplay-programmer',
  goal = '',
  relevantFiles = [],
  specFiles = ['game-project/design/game-spec.json'],
  dependencies = [],
  constraints = [],
  acceptanceCriteria = [],
  allowedFiles = []
}) {
  return {
    task: task || goal,
    role,
    goal: goal || task,
    relevantFiles: Array.isArray(relevantFiles) ? relevantFiles : [],
    specFiles: Array.isArray(specFiles) ? specFiles : [],
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    constraints: Array.isArray(constraints) ? constraints : [
      'Do not modify files outside allowedFiles',
      'Follow 60 FPS browser performance guidelines',
      'Embed valid game state logic'
    ],
    acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
    allowedFiles: Array.isArray(allowedFiles) && allowedFiles.length > 0 ? allowedFiles : relevantFiles
  };
}

export function validateTaskBriefScope(brief, targetFile) {
  if (!brief || !Array.isArray(brief.allowedFiles)) return true;
  if (brief.allowedFiles.length === 0) return true;
  return brief.allowedFiles.includes(targetFile);
}
