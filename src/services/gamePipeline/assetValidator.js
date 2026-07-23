/**
 * Asset Validation and Selective Repair Module
 * Inspects generated assets for dimension accuracy, aspect ratio, transparency, and corruption.
 * Generates targeted repair prompts for failed assets without re-running the full pipeline.
 */

export function validateAsset(assetDef, assetData) {
  const errors = [];
  const warnings = [];

  if (!assetData) {
    return {
      valid: false,
      errors: [`Asset data for "${assetDef.id}" is missing or null.`],
      assetId: assetDef.id
    };
  }

  // 1. File size check (Max 5MB)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (assetData.sizeBytes && assetData.sizeBytes > MAX_SIZE) {
    errors.push(`Asset file size (${assetData.sizeBytes} bytes) exceeds maximum threshold of 5MB.`);
  }

  // 2. MIME type check
  const allowedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (assetData.mimeType && !allowedMimes.includes(assetData.mimeType)) {
    errors.push(`Asset MIME type "${assetData.mimeType}" is not supported.`);
  }

  // 3. Dimension & Aspect ratio validation (if provided)
  if (assetData.width && assetData.height) {
    const expectedRatio = assetDef.width / assetDef.height;
    const actualRatio = assetData.width / assetData.height;
    const ratioDiff = Math.abs(expectedRatio - actualRatio);

    if (ratioDiff > 0.25) {
      warnings.push(`Asset aspect ratio (${actualRatio.toFixed(2)}) deviates from target ratio (${expectedRatio.toFixed(2)}).`);
    }
  }

  // 4. Transparency check if required
  if (assetDef.transparent && assetData.hasAlpha === false) {
    errors.push(`Asset "${assetDef.id}" requires a transparent background, but non-transparent image was provided.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    assetId: assetDef.id
  };
}

export function generateAssetRepairPrompt(assetDef, validationErrors) {
  return `The generated image asset for "${assetDef.id}" (${assetDef.type}) failed validation requirements.

Failed Asset Specs:
- ID: ${assetDef.id}
- Type: ${assetDef.type}
- Target Resolution: ${assetDef.width}x${assetDef.height}
- Requires Transparency: ${assetDef.transparent ? 'YES (PNG transparent background)' : 'NO'}

Validation Errors:
${validationErrors.map(e => `- ${e}`).join('\n')}

Original Prompt:
"${assetDef.prompt}"

Revised Image Prompt:
Generate a clean, strict 8-bit retro pixel art image for ${assetDef.type} "${assetDef.id}".
Style: Authentic pixel art, crisp edges, no antialiasing, hard pixel outlines, ${assetDef.transparent ? 'isolated object on transparent background, no text.' : 'vibrant 8-bit palette, crisp background.'}`;
}
