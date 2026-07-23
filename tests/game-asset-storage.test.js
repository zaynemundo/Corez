import { describe, it, expect } from 'vitest';
import { MemoryStorageAdapter, AssetStorageService } from '../src/services/gamePipeline/assetStorage.js';
import { validateAsset, generateAssetRepairPrompt } from '../src/services/gamePipeline/assetValidator.js';

describe('Asset Storage & Validation Pipeline', () => {
  it('persists and retrieves data URLs using MemoryStorageAdapter', async () => {
    const adapter = new MemoryStorageAdapter();
    const service = new AssetStorageService(adapter);

    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await service.fetchAndPersistAsset('job_1', 'player', testDataUrl, 'image/png');

    expect(result.assetId).toBe('player');
    expect(result.permanentUrl).toContain('data:image/png;base64');
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('validates asset specifications correctly', () => {
    const assetDef = {
      id: 'player',
      type: 'player',
      width: 64,
      height: 64,
      transparent: true,
      prompt: '8-bit knight'
    };

    const validData = {
      sizeBytes: 1024,
      mimeType: 'image/png',
      width: 64,
      height: 64,
      hasAlpha: true
    };

    const valResult = validateAsset(assetDef, validData);
    expect(valResult.valid).toBe(true);

    const invalidData = {
      sizeBytes: 10 * 1024 * 1024, // 10MB > 5MB max
      mimeType: 'text/plain',
      width: 64,
      height: 64,
      hasAlpha: false
    };

    const invalidResult = validateAsset(assetDef, invalidData);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('generates asset repair prompt when validation fails', () => {
    const assetDef = {
      id: 'background',
      type: 'background',
      width: 960,
      height: 540,
      transparent: false,
      prompt: 'dungeon background'
    };

    const errors = ['File size exceeds 5MB limit'];
    const repairPrompt = generateAssetRepairPrompt(assetDef, errors);

    expect(repairPrompt).toContain('The generated image asset for "background"');
    expect(repairPrompt).toContain('File size exceeds 5MB limit');
  });
});
