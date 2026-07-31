import { describe, it, expect } from 'vitest';
import { validateGameManifest, parseAndValidateManifest, generateCorrectionPrompt } from '../src/services/gamePipeline/manifestSchema.js';

describe('Game Manifest Schema & Parser', () => {
  const validManifest = {
    gameSpec: {
      title: 'Retro Knight Adventure',
      genre: 'platformer',
      mechanics: ['jump', 'sword attack'],
      controls: { ArrowLeft: 'Move Left', ArrowRight: 'Move Right', Space: 'Jump' },
      entities: ['Player', 'Goblin', 'Coin'],
      winCondition: 'Collect 10 coins',
      loseCondition: 'Fall in pit or lose 3 lives',
      difficultyCurve: ['Easy', 'Medium', 'Hard']
    },
    artDirection: {
      style: '8-bit retro pixel art',
      palette: ['#1a1c2c', '#f4b41b', '#e43b44'],
      camera: 'side-view',
      renderingRules: ['shape-rendering=crispEdges', 'imageSmoothingEnabled=false']
    },
    assetManifest: {
      assets: [
        {
          id: 'background',
          type: 'background',
          prompt: '8-bit pixel art dungeon backdrop',
          width: 960,
          height: 540,
          transparent: false
        },
        {
          id: 'player',
          type: 'player',
          prompt: '8-bit knight sprite on transparent background',
          width: 64,
          height: 64,
          transparent: true
        }
      ]
    }
  };

  it('validates a correct game manifest structure', () => {
    const result = validateGameManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing required fields in gameSpec', () => {
    const invalid = { ...validManifest, gameSpec: { title: 'Broken' } };
    const result = validateGameManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('parses valid JSON string with markdown fences', () => {
    const jsonString = `\`\`\`json\n${JSON.stringify(validManifest, null, 2)}\n\`\`\``;
    const parsed = parseAndValidateManifest(jsonString);
    expect(parsed.success).toBe(true);
    expect(parsed.manifest.gameSpec.title).toBe('Retro Knight Adventure');
  });

  it('fails gracefully on invalid JSON syntax', () => {
    const badJson = '{ title: "Unquoted key" }';
    const parsed = parseAndValidateManifest(badJson);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('JSON Syntax Error');
  });

  it('generates a detailed correction prompt on validation failure', () => {
    const valResult = { valid: false, errors: ['gameSpec.title must be a non-empty string.'] };
    const prompt = generateCorrectionPrompt(valResult);
    expect(prompt).toContain('The previous game manifest response failed schema validation');
    expect(prompt).toContain('gameSpec.title must be a non-empty string.');
  });

  it('generates a correction prompt from a JSON syntax error without crashing', () => {
    const parseResult = parseAndValidateManifest('{ title: "Unquoted key" }');
    expect(parseResult.success).toBe(false);

    const prompt = generateCorrectionPrompt(parseResult);
    expect(prompt).toContain('The previous game manifest response failed schema validation');
    expect(prompt).toContain('JSON Syntax Error');
  });
});
