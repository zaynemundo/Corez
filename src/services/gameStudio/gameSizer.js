/**
 * CoreZ AI Game Studio Complexity Sizer
 * Estimates game complexity (SMALL, MEDIUM, LARGE) and selects optimal studio team composition.
 */

import { STUDIO_ROLES } from './agentRegistry.js';

export const GAME_COMPLEXITY = Object.freeze({
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE'
});

const SMALL_PATTERNS = /\b(snake|pong|tic tac toe|flappy|clicker|memory game|guess|cookie clicker)\b/i;
const LARGE_PATTERNS = /\b(rpg|role playing|mmo|multiplayer|strategy|4x|simulation|sim city|dungeon crawler|open world)\b/i;

export function classifyGameComplexity(prompt = '') {
  const clean = prompt.trim().toLowerCase();
  if (SMALL_PATTERNS.test(clean)) return GAME_COMPLEXITY.SMALL;
  if (LARGE_PATTERNS.test(clean)) return GAME_COMPLEXITY.LARGE;
  return GAME_COMPLEXITY.MEDIUM;
}

export function provisionStudioTeam(complexity) {
  switch (complexity) {
    case GAME_COMPLEXITY.SMALL:
      return [
        STUDIO_ROLES.PRODUCER,
        STUDIO_ROLES.GAME_DESIGNER,
        STUDIO_ROLES.GAMEPLAY_PROGRAMMER,
        STUDIO_ROLES.QA_TESTER
      ];

    case GAME_COMPLEXITY.MEDIUM:
      return [
        STUDIO_ROLES.PRODUCER,
        STUDIO_ROLES.CREATIVE_DIRECTOR,
        STUDIO_ROLES.GAME_DESIGNER,
        STUDIO_ROLES.TECHNICAL_DIRECTOR,
        STUDIO_ROLES.LEAD_PROGRAMMER,
        STUDIO_ROLES.GAMEPLAY_PROGRAMMER,
        STUDIO_ROLES.GAME_AI_PROGRAMMER,
        STUDIO_ROLES.UI_PROGRAMMER,
        STUDIO_ROLES.TECHNICAL_ARTIST,
        STUDIO_ROLES.VISUAL_SPECIALIST,
        STUDIO_ROLES.QA_LEAD,
        STUDIO_ROLES.QA_TESTER,
        STUDIO_ROLES.CODE_REVIEWER
      ];

    case GAME_COMPLEXITY.LARGE:
    default:
      return [
        STUDIO_ROLES.PRODUCER,
        STUDIO_ROLES.CREATIVE_DIRECTOR,
        STUDIO_ROLES.GAME_DESIGNER,
        STUDIO_ROLES.TECHNICAL_DIRECTOR,
        STUDIO_ROLES.LEAD_PROGRAMMER,
        STUDIO_ROLES.ART_DIRECTOR,
        STUDIO_ROLES.GAMEPLAY_PROGRAMMER,
        STUDIO_ROLES.GAME_AI_PROGRAMMER,
        STUDIO_ROLES.ENGINE_PROGRAMMER,
        STUDIO_ROLES.UI_PROGRAMMER,
        STUDIO_ROLES.LEVEL_DESIGNER,
        STUDIO_ROLES.TECHNICAL_ARTIST,
        STUDIO_ROLES.VISUAL_SPECIALIST,
        STUDIO_ROLES.QA_LEAD,
        STUDIO_ROLES.QA_TESTER,
        STUDIO_ROLES.CODE_REVIEWER,
        STUDIO_ROLES.ADVERSARIAL_REVIEWER
      ];
  }
}
