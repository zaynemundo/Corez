import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_ROOT = join(process.cwd(), '.agents', 'skills');
const REPO_ROOT = process.cwd();
const REQUIRED_CAPABILITY_SKILLS = [
  'corez-cli',
  'creation-preview-publishing',
  'durable-task-context',
  'file-attachment-analysis',
  'image-generation'
];

// Skills must reference repository artifacts that actually exist. Each entry
// is [skill name, repo-relative path]; the path is asserted both in the skill
// text and on disk so stale references fail the contract instead of shipping.
const REQUIRED_REFERENCES = [
  ['verify', 'worker/entry.js'],
  ['backend-architecture', 'worker/entry.js'],
  ['backend-architecture', 'worker/utils.js'],
  ['ai-infrastructure', 'worker/providerChain.js'],
  ['image-generation', 'tests/ai-image-routing.test.js'],
  ['file-attachment-analysis', 'tests/chat-attachments.test.jsx'],
  ['durable-task-context', 'tests/task-persistence.test.js'],
  ['creation-preview-publishing', 'tests/app-r2-storage.test.js'],
  ['accessibility-expert', 'tests/ui-responsive-contract.sh'],
  ['code-review-testing', 'tests/workers-ai-rerank-embed-contract.mjs'],
  ['git-superpowers', 'tests/git-superpowers-contract.sh'],
  ['git-superpowers', '.agents/hooks.json'],
  ['git-superpowers', '.agents/scripts/auto_commit.py'],
  ['corez-cli', 'packages/cli'],
  ['corez', 'packages/agent-core/verification/corez/ship.js'],
  ['research', '.agents/skills/research/validate_json.py'],
];

// Provider, routing, and entrypoint claims that drifted from the code before.
// If one of these reappears the skill is documenting a runtime that no longer
// exists, so the contract fails and forces a re-check against the source.
const FORBIDDEN_STALE_CLAIMS = [
  ['ai-infrastructure', 'official DeepSeek'],
  ['ai-infrastructure', 'does not currently use Cloudflare Workers AI'],
  ['capability-orchestrator', 'FLUX 1 (`schnell` / `dev`)'],
  ['code-review-testing', 'market-worker-contract'],
  ['verify', 'Nano Banana 2 first'],
  ['verify', 'swarm: true'],
  ['verify', 'complexity: high/epic'],
  ['research', 'webfetch` tool only (no search API)'],
  ['accessibility-expert', 'via `npm run test:cloudflare` or directly'],
];

function parseSkill(directory) {
  const file = join(SKILLS_ROOT, directory, 'SKILL.md');
  const source = readFileSync(file, 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const name = frontmatter?.[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  const description = frontmatter?.[1].match(/^description:\s*(.+)$/m)?.[1].trim();
  return { directory, file, source, frontmatter, name, description };
}

const skills = readdirSync(SKILLS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_ROOT, entry.name, 'SKILL.md')))
  .map((entry) => parseSkill(entry.name));

describe('agent skill catalog contract', () => {
  it('has valid, unique frontmatter matching each directory', () => {
    const names = new Set();
    for (const skill of skills) {
      expect(skill.frontmatter, `${skill.file} needs YAML frontmatter`).toBeTruthy();
      expect(skill.name, `${skill.file} needs a name`).toBe(skill.directory);
      expect(skill.name, `${skill.name} must be lowercase kebab-case`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.description, `${skill.name} needs an activation description`).toBeTruthy();
      expect(skill.description.length).toBeGreaterThanOrEqual(40);
      expect(names.has(skill.name), `duplicate skill name: ${skill.name}`).toBe(false);
      names.add(skill.name);
    }
  });

  it('covers repository capabilities that need operational guardrails', () => {
    const names = new Set(skills.map((skill) => skill.name));
    for (const required of REQUIRED_CAPABILITY_SKILLS) {
      expect(names, `missing capability-backed skill: ${required}`).toContain(required);
    }
  });

  it('keeps provider and unsupported-action guidance honest', () => {
    const byName = new Map(skills.map((skill) => [skill.name, skill.source]));
    expect(byName.get('ask-env-values')).toContain('OPENCODE_GO_API_KEY');
    expect(byName.get('ask-env-values')).toContain('OPENROUTER_API_KEY');
    expect(byName.get('ask-env-values')).toContain('does not use Cloudflare Workers AI');
    expect(byName.get('productivity-connectors')).toContain('does not currently expose email');
    expect(byName.get('scheduling-automation')).toContain('no background reminder or recurring-job API');
    expect(byName.get('visual-creative')).toContain('does not implement background removal');
  });

  it('documents anonymous identifier-based storage boundaries', () => {
    const byName = new Map(skills.map((skill) => [skill.name, skill.source]));
    expect(byName.get('r2-mem0-memory')).toContain('Never use `default_user`');
    expect(byName.get('creation-preview-publishing')).toContain('session identifier is the access credential');
    expect(byName.get('durable-task-context')).toMatch(/not strong\s+authentication/);
  });

  it('points every required reference at an existing repository artifact', () => {
    const byName = new Map(skills.map((skill) => [skill.name, skill.source]));
    for (const [skill, relativePath] of REQUIRED_REFERENCES) {
      expect(byName.get(skill), `${skill} must exist for reference checks`).toBeTruthy();
      expect(
        byName.get(skill),
        `${skill} must reference ${relativePath}`
      ).toContain(relativePath);
      expect(
        existsSync(join(REPO_ROOT, relativePath)),
        `${relativePath} referenced by ${skill} must exist`
      ).toBe(true);
    }
  });

  it('rejects known-stale provider, routing, and entrypoint claims', () => {
    const byName = new Map(skills.map((skill) => [skill.name, skill.source]));
    for (const [skill, staleClaim] of FORBIDDEN_STALE_CLAIMS) {
      expect(byName.get(skill), `${skill} must exist for stale-claim checks`).toBeTruthy();
      expect(
        byName.get(skill).includes(staleClaim),
        `${skill} must not document the stale claim: ${staleClaim}`
      ).toBe(false);
    }
  });

  it('keeps the worker entrypoint grounded in wrangler.jsonc', () => {
    const wrangler = readFileSync(join(REPO_ROOT, 'wrangler.jsonc'), 'utf8');
    const main = wrangler.match(/"main"\s*:\s*"([^"]+)"/)?.[1];
    expect(main, 'wrangler.jsonc must declare a main entry').toBeTruthy();
    const entrypoint = main.replace(/^\.\//, '');
    expect(existsSync(join(REPO_ROOT, entrypoint)), `worker entry ${entrypoint} must exist`).toBe(true);
    for (const skillName of ['verify', 'backend-architecture']) {
      const source = skills.find((skill) => skill.name === skillName).source;
      expect(source, `${skillName} must reference the real entrypoint`).toContain(entrypoint);
      expect(source, `${skillName} must not reference swarm-index`).not.toContain('swarm-index');
    }
  });

  it('routes the game skill through on-demand part files, not a monolith', () => {
    const game = skills.find((skill) => skill.name === 'game-development');
    expect(game, 'game-development skill must exist').toBeTruthy();
    expect(game.source.length, 'router SKILL.md should stay small').toBeLessThan(20_000);

    const referenced = [
      ...game.source.matchAll(/`((?:parts|reference)\/[A-Za-z0-9_-]+\.md)`/g)
    ].map((match) => match[1]);
    expect(referenced.length, 'router must link the part files').toBeGreaterThanOrEqual(18);
    for (const relativePath of referenced) {
      expect(
        existsSync(join(SKILLS_ROOT, 'game-development', relativePath)),
        `${relativePath} linked from the game router must exist`
      ).toBe(true);
    }

    const partOne = readFileSync(
      join(SKILLS_ROOT, 'game-development', 'parts', '01-game-start.md'),
      'utf8'
    );
    expect(partOne).toContain('flux-2-klein-4b');
    expect(partOne).not.toContain('flux-1-schnell | asset generation');
  });
});
