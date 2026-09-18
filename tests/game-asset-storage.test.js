import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryStorageAdapter, CloudflareR2StorageAdapter, AssetStorageService } from '../src/services/gamePipeline/assetStorage.js';
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

  it('handles CloudflareR2StorageAdapter uploads and fallbacks gracefully', async () => {
    const r2Adapter = new CloudflareR2StorageAdapter('/api/assets');
    const service = new AssetStorageService(r2Adapter);

    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await service.fetchAndPersistAsset('job_r2', 'bg', testDataUrl, 'image/png');

    expect(result.assetId).toBe('bg');
    expect(result.permanentUrl).toBeDefined();
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

  it('rejects a blob whose actual MIME type is invalid even when expectedType is valid', async () => {
    const adapter = new MemoryStorageAdapter();
    const service = new AssetStorageService(adapter);

    const textDataUrl = 'data:text/plain;base64,aGVsbG8gd29ybGQ=';
    await expect(
      service.fetchAndPersistAsset('job_bad', 'player', textDataUrl, 'image/png'),
    ).rejects.toThrow(/Invalid image MIME type: text\/plain/);
  });

  it('falls back to expectedType only when the blob type is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: '' }),
      })),
    );
    try {
      const adapter = new MemoryStorageAdapter();
      const service = new AssetStorageService(adapter);

      const result = await service.fetchAndPersistAsset(
        'job_fallback',
        'player',
        'https://cdn.example.com/player.png',
        'image/png',
      );
      expect(result.mimeType).toBe('image/png');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
