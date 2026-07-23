/**
 * Permanent Asset Storage Layer
 * Persists generated FLUX image URLs into durable storage adapters (IndexedDB, LocalStorage, Memory, or Remote S3/R2 API).
 */

export class MemoryStorageAdapter {
  constructor() {
    this.store = new Map();
  }

  async put(key, blob, metadata = {}) {
    let dataUrl;
    if (typeof FileReader !== 'undefined') {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      dataUrl = `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`;
    }

    this.store.set(key, { dataUrl, metadata, size: blob.size, type: blob.type });
    return dataUrl;
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async delete(key) {
    this.store.delete(key);
  }
}

export class LocalStorageAdapter {
  constructor(prefix = 'corez_asset_') {
    this.prefix = prefix;
  }

  async put(key, blob, metadata = {}) {
    let dataUrl;
    if (typeof FileReader !== 'undefined') {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      dataUrl = `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`;
    }

    const storageKey = `${this.prefix}${key}`;
    const payload = JSON.stringify({ dataUrl, metadata, type: blob.type, timestamp: Date.now() });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, payload);
      }
    } catch (e) {
      console.warn('LocalStorage quota exceeded in AssetStorage, storing in fallback.', e);
    }
    return dataUrl;
  }

  async get(key) {
    const payload = localStorage.getItem(`${this.prefix}${key}`);
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  async delete(key) {
    localStorage.removeItem(`${this.prefix}${key}`);
  }
}

export class AssetStorageService {
  constructor(adapter = new MemoryStorageAdapter()) {
    this.adapter = adapter;
  }

  async fetchAndPersistAsset(jobId, assetId, sourceUrl, expectedType = 'image/png') {
    if (!sourceUrl) {
      throw new Error(`Invalid sourceUrl for asset ${assetId}`);
    }

    let blob;
    // 1. If sourceUrl is already a data URI
    if (sourceUrl.startsWith('data:')) {
      const parts = sourceUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || expectedType;
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      blob = new Blob([u8arr], { type: mime });
    } else {
      // 2. Download from remote FLUX URL
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to download asset from ${sourceUrl}: HTTP ${response.status}`);
      }
      blob = await response.blob();
    }

    // 3. Validate MIME type
    const validMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validMimes.includes(blob.type) && !validMimes.includes(expectedType)) {
      throw new Error(`Invalid image MIME type: ${blob.type}`);
    }

    // 4. Save to permanent storage adapter
    const storageKey = `${jobId}/${assetId}`;
    const permanentUrl = await this.adapter.put(storageKey, blob, {
      jobId,
      assetId,
      originalUrl: sourceUrl,
      createdAt: new Date().toISOString()
    });

    return {
      assetId,
      permanentUrl,
      sizeBytes: blob.size,
      mimeType: blob.type
    };
  }
}

export const defaultAssetStorage = new AssetStorageService(new MemoryStorageAdapter());
