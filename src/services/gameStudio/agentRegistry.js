/**
 * CoreZ AI Game Studio Agent Registry
 * Manages studio roles, model allocations, permissions, and delegation hierarchy.
 */

import { defaultModelRegistry } from './modelMap.js';

export const STUDIO_ROLES = Object.freeze({
  PRODUCER: 'game-studio-producer',
  CREATIVE_DIRECTOR: 'creative-director',
  TECHNICAL_DIRECTOR: 'technical-director',
  GAME_DESIGNER: 'game-designer',
  LEAD_PROGRAMMER: 'lead-programmer',
  ART_DIRECTOR: 'art-director',
  QA_LEAD: 'qa-lead',
  GAMEPLAY_PROGRAMMER: 'gameplay-programmer',
  GAME_AI_PROGRAMMER: 'game-ai-programmer',
  ENGINE_PROGRAMMER: 'engine-programmer',
  UI_PROGRAMMER: 'ui-programmer',
  LEVEL_DESIGNER: 'level-designer',
  TECHNICAL_ARTIST: 'technical-artist',
  VISUAL_SPECIALIST: 'visual-specialist',
  QA_TESTER: 'qa-tester',
  CODE_REVIEWER: 'code-reviewer',
  ADVERSARIAL_REVIEWER: 'adversarial-reviewer'
});

export const STUDIO_DEPARTMENTS = Object.freeze({
  MANAGEMENT: 'management',
  DIRECTORATE: 'directorate',
  LEADERSHIP: 'leadership',
  PROGRAMMING: 'programming',
  DESIGN: 'design',
  ART: 'art',
  QUALITY: 'quality'
});

const DEFAULT_AGENTS = [
  {
    id: STUDIO_ROLES.PRODUCER,
    title: 'Game Studio Producer',
    category: 'fast',
    department: STUDIO_DEPARTMENTS.MANAGEMENT,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: Object.values(STUDIO_ROLES).filter(r => r !== STUDIO_ROLES.PRODUCER)
  },
  {
    id: STUDIO_ROLES.CREATIVE_DIRECTOR,
    title: 'Creative Director',
    category: 'creative',
    department: STUDIO_DEPARTMENTS.DIRECTORATE,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: [STUDIO_ROLES.GAME_DESIGNER, STUDIO_ROLES.ART_DIRECTOR]
  },
  {
    id: STUDIO_ROLES.TECHNICAL_DIRECTOR,
    title: 'Technical Director',
    category: 'reasoning',
    department: STUDIO_DEPARTMENTS.DIRECTORATE,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: [STUDIO_ROLES.LEAD_PROGRAMMER, STUDIO_ROLES.CODE_REVIEWER]
  },
  {
    id: STUDIO_ROLES.GAME_DESIGNER,
    title: 'Lead Game Designer',
    category: 'reasoning',
    department: STUDIO_DEPARTMENTS.LEADERSHIP,
    readOnly: false,
    canEditCode: false,
    canDelegateTo: [STUDIO_ROLES.LEVEL_DESIGNER]
  },
  {
    id: STUDIO_ROLES.LEAD_PROGRAMMER,
    title: 'Lead Programmer',
    category: 'coding',
    department: STUDIO_DEPARTMENTS.LEADERSHIP,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: [
      STUDIO_ROLES.GAMEPLAY_PROGRAMMER,
      STUDIO_ROLES.GAME_AI_PROGRAMMER,
      STUDIO_ROLES.ENGINE_PROGRAMMER,
      STUDIO_ROLES.UI_PROGRAMMER
    ]
  },
  {
    id: STUDIO_ROLES.ART_DIRECTOR,
    title: 'Art Director',
    category: 'visionPro',
    department: STUDIO_DEPARTMENTS.LEADERSHIP,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: [STUDIO_ROLES.TECHNICAL_ARTIST, STUDIO_ROLES.VISUAL_SPECIALIST]
  },
  {
    id: STUDIO_ROLES.QA_LEAD,
    title: 'QA Lead',
    category: 'reasoning',
    department: STUDIO_DEPARTMENTS.LEADERSHIP,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: [STUDIO_ROLES.QA_TESTER]
  },
  {
    id: STUDIO_ROLES.GAMEPLAY_PROGRAMMER,
    title: 'Gameplay Programmer',
    category: 'coding',
    department: STUDIO_DEPARTMENTS.PROGRAMMING,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.GAME_AI_PROGRAMMER,
    title: 'Game AI Programmer',
    category: 'coding',
    department: STUDIO_DEPARTMENTS.PROGRAMMING,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.ENGINE_PROGRAMMER,
    title: 'Engine / Systems Programmer',
    category: 'coding',
    department: STUDIO_DEPARTMENTS.PROGRAMMING,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.UI_PROGRAMMER,
    title: 'UI Programmer',
    category: 'fast',
    department: STUDIO_DEPARTMENTS.PROGRAMMING,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.LEVEL_DESIGNER,
    title: 'Level Designer',
    category: 'fast',
    department: STUDIO_DEPARTMENTS.DESIGN,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.TECHNICAL_ARTIST,
    title: 'Technical Artist',
    category: 'vision',
    department: STUDIO_DEPARTMENTS.ART,
    readOnly: false,
    canEditCode: true,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.VISUAL_SPECIALIST,
    title: 'Visual Specialist',
    category: 'vision',
    department: STUDIO_DEPARTMENTS.ART,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.QA_TESTER,
    title: 'QA Tester',
    category: 'fast',
    department: STUDIO_DEPARTMENTS.QUALITY,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.CODE_REVIEWER,
    title: 'Code Reviewer',
    category: 'reasoning',
    department: STUDIO_DEPARTMENTS.QUALITY,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: []
  },
  {
    id: STUDIO_ROLES.ADVERSARIAL_REVIEWER,
    title: 'Adversarial Reviewer',
    category: 'expensiveReviewer',
    department: STUDIO_DEPARTMENTS.QUALITY,
    readOnly: true,
    canEditCode: false,
    canDelegateTo: []
  }
];

export class GameStudioAgentRegistry {
  constructor(modelRegistry = defaultModelRegistry) {
    this.modelRegistry = modelRegistry;
    this.agents = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    for (const def of DEFAULT_AGENTS) {
      this.registerAgent(def);
    }
  }

  registerAgent(agentDef) {
    if (!agentDef || !agentDef.id) {
      throw new Error('Invalid agent definition: id is required.');
    }
    const model = this.modelRegistry.getModelForRoleCategory(agentDef.category);
    if (!model.startsWith('opencode-go/')) {
      throw new Error(`Agent ${agentDef.id} must be assigned an opencode-go/* model.`);
    }

    const normalized = {
      id: agentDef.id,
      title: agentDef.title || agentDef.id,
      category: agentDef.category || 'fast',
      model,
      department: agentDef.department || STUDIO_DEPARTMENTS.PROGRAMMING,
      readOnly: Boolean(agentDef.readOnly),
      canEditCode: Boolean(agentDef.canEditCode),
      canDelegateTo: Array.isArray(agentDef.canDelegateTo) ? agentDef.canDelegateTo : []
    };

    this.agents.set(normalized.id, normalized);
    return normalized;
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  canDelegate(fromRoleId, toRoleId) {
    const fromAgent = this.getAgent(fromRoleId);
    if (!fromAgent) return false;
    return fromAgent.canDelegateTo.includes(toRoleId);
  }
}

export const defaultAgentRegistry = new GameStudioAgentRegistry();
