import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { SkillRegistry, parseSkillFrontmatter, createSkillTool } from '../packages/agent-core/skills/SkillRegistry.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';

describe('SkillRegistry & skill Tool', () => {
  it('parses YAML frontmatter from markdown correctly', () => {
    const raw = `---
name: test-skill
description: A test skill for unit tests
version: 1.0.0
---

# Instructions
Follow these steps carefully.`;

    const { metadata, body } = parseSkillFrontmatter(raw);
    expect(metadata.name).toBe('test-skill');
    expect(metadata.description).toBe('A test skill for unit tests');
    expect(metadata.version).toBe('1.0.0');
    expect(body).toContain('# Instructions');
  });

  it('discovers real skills from workspace .agents/skills', () => {
    const registry = new SkillRegistry({
      skillsDir: path.resolve(process.cwd(), '.agents', 'skills')
    });

    const skills = registry.listSkills();
    expect(skills.length).toBeGreaterThan(5);

    const skillNames = skills.map(s => s.name);
    expect(skillNames).toContain('git-superpowers');
    expect(skillNames).toContain('accessibility-expert');
  });

  it('retrieves and renders skill content with XML tags', () => {
    const registry = new SkillRegistry({
      skillsDir: path.resolve(process.cwd(), '.agents', 'skills')
    });

    const rendered = registry.renderSkillContent('git-superpowers');
    expect(rendered).toContain('<skill_content name="git-superpowers">');
    expect(rendered).toContain('Git Superpowers');
  });

  it('searches skills by keyword', () => {
    const registry = new SkillRegistry({
      skillsDir: path.resolve(process.cwd(), '.agents', 'skills')
    });

    const designSkills = registry.searchSkills('design');
    expect(designSkills.length).toBeGreaterThan(0);
    expect(designSkills.some(s => s.name.includes('design') || s.description.toLowerCase().includes('design'))).toBe(true);
  });

  it('executes skill tool actions via ToolRegistry', async () => {
    const skillRegistry = new SkillRegistry({
      skillsDir: path.resolve(process.cwd(), '.agents', 'skills')
    });
    const tool = createSkillTool(skillRegistry);
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerTool(tool);

    // List action
    const listRes = await toolRegistry.executeTool('skill', { action: 'list' }, { autoApprove: true });
    expect(listRes.success).toBe(true);
    expect(listRes.count).toBeGreaterThan(0);

    // Search action
    const searchRes = await toolRegistry.executeTool('skill', { action: 'search', query: 'git' }, { autoApprove: true });
    expect(searchRes.success).toBe(true);
    expect(searchRes.skills.some(s => s.name === 'git-superpowers')).toBe(true);

    // Load action
    const loadRes = await toolRegistry.executeTool('skill', { action: 'load', name: 'git-superpowers' }, { autoApprove: true });
    expect(loadRes.success).toBe(true);
    expect(loadRes.content).toContain('<skill_content name="git-superpowers">');
  });
});
