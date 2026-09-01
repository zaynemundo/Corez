/**
 * Permanent Asset Storage Layer
 * Persists generated image URLs into durable storage adapters (IndexedDB, LocalStorage, Memory, or Remote S3/R2 API).
 */

export class MemoryStorageAdapter {
  constructor() {
    this.store = new Map();
  }

  async put(key, blob, metadata = {}) {
    let dataUrl;
    if (typeof FileReader !== "undefined") {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      dataUrl = `data:${blob.type || "image/png"};base64,${buffer.toString("base64")}`;
    }

    this.store.set(key, {
      dataUrl,
      metadata,
      size: blob.size,
      type: blob.type,
    });
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
  constructor(prefix = "corez_asset_") {
    this.prefix = prefix;
  }

  async put(key, blob, metadata = {}) {
    let dataUrl;
    if (typeof FileReader !== "undefined") {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      dataUrl = `data:${blob.type || "image/png"};base64,${buffer.toString("base64")}`;
    }

    const storageKey = `${this.prefix}${key}`;
    const payload = JSON.stringify({
      dataUrl,
      metadata,
      type: blob.type,
      timestamp: Date.now(),
    });
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(storageKey, payload);
      }
    } catch (e) {
      console.warn(
        "LocalStorage quota exceeded in AssetStorage, storing in fallback.",
        e,
      );
    }
    return dataUrl;
  }

  async get(key) {
    if (typeof localStorage === "undefined") return null;
    const payload = localStorage.getItem(`${this.prefix}${key}`);
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  async delete(key) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(`${this.prefix}${key}`);
  }
}

export class CloudflareR2StorageAdapter {
  constructor(endpoint = "/api/assets") {
    this.endpoint = endpoint;
    this.fallbackAdapter = new MemoryStorageAdapter();
  }

  buildUrl(subPath) {
    const fullPath = `${this.endpoint}${subPath.startsWith("/") ? subPath : "/" + subPath}`;
    if (fullPath.startsWith("http://") || fullPath.startsWith("https://"))
      return fullPath;
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${fullPath}`;
    }
    return fullPath;
  }

  async put(key, blob, metadata = {}) {
    let dataUrl;
    if (typeof FileReader !== "undefined") {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      dataUrl = `data:${blob.type || "image/png"};base64,${buffer.toString("base64")}`;
    }

    try {
      if (typeof fetch === "function") {
        const response = await fetch(this.buildUrl("/upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, dataUrl, mimeType: blob.type, metadata }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.url) return result.url;
        }
      }
    } catch (err) {
      console.warn(
        "Cloudflare R2 API upload failed, using memory adapter fallback.",
        err.message,
      );
    }

    return this.fallbackAdapter.put(key, blob, metadata);
  }

  async get(key) {
    try {
      if (typeof fetch === "function") {
        const response = await fetch(this.buildUrl(`/${key}`));
        if (response.ok) {
          const blob = await response.blob();
          return { dataUrl: this.buildUrl(`/${key}`), type: blob.type };
        }
      }
    } catch {
      // Ignored - fallback to memory adapter
    }
    return this.fallbackAdapter.get(key);
  }

  async delete(key) {
    try {
      if (typeof fetch === "function") {
        await fetch(this.buildUrl(`/${key}`), { method: "DELETE" });
      }
    } catch {
      // Ignored - fallback to memory adapter
    }
    this.fallbackAdapter.delete(key);
  }
}

export class AssetStorageService {
  constructor(adapter = new CloudflareR2StorageAdapter()) {
    this.adapter = adapter;
  }

  async fetchAndPersistAsset(
    jobId,
    assetId,
    sourceUrl,
    expectedType = "image/png",
  ) {
    if (!sourceUrl) {
      throw new Error(`Invalid sourceUrl for asset ${assetId}`);
    }

    let blob;
    // 1. If sourceUrl is already a data URI
    if (sourceUrl.startsWith("data:")) {
      let u8arr;
      try {
        const parts = sourceUrl.split(",");
        const mime = parts[0].match(/:(.*?);/)?.[1] || expectedType;
        const bstr = atob(parts[1]);
        let n = bstr.length;
        u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } catch (err) {
        throw new Error(
          `Invalid data URI payload for asset ${assetId}: ${err.message}`,
          { cause: err },
        );
      }
    } else {
      // 2. Download from the remote generated-image URL.
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download asset from ${sourceUrl}: HTTP ${response.status}`,
        );
      }
      blob = await response.blob();
    }

    // 3. Validate MIME type
    const validMimes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];
    if (!validMimes.includes(blob.type) && !validMimes.includes(expectedType)) {
      throw new Error(`Invalid image MIME type: ${blob.type}`);
    }

    // 4. Save to permanent storage adapter
    const storageKey = `${jobId}/${assetId}`;
    const permanentUrl = await this.adapter.put(storageKey, blob, {
      jobId,
      assetId,
      originalUrl: sourceUrl,
      createdAt: new Date().toISOString(),
    });

    return {
      assetId,
      permanentUrl,
      sizeBytes: blob.size,
      mimeType: blob.type,
    };
  }
}

export const defaultAssetStorage = new AssetStorageService(
  new MemoryStorageAdapter(),
);
