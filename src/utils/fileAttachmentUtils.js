export const MAX_IMAGE_THUMB_BYTES = 1.5 * 1024 * 1024; // 1.5 MiB
export const MAX_TEXT_CONTENT_BYTES = 200 * 1024; // 200 KiB

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'htm',
  'xml', 'svg', 'csv', 'log', 'py', 'yml', 'yaml', 'sh', 'bash', 'sql', 'ini',
  'toml', 'env', 'gitignore', 'config', 'rst', 'tex', 'bat', 'ps1', 'c', 'cpp',
  'h', 'hpp', 'java', 'rs', 'go', 'php', 'rb', 'lua', 'dart', 'vue', 'svelte'
]);

export function extensionOf(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isTextLike(file) {
  return Boolean(file?.type?.startsWith('text/'))
    || (file?.type === 'application/json')
    || TEXT_EXTENSIONS.has(extensionOf(file?.name));
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function hasFiles(dataTransfer) {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return types.includes('Files') || types.includes('application/x-moz-file');
}

/**
 * Process a collection of files into attachment entries with unique IDs,
 * reading image thumbnails and text contents asynchronously.
 *
 * @param {FileList | File[]} fileList
 * @param {Function} setAttachments
 * @returns {Array} List of newly created attachment metadata entries
 */
export function processFiles(fileList, setAttachments) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return [];

  const created = files.map((file, index) => {
    const id = `attach-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, name: file.name, type: file.type || '', size: file.size, file };
  });

  setAttachments((prev) => [
    ...(prev || []),
    ...created.map(({ id, name, type, size }) => ({ id, name, type, size }))
  ]);

  created.forEach((entry) => {
    if (entry.file?.type?.startsWith('image/') && entry.file.size <= MAX_IMAGE_THUMB_BYTES) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          const thumb = reader.result;
          setAttachments((prev) => (prev || []).map((a) => (a.id === entry.id ? { ...a, thumb } : a)));
          // Also upload to R2 for persistent URL (used in generated HTML and publishing)
          // Fire-and-forget: store assetUrl when upload succeeds, keep thumb as fallback
          const ext = extensionOf(entry.name) || 'jpg';
          const safeName = entry.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || `image.${ext}`;
          const key = `user-upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
          const mimeType = entry.file.type || `image/${ext}`;
          // Use data URL directly for upload; worker will validate and store
          fetch('/api/assets/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, dataUrl: thumb, mimeType })
          }).then(async (res) => {
            if (!res.ok) return;
            const data = await res.json().catch(() => null);
            if (data?.url) {
              setAttachments((prev) => (prev || []).map((a) => (a.id === entry.id ? { ...a, assetUrl: data.url, assetKey: data.key } : a)));
            }
          }).catch(() => {/* R2 not configured or upload failed — keep thumb as fallback */});
        }
      };
      reader.readAsDataURL(entry.file);
    }
    if (isTextLike(entry.file) && entry.file.size <= MAX_TEXT_CONTENT_BYTES) {
      readFileAsText(entry.file).then((content) => {
        setAttachments((prev) => (prev || []).map((a) => (a.id === entry.id ? { ...a, content } : a)));
      }).catch(() => {});
    }
  });

  return created;
}
