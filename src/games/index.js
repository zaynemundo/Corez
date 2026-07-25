import { synthesizeChessGame } from './chess.js';
import { synthesizeRetroSpaceGame } from './space.js';
import { synthesizeBotEnemyGame } from './bot-enemy.js';
import { synthesizeWordleGame } from './wordle.js';
import { synthesizeScrabbleGame } from './scrabble.js';
import { synthesizePlatformerGame } from './platformer.js';
import { synthesizeFinancialTerminal } from './financial-terminal.js';

export function synthesizeCustomGame(prompt) {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('financial') || lower.includes('finance') || lower.includes('stock') || lower.includes('crypto') || lower.includes('market') || lower.includes('terminal') || lower.includes('forex') || lower.includes('ticker')) {
    return {
      title: 'COREZ Financial Demo Terminal',
      html: synthesizeFinancialTerminal()
    };
  }

  if (lower.includes('mario') || lower.includes('platformer') || lower.includes('jump') || lower.includes('run')) {
    return {
      title: 'COREZ Super Mario World',
      html: synthesizePlatformerGame()
    };
  }

  if (lower.includes('wordle') || (lower.includes('word') && lower.includes('guess'))) {
    return {
      title: 'COREZ Wordle Master',
      html: synthesizeWordleGame()
    };
  }

  if (lower.includes('scrabble') || lower.includes('tile') || lower.includes('anagram') || lower.includes('crossword') || lower.includes('word game')) {
    return {
      title: 'COREZ Scrabble Master',
      html: synthesizeScrabbleGame()
    };
  }

  if (lower.includes('chess')) {
    const withBot = lower.includes('bot') || lower.includes('enemy');
    return {
      title: withBot ? 'COREZ Chess App (vs Bot)' : 'COREZ Chess App',
      html: synthesizeChessGame(withBot)
    };
  }

  if (lower.includes('space') || lower.includes('retro') || lower.includes('shooter') || lower.includes('arcade') || lower.includes('ship')) {
    return {
      title: 'COREZ Retro Space Game',
      html: synthesizeRetroSpaceGame()
    };
  }

  if (lower.includes('bot') || lower.includes('enemy')) {
    return {
      title: 'COREZ Bot Enemy Simulator',
      html: synthesizeBotEnemyGame()
    };
  }

  const gameTitle = clean.replace(/(create|build|make|generate|a|an|the|game|play|app|widget|prototype)/gi, '').trim() || 'Interactive App';
  const capitalizedTitle = gameTitle.charAt(0).toUpperCase() + gameTitle.slice(1);

  return {
    title: `COREZ ${capitalizedTitle} App`,
    html: synthesizePlatformerGame()
  };
}
