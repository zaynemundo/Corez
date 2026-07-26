const READ_ONLY_TOOLS = Object.freeze([
  'read_file', 'list_directory', 'search_files', 'search_text', 'git_status', 'git_diff', 'git_log'
]);

const POLICIES = Object.freeze({
  chat: Object.freeze({ tools: Object.freeze(['*']), readOnly: false, requireVerification: false }),
  run: Object.freeze({ tools: Object.freeze(['*']), readOnly: false, requireVerification: false }),
  plan: Object.freeze({ tools: READ_ONLY_TOOLS, readOnly: true, requireVerification: false }),
  review: Object.freeze({ tools: READ_ONLY_TOOLS, readOnly: true, requireVerification: false }),
  build: Object.freeze({ tools: Object.freeze(['*']), readOnly: false, requireVerification: true }),
  fix: Object.freeze({ tools: Object.freeze(['*']), readOnly: false, requireVerification: true })
});

export function getCommandPolicy(name) {
  const policy = POLICIES[name];
  if (!policy) throw new Error(`Unknown command policy: ${name}`);
  return Object.freeze({ name, ...policy });
}
