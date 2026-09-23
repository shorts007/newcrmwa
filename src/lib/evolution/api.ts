import type { EvolutionInstanceState } from '@/types/evolution';

function sanitizeUrl(url: string): string {
  return url.replace(/\/+$/, '').trim();
}

function getHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: apiKey.trim(),
  };
}

/**
 * Test server connectivity and API key by fetching instance list or ping.
 */
export async function testEvolutionConnection(
  serverUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; message?: string; instancesCount?: number }> {
  const base = sanitizeUrl(serverUrl);
  try {
    const res = await fetch(`${base}/instance/fetchInstances`, {
      method: 'GET',
      headers: getHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Invalid API Key. Please verify your Evolution API key.' };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, message: `Server returned HTTP ${res.status}: ${errText || res.statusText}` };
    }

    const data = await res.json().catch(() => []);
    const instancesCount = Array.isArray(data) ? data.length : 0;
    return { ok: true, instancesCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not reach Evolution API server';
    return { ok: false, message };
  }
}

/**
 * Fetch instance connection state and profile info.
 */
export async function fetchEvolutionInstanceState(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<EvolutionInstanceState> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());

  try {
    const res = await fetch(`${base}/instance/connectionState/${inst}`, {
      method: 'GET',
      headers: getHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // If 404, instance might not exist yet
      if (res.status === 404) {
        return {
          instanceName,
          state: 'close',
        };
      }
      return {
        instanceName,
        state: 'unknown',
      };
    }

    const data = await res.json();
    const rawState = data?.instance?.state || data?.state || 'unknown';

    let state: EvolutionInstanceState['state'] = 'unknown';
    if (rawState === 'open' || rawState === 'connected') state = 'open';
    else if (rawState === 'connecting') state = 'connecting';
    else if (rawState === 'close' || rawState === 'disconnected') state = 'close';
    else if (rawState === 'refused') state = 'refused';

    return {
      instanceName,
      state,
      owner: data?.instance?.owner || data?.owner || null,
      profileName: data?.instance?.profileName || data?.profileName || null,
      profilePictureUrl: data?.instance?.profilePictureUrl || data?.profilePictureUrl || null,
      number: data?.instance?.number || data?.number || null,
    };
  } catch (err) {
    console.error('[Evolution API] fetchInstanceState failed:', err);
    return {
      instanceName,
      state: 'unknown',
    };
  }
}

/**
 * Create a new WhatsApp instance in Evolution API.
 */
export async function createEvolutionInstance(
  serverUrl: string,
  apiKey: string,
  options: {
    instanceName: string;
    token?: string;
    rejectCalls?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    webhookUrl?: string;
  },
): Promise<{ ok: boolean; instance?: Record<string, unknown>; qrcode?: Record<string, unknown>; error?: string }> {
  const base = sanitizeUrl(serverUrl);
  const body = {
    instanceName: options.instanceName.trim(),
    token: options.token?.trim() || undefined,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    rejectCall: options.rejectCalls ?? false,
    msgCall: options.rejectCalls ? 'Sorry, we do not accept calls on this number.' : undefined,
    groupsIgnore: false,
    alwaysOnline: options.alwaysOnline ?? true,
    readMessages: options.readMessages ?? false,
    readStatus: false,
    syncFullHistory: false,
    ...(options.webhookUrl
      ? {
          webhook: {
            url: options.webhookUrl,
            byEvents: false,
            base64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'SEND_MESSAGE',
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED',
            ],
          },
        }
      : {}),
  };

  try {
    const res = await fetch(`${base}/instance/create`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // If already exists, return ok with warning or proceed
      const msg = data?.response?.message || data?.message || data?.error || res.statusText;
      return { ok: false, error: Array.isArray(msg) ? msg.join(', ') : String(msg) };
    }

    return {
      ok: true,
      instance: data?.instance || data,
      qrcode: data?.qrcode || data?.hash,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to create instance' };
  }
}

/**
 * Connect instance and retrieve latest QR Code.
 */
export async function connectEvolutionInstance(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{
  ok: boolean;
  base64?: string;
  code?: string;
  pairingCode?: string;
  count?: number;
  error?: string;
}> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());

  try {
    const res = await fetch(`${base}/instance/connect/${inst}`, {
      method: 'GET',
      headers: getHeaders(apiKey),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || data?.error || res.statusText };
    }

    return {
      ok: true,
      base64: data?.base64 || data?.qrcode?.base64,
      code: data?.code || data?.qrcode?.code,
      pairingCode: data?.pairingCode,
      count: data?.count,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to connect instance' };
  }
}

/**
 * Restart WhatsApp instance.
 */
export async function restartEvolutionInstance(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());

  try {
    // Try POST or PUT /instance/restart/{instance}
    let res = await fetch(`${base}/instance/restart/${inst}`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      res = await fetch(`${base}/instance/restart/${inst}`, {
        method: 'PUT',
        headers: getHeaders(apiKey),
        signal: AbortSignal.timeout(15000),
      });
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.message || data?.error || res.statusText };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to restart instance' };
  }
}

/**
 * Disconnect / Logout instance session.
 */
export async function logoutEvolutionInstance(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ ok: boolean; error?: string }> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());

  try {
    const res = await fetch(`${base}/instance/logout/${inst}`, {
      method: 'DELETE',
      headers: getHeaders(apiKey),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.message || data?.error || res.statusText };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to logout instance' };
  }
}

/**
 * Configure Webhook in Evolution API.
 */
export async function setEvolutionWebhook(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
  events: string[] = [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'SEND_MESSAGE',
    'CONNECTION_UPDATE',
    'QRCODE_UPDATED',
  ],
): Promise<{ ok: boolean; error?: string }> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());

  const body = {
    webhook: {
      enabled: true,
      url: webhookUrl.trim(),
      byEvents: false,
      base64: false,
      events,
    },
  };

  try {
    const res = await fetch(`${base}/webhook/set/${inst}`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.message || data?.error || res.statusText };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to set webhook' };
  }
}

/**
 * Send text message via Evolution API.
 */
export async function sendEvolutionTextMessage(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
  toPhone: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const base = sanitizeUrl(serverUrl);
  const inst = encodeURIComponent(instanceName.trim());
  const formattedNumber = toPhone.replace(/\D/g, '');

  const body = {
    number: formattedNumber,
    text: text,
    delay: 1200,
    linkPreview: true,
  };

  try {
    const res = await fetch(`${base}/message/sendText/${inst}`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || data?.error || res.statusText };
    }

    const messageId = data?.key?.id || data?.id;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send text message' };
  }
}
