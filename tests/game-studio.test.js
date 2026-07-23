import { describe, it, expect } from 'vitest';
import { 
  STUDIO_ROLES, 
  defaultAgentRegistry 
} from '../src/services/gameStudio/agentRegistry.js';
import { 
  GameStudioModelRegistry 
} from '../src/services/gameStudio/modelMap.js';
import { 
  classifyGameComplexity, 
  provisionStudioTeam, 
  GAME_COMPLEXITY 
} from '../src/services/gameStudio/gameSizer.js';
import { 
  createTaskBrief, 
  validateTaskBriefScope 
} from '../src/services/gameStudio/taskBriefGenerator.js';
import { GameStudioOrchestrator, generateImageWithFlux1 } from '../src/services/gameStudio/gameStudioOrchestrator.js';
import { WORKFLOW_STAGES } from '../src/orchestration/workflowState.js';

describe('CoreZ AI Game Studio Engine (OpenCode Go Native)', () => {

  describe('1. Agent Registry & OpenCode Go Model Validation', () => {
    it('registers all 17 studio agents with opencode-go/* models', () => {
      const agents = defaultAgentRegistry.getAllAgents();
      expect(agents.length).toBe(17);
      
      for (const agent of agents) {
        expect(agent.id).toBeDefined();
        expect(agent.model).toMatch(/^opencode-go\//);
        expect(['management', 'directorate', 'leadership', 'programming', 'design', 'art', 'quality']).toContain(agent.department);
      }
    });

    it('rejects model allocations that do not use opencode-go/*', () => {
      const modelReg = new GameStudioModelRegistry();
      expect(() => modelReg.setModelForRoleCategory('fast', 'claude-3-5-sonnet')).toThrow(/opencode-go/);
    });

    it('enforces read-only permissions for Directors, QA Lead, and Code Reviewers', () => {
      const directors = [
        STUDIO_ROLES.CREATIVE_DIRECTOR,
        STUDIO_ROLES.TECHNICAL_DIRECTOR,
        STUDIO_ROLES.ART_DIRECTOR,
        STUDIO_ROLES.QA_LEAD,
        STUDIO_ROLES.VISUAL_SPECIALIST,
        STUDIO_ROLES.CODE_REVIEWER,
        STUDIO_ROLES.ADVERSARIAL_REVIEWER
      ];

      for (const roleId of directors) {
        const agent = defaultAgentRegistry.getAgent(roleId);
        expect(agent.readOnly).toBe(true);
        expect(agent.canEditCode).toBe(false);
      }
    });
  });

  describe('2. Delegation Hierarchy & File Ownership', () => {
    it('allows Lead Programmer to delegate to specialist programmers', () => {
      expect(defaultAgentRegistry.canDelegate(STUDIO_ROLES.LEAD_PROGRAMMER, STUDIO_ROLES.GAMEPLAY_PROGRAMMER)).toBe(true);
      expect(defaultAgentRegistry.canDelegate(STUDIO_ROLES.LEAD_PROGRAMMER, STUDIO_ROLES.GAME_AI_PROGRAMMER)).toBe(true);
    });

    it('prevents Game Designer from directly bypassing Lead Programmer to delegate to Engine Programmer', () => {
      expect(defaultAgentRegistry.canDelegate(STUDIO_ROLES.GAME_DESIGNER, STUDIO_ROLES.ENGINE_PROGRAMMER)).toBe(false);
    });

    it('enforces task brief scope boundaries', () => {
      const brief = createTaskBrief({
        goal: 'Build player controls',
        allowedFiles: ['src/game/entities/player.js']
      });

      expect(validateTaskBriefScope(brief, 'src/game/entities/player.js')).toBe(true);
      expect(validateTaskBriefScope(brief, 'src/game/core/engine.js')).toBe(false);
    });
  });

  describe('3. Game Complexity Sizing', () => {
    it('classifies small games (Pong, Snake) and provisions minimal teams', () => {
      expect(classifyGameComplexity('Build me a retro Snake game')).toBe(GAME_COMPLEXITY.SMALL);
      expect(classifyGameComplexity('Create a 2D Pong game')).toBe(GAME_COMPLEXITY.SMALL);

      const team = provisionStudioTeam(GAME_COMPLEXITY.SMALL);
      expect(team).toContain(STUDIO_ROLES.PRODUCER);
      expect(team).toContain(STUDIO_ROLES.GAMEPLAY_PROGRAMMER);
      expect(team).not.toContain(STUDIO_ROLES.ART_DIRECTOR);
      expect(team.length).toBeLessThanOrEqual(5);
    });

    it('classifies medium games (Platformers, Shooters) and provisions lead team', () => {
      expect(classifyGameComplexity('Build an 8-bit retro platformer with a knight')).toBe(GAME_COMPLEXITY.MEDIUM);

      const team = provisionStudioTeam(GAME_COMPLEXITY.MEDIUM);
      expect(team).toContain(STUDIO_ROLES.CREATIVE_DIRECTOR);
      expect(team).toContain(STUDIO_ROLES.TECHNICAL_DIRECTOR);
      expect(team).toContain(STUDIO_ROLES.LEAD_PROGRAMMER);
      expect(team).toContain(STUDIO_ROLES.VISUAL_SPECIALIST);
    });

    it('classifies large games (RPGs, Strategy) and provisions full studio orchestration', () => {
      expect(classifyGameComplexity('Build a multiplayer RPG dungeon crawler')).toBe(GAME_COMPLEXITY.LARGE);

      const team = provisionStudioTeam(GAME_COMPLEXITY.LARGE);
      expect(team).toContain(STUDIO_ROLES.ENGINE_PROGRAMMER);
      expect(team).toContain(STUDIO_ROLES.LEVEL_DESIGNER);
      expect(team).toContain(STUDIO_ROLES.ART_DIRECTOR);
      expect(team).toContain(STUDIO_ROLES.ADVERSARIAL_REVIEWER);
      expect(team.length).toBe(17);
    });
  });

  describe('4. Full Studio Workflow & Verification Gates', () => {
    it('executes end-to-end game studio pipeline for an 8-bit retro platformer', async () => {
      const orchestrator = new GameStudioOrchestrator();
      const result = await orchestrator.buildGame('Build an 8-bit retro platformer with a knight');

      expect(result.complexity).toBe(GAME_COMPLEXITY.MEDIUM);
      expect(result.gameSpec.title).toContain('Knight Platformer');
      expect(result.artDirection.visualTheme).toContain('8-Bit Retro');
      expect(result.assetManifest.assets.length).toBeGreaterThan(0);
      expect(result.verificationRecord.exitCode).toBe(0);
      expect(result.workflow.currentStage).toBe(WORKFLOW_STAGES.COMPLETE);
    });

    it('generates game reference background images using generateImageWithFlux1', async () => {
      const imageUrl = await generateImageWithFlux1('dungeon entrance background');
      expect(imageUrl).toBeDefined();
      expect(typeof imageUrl).toBe('string');
      expect(imageUrl.length).toBeGreaterThan(0);
    });
  });

});
