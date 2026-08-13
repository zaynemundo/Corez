/**
 * CoreZ Skill Registry
 * Central registry managing Superpowers workflow skills and CoreZ specialist capabilities.
 */

import { SUPERPOWERS_SKILLS, COREZ_SPECIALIST_SKILLS } from './definitions.js';

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    for (const skill of [...SUPERPOWERS_SKILLS, ...COREZ_SPECIALIST_SKILLS]) {
      this.registerSkill(skill);
    }
  }

  registerSkill(skill) {
    if (!skill || typeof skill !== 'object' || !skill.id) {
      throw new Error('Invalid skill object: id is required.');
    }
    const normalized = {
      id: skill.id,
      name: skill.name || skill.id,
      description: skill.description || '',
      triggers: Array.isArray(skill.triggers) ? skill.triggers : [],
      phase: skill.phase || 'IMPLEMENTING',
      priority: skill.priority || 50,
      dependencies: Array.isArray(skill.dependencies) ? skill.dependencies : [],
      compatibleIntents: Array.isArray(skill.compatibleIntents) ? skill.compatibleIntents : ['app', 'code-help', 'writing', 'explanation', 'general'],
      requiresTools: Array.isArray(skill.requiresTools) ? skill.requiresTools : [],
      instructions: skill.instructions || ''
    };
    this.skills.set(normalized.id, normalized);
    return normalized;
  }

  getSkill(id) {
    return this.skills.get(id) || null;
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }

  getSkillsForIntent(intent) {
    return this.getAllSkills().filter(skill => 
      skill.compatibleIntents.includes(intent)
    );
  }

  getFormattedSkillList() {
    return this.getAllSkills()
      .map(skill => `- ${skill.id}: ${skill.description}`)
      .join('\n');
  }
}

export const defaultSkillRegistry = new SkillRegistry();
