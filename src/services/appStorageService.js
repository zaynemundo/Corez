/**
 * Service for storing and managing multi-app artifacts in Cloudflare R2 bucket.
 * Each chat session can store multiple apps. When a chat session is deleted,
 * its associated R2 app storage is completely cleaned up.
 */

const API_APPS_ENDPOINT = '/api/apps';

/**
 * Stores or updates an app artifact in Cloudflare R2 bucket.
 */
export async function storeAppInR2({ sessionId, appId, title = 'Untitled Application', code = '', html = '', metadata = {} }) {
  if (!sessionId) return null;
  const payload = {
    sessionId,
    appId: appId || `app_${Date.now()}`,
    title,
    code,
    html,
    metadata
  };

  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return await res.json();
    }
    console.warn(`R2 app storage failed with HTTP ${res.status}.`);
  } catch (err) {
    console.warn('R2 app storage request failed, falling back to local session state:', err);
  }
  return { success: false, ...payload };
}

/**
 * Lists all apps stored in R2 for a specific chat session.
 */
export async function listSessionAppsInR2(sessionId) {
  if (!sessionId) return [];
  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}`);
    if (res.ok) {
      const data = await res.json();
      return data?.apps || [];
    }
  } catch (err) {
    console.warn('Failed to list session apps from R2:', err);
  }
  return [];
}

/**
 * Retrieves a specific app from R2.
 */
export async function getAppFromR2(sessionId, appId) {
  if (!sessionId || !appId) return null;
  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(appId)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch app from R2:', err);
  }
  return null;
}

/**
 * Deletes all R2 stored apps associated with a chat session when the session is deleted.
 */
export async function deleteSessionAppsInR2(sessionId) {
  if (!sessionId) return false;
  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      return data?.success || false;
    }
  } catch (err) {
    console.warn('Failed to delete R2 apps for session:', err);
  }
  return false;
}

/**
 * Deletes a specific app from R2.
 */
export async function deleteAppInR2(sessionId, appId) {
  if (!sessionId || !appId) return false;
  try {
    const res = await fetch(`${API_APPS_ENDPOINT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(appId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      return data?.success || false;
    }
  } catch (err) {
    console.warn('Failed to delete app from R2:', err);
  }
  return false;
}
