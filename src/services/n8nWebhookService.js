/**
 * Client helper for the webhook-only n8n bridge.
 * No N8N_API_KEY needed — just a Webhook URL from your n8n workflow.
 *
 * Usage:
 *   import { triggerN8nWebhook } from './services/n8nWebhookService';
 *   await triggerN8nWebhook({ event: 'corez.publish', payload: { chatId, title, appUrl } });
 *   // or with explicit URL:
 *   await triggerN8nWebhook({ webhookUrl: 'https://your-n8n/webhook/abc', event: 'lead.captured', payload: formData });
 */

const BRIDGE = '/api/n8n/webhook';

export async function triggerN8nWebhook({ webhookUrl, event, payload } = {}) {
  const body = {};
  if (webhookUrl) body.webhookUrl = webhookUrl;
  if (event) body.event = event;
  if (payload !== undefined) body.payload = payload;

  const r = await fetch(BRIDGE, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `n8n webhook bridge failed: ${r.status}`);
    err.status = r.status;
    err.detail = data.detail || data;
    throw err;
  }
  return data;
}

// Convenience wrappers for common CoreZ events
export function onPublishTrigger({ chatId, title, appUrl, webhookUrl } = {}) {
  return triggerN8nWebhook({ webhookUrl, event: 'corez.publish', payload: { chatId, title, appUrl, at: Date.now() } });
}

export function onLeadCaptured(formData, webhookUrl) {
  return triggerN8nWebhook({ webhookUrl, event: 'corez.lead.captured', payload: formData });
}
