/**
 * Manifest Schema and Validation Engine for Game Generation Pipeline
 * Enforces structured gameSpec, artDirection, and assetManifest JSON outputs.
 */

export class ValidationError extends Error {
  constructor(message, path = []) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
  }
}

export function validateGameManifest(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest root must be an object.'] };
  }

  // 1. Validate gameSpec
  if (!data.gameSpec || typeof data.gameSpec !== 'object') {
    errors.push('Missing or invalid "gameSpec" object.');
  } else {
    const { title, genre, mechanics, controls, entities, winCondition, loseCondition, difficultyCurve } = data.gameSpec;
    if (typeof title !== 'string' || !title.trim()) errors.push('gameSpec.title must be a non-empty string.');
    if (typeof genre !== 'string' || !genre.trim()) errors.push('gameSpec.genre must be a non-empty string.');
    if (!Array.isArray(mechanics)) errors.push('gameSpec.mechanics must be an array.');
    if (!controls || typeof controls !== 'object') errors.push('gameSpec.controls must be an object.');
    if (!Array.isArray(entities)) errors.push('gameSpec.entities must be an array.');
    if (typeof winCondition !== 'string') errors.push('gameSpec.winCondition must be a string.');
    if (typeof loseCondition !== 'string') errors.push('gameSpec.loseCondition must be a string.');
    if (!Array.isArray(difficultyCurve)) errors.push('gameSpec.difficultyCurve must be an array.');
  }

  // 2. Validate artDirection
  if (!data.artDirection || typeof data.artDirection !== 'object') {
    errors.push('Missing or invalid "artDirection" object.');
  } else {
    const { style, palette, camera, renderingRules } = data.artDirection;
    if (typeof style !== 'string' || !style.trim()) errors.push('artDirection.style must be a non-empty string.');
    if (!Array.isArray(palette)) errors.push('artDirection.palette must be an array.');
    if (typeof camera !== 'string') errors.push('artDirection.camera must be a string.');
    if (!Array.isArray(renderingRules)) errors.push('artDirection.renderingRules must be an array.');
  }

  // 3. Validate assetManifest
  if (!data.assetManifest || typeof data.assetManifest !== 'object') {
    errors.push('Missing or invalid "assetManifest" object.');
  } else if (!Array.isArray(data.assetManifest.assets)) {
    errors.push('assetManifest.assets must be an array.');
  } else {
    const assetIds = new Set();
    const validTypes = new Set([
      'background',
      'foreground',
      'tile',
      'player',
      'enemy',
      'collectable',
      'ui',
      'particle',
      'title_screen'
    ]);

    data.assetManifest.assets.forEach((asset, idx) => {
      const prefix = `assetManifest.assets[${idx}]`;
      if (!asset || typeof asset !== 'object') {
        errors.push(`${prefix} must be an object.`);
        return;
      }
      if (typeof asset.id !== 'string' || !asset.id.trim()) {
        errors.push(`${prefix}.id must be a unique non-empty string.`);
      } else if (assetIds.has(asset.id)) {
        errors.push(`${prefix}.id "${asset.id}" is duplicate.`);
      } else {
        assetIds.add(asset.id);
      }

      if (!validTypes.has(asset.type)) {
        errors.push(`${prefix}.type "${asset.type}" is invalid. Expected one of: ${Array.from(validTypes).join(', ')}.`);
      }
      if (typeof asset.prompt !== 'string' || !asset.prompt.trim()) {
        errors.push(`${prefix}.prompt must be a non-empty string.`);
      }
      if (typeof asset.width !== 'number' || asset.width <= 0) {
        errors.push(`${prefix}.width must be a positive integer.`);
      }
      if (typeof asset.height !== 'number' || asset.height <= 0) {
        errors.push(`${prefix}.height must be a positive integer.`);
      }
      if (typeof asset.transparent !== 'boolean') {
        errors.push(`${prefix}.transparent must be a boolean.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function parseAndValidateManifest(jsonString) {
  let rawJson = jsonString.trim();
  // Strip markdown code fences if wrapped
  const codeFenceMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch) {
    rawJson = codeFenceMatch[1].trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      success: false,
      error: `JSON Syntax Error: ${err.message}`,
      raw: jsonString
    };
  }

  const result = validateGameManifest(parsed);
  if (!result.valid) {
    return {
      success: false,
      error: `Manifest Validation Failed: ${result.errors.join(' | ')}`,
      errors: result.errors,
      manifest: parsed
    };
  }

  return {
    success: true,
    manifest: parsed
  };
}

export function generateCorrectionPrompt(validationResult) {
  return `The previous game manifest response failed schema validation.
Errors encountered:
${validationResult.errors.map(err => `- ${err}`).join('\n')}

Please output ONLY a corrected JSON object matching the required schema:
{
  "gameSpec": {
    "title": "string",
    "genre": "string",
    "mechanics": ["string"],
    "controls": { "key": "action" },
    "entities": ["string"],
    "winCondition": "string",
    "loseCondition": "string",
    "difficultyCurve": ["string"]
  },
  "artDirection": {
    "style": "string",
    "palette": ["#hex"],
    "camera": "string",
    "renderingRules": ["string"]
  },
  "assetManifest": {
    "assets": [
      {
        "id": "background",
        "type": "background|foreground|tile|player|enemy|collectable|ui|particle|title_screen",
        "prompt": "string",
        "width": 960,
        "height": 540,
        "transparent": false
      }
    ]
  }
}`;
}
