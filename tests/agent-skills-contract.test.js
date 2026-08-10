import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_ROOT = join(process.cwd(), '.agents', 'skills');
const REQUIRED_CAPABILITY_SKILLS = [
  'corez-cli',
  'creation-preview-publishing',
  'durable-task-context',
  'file-attachment-analysis',
  'image-generation',
  'live-market-data'
];

function parseSkill(directory) {
  const file = join(SKILLS_ROOT, directory, 'SKILL.md');
  const source = readFileSync(file, 'utf8');
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/);
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
});
