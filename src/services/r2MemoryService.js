/**
 * R2-Backed Mem0 Persistent Memory Service
 * Provides long-term memory persistence for storing facts, user preferences, entity context,
 * and conversation memories directly in Cloudflare R2 (ASSET_BUCKET).
 */

export async function storeMemoryInR2(userId, memoryData) {
  if (!userId) throw new Error('userId is required to store memory.');
  const response = await fetch('/api/memory/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      key: memoryData.key,
      category: memoryData.category || 'general',
      text: memoryData.text || memoryData.value || '',
      tags: memoryData.tags || [],
      metadata: memoryData.metadata || {}
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to store memory in R2 (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function listUserMemoriesInR2(userId) {
  if (!userId) return [];
  const response = await fetch(`/api/memory/${encodeURIComponent(userId)}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.memories) ? data.memories : [];
}

export async function searchMemoriesInR2(userId, query, category = '') {
  if (!userId) return [];
  const response = await fetch('/api/memory/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, query, category })
  });

  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.matches) ? data.matches : [];
}

export async function deleteMemoryFromR2(userId, key) {
  if (!userId || !key) return false;
  const response = await fetch(`/api/memory/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  });
  return response.ok;
}
