// SkillRegistry: Dynamic discovery, loading, and management of specialized SKILL.md packages.
// Inspired by DeepSeek Harness dsh-skill / tool-skill.

import fs from 'node:fs';
import path from 'node:path';
import { PERMISSION_CATEGORIES } from '../permissions/index.js';

/**
 * Parses simple YAML frontmatter from markdown files.
 */
export function parseSkillFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { metadata: {}, body: content };
  }
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) {
    return { metadata: {}, body: content };
  }
  const frontmatterStr = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 3).trim();

  const metadata = {};
  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      metadata[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }

  return { metadata, body };
}

export class SkillRegistry {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || path.resolve(process.cwd(), '.agents', 'skills');
    this.customDirs = options.customDirs || [];
    this.skills = new Map(); // name -> skill definition
    this.discovered = false;
  }

  /**
   * Discovers all skills in configured skill directories.
   */
  discoverSkills() {
    this.skills.clear();
    const searchDirs = [this.skillsDir, ...this.customDirs];

    for (const baseDir of searchDirs) {
      if (!fs.existsSync(baseDir)) continue;

      let entries;
      try {
        entries = fs.readdirSync(baseDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(baseDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          try {
            const rawContent = fs.readFileSync(skillPath, 'utf8');
            const { metadata, body } = parseSkillFrontmatter(rawContent);
            const name = metadata.name || entry.name;
            const description = metadata.description || 'Specialized skill module';

            this.skills.set(name, {
              name,
              description,
              path: skillPath,
              directory: path.join(baseDir, entry.name),
              metadata,
              body,
              rawContent
            });
          } catch {
            // Ignore unreadable skills
          }
        }
      }
    }

    this.discovered = true;
    return Array.from(this.skills.values());
  }

  /**
   * Returns list of all available skill summaries.
   */
  listSkills() {
    if (!this.discovered) {
      this.discoverSkills();
    }
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
      directory: s.directory
    }));
  }

  /**
   * Retrieves a loaded skill by name.
   */
  getSkill(name) {
    if (!this.discovered) {
      this.discoverSkills();
    }
    return this.skills.get(name) || null;
  }

  /**
   * Searches skills by keyword in name or description.
   */
  searchSkills(query) {
    const list = this.listSkills();
    if (!query) return list;
    const lower = query.toLowerCase();
    return list.filter(s => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower));
  }

  /**
   * Renders canonical skill content block for model injection.
   */
  renderSkillContent(name) {
    const skill = this.getSkill(name);
    if (!skill) return null;
    return `<skill_content name="${skill.name}">\n# Skill: ${skill.name}\n${skill.description}\n\n${skill.body}\n</skill_content>`;
  }
}

/**
 * Creates the `skill` tool for CoreZ ToolRegistry.
 */
export function createSkillTool(skillRegistry) {
  return {
    name: 'skill',
    category: PERMISSION_CATEGORIES.READ,
    description: 'Discover, search, or load instructions for specialized agent skills (e.g. accessibility-expert, apple-design, git-superpowers, backend-architecture).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'search', 'load'],
          description: 'Action to perform: list available skills, search by keyword, or load full skill instructions'
        },
        name: {
          type: 'string',
          description: 'The skill name to load (required when action is "load")'
        },
        query: {
          type: 'string',
          description: 'Keyword to search for (used when action is "search")'
        }
      },
      required: ['action']
    },
    execute: async ({ action, name, query }) => {
      if (action === 'list') {
        const list = skillRegistry.listSkills();
        return {
          success: true,
          count: list.length,
          skills: list
        };
      }

      if (action === 'search') {
        const matches = skillRegistry.searchSkills(query);
        return {
          success: true,
          count: matches.length,
          skills: matches
        };
      }

      if (action === 'load') {
        if (!name) {
          return { success: false, error: 'Skill name is required for action "load".' };
        }
        const skill = skillRegistry.getSkill(name);
        if (!skill) {
          return {
            success: false,
            error: `Skill "${name}" not found. Use action "list" to see all available skills.`
          };
        }
        return {
          success: true,
          name: skill.name,
          description: skill.description,
          content: skillRegistry.renderSkillContent(name)
        };
      }

      return { success: false, error: `Unknown action: "${action}"` };
    }
  };
}
