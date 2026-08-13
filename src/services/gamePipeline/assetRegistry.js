/**
 * Central Asset Registry & Preloader Snippet Generator
 * Builds centralized ASSET_MANIFEST structures and preloader code with neutral procedural fallbacks.
 */

export function buildAssetRegistry(assetsMap) {
  const registry = {};
  for (const [id, info] of Object.entries(assetsMap)) {
    registry[id] = {
      src: info.permanentUrl || info.originalUrl,
      type: 'image',
      width: info.width || 64,
      height: info.height || 64,
      transparent: info.transparent || false
    };
  }
  return registry;
}

export function generatePreloaderScript(registryObj) {
  const jsonManifest = JSON.stringify(registryObj, null, 2);

  return `
// Centralized Asset Registry & Reusable Preloader System
const ASSET_MANIFEST = ${jsonManifest};
const LOADED_ASSETS = {};
let ASSET_LOAD_PROGRESS = 0;

function createProceduralFallback(id, type, width = 64, height = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = type === 'background' ? '#1e1e2f' : type === 'enemy' ? '#e74c3c' : '#3498db';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(id.slice(0, 8), width / 2, height / 2);

  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

function loadAllAssets(onProgress) {
  const assetKeys = Object.keys(ASSET_MANIFEST);
  if (assetKeys.length === 0) {
    return Promise.resolve(LOADED_ASSETS);
  }

  let loadedCount = 0;
  const promises = assetKeys.map(key => {
    return new Promise(resolve => {
      const item = ASSET_MANIFEST[key];
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        LOADED_ASSETS[key] = img;
        loadedCount++;
        ASSET_LOAD_PROGRESS = Math.round((loadedCount / assetKeys.length) * 100);
        if (onProgress) onProgress(ASSET_LOAD_PROGRESS, key);
        resolve(img);
      };

      img.onerror = () => {
        console.warn(\`Asset "\${key}" failed to load from \${item.src}. Using procedural fallback.\`);
        const fallbackImg = createProceduralFallback(key, item.type, item.width, item.height);
        LOADED_ASSETS[key] = fallbackImg;
        loadedCount++;
        ASSET_LOAD_PROGRESS = Math.round((loadedCount / assetKeys.length) * 100);
        if (onProgress) onProgress(ASSET_LOAD_PROGRESS, key);
        resolve(fallbackImg);
      };

      img.src = item.src;
    });
  });

  return Promise.all(promises).then(() => LOADED_ASSETS);
}

`;
}
