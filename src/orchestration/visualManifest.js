/**
 * CoreZ Visual Manifest Handler
 * Structured JSON asset manifest for visual pipelines (FLUX 1 image generation & MiMo V2.5 layout direction).
 */

export function createAssetManifest(spec = {}) {
  const gameSpec = spec.gameSpec || spec.appSpec || {};
  const assetManifest = Array.isArray(spec.assetManifest) ? spec.assetManifest : [];

  return {
    gameSpec,
    assetManifest: assetManifest.map(asset => ({
      id: asset.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: asset.type || 'background', // 'background' | 'character' | 'icon' | 'ui'
      prompt: asset.prompt || 'Cyberpunk dark mode UI background',
      width: asset.width || 1536,
      height: asset.height || 1024
    }))
  };
}

export function validateAssetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (!Array.isArray(manifest.assetManifest)) return false;
  return manifest.assetManifest.every(a => (
    typeof a.id === 'string'
    && typeof a.type === 'string'
    && typeof a.prompt === 'string'
    && typeof a.width === 'number'
    && typeof a.height === 'number'
  ));
}
