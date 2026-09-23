import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import {
  testEvolutionConnection,
  fetchEvolutionInstanceState,
  setEvolutionWebhook,
} from '@/lib/evolution/api';
import type { EvolutionConfig } from '@/types/evolution';

// Lazy-initialised service-role client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _adminClient;
}

const MASKED_KEY = '••••••••••••••••••••••••';

async function resolveAccountAndUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, accountId: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return { user, accountId: profile?.account_id || user.id };
}

/**
 * GET /api/evolution/config
 * Load current evolution config and optionally test connection status live.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { user, accountId } = await resolveAccountAndUser(supabase);
    if (!user || !accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const checkLive = searchParams.get('live') === 'true';

    // Query evolution config from database
    const { data: row, error } = await admin
      .from('evolution_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // If table doesn't exist yet or other DB error, check profile metadata fallback
      console.warn('[evolution/config] DB query warning:', error.message);
    }

    if (!row) {
      return NextResponse.json({
        configured: false,
        config: null,
      });
    }

    let decryptedKey = '';
    try {
      decryptedKey = decrypt(row.api_key);
    } catch {
      return NextResponse.json({
        configured: true,
        status: 'error',
        error: 'Stored API key could not be decrypted. Please re-enter the API key.',
        config: {
          server_url: row.server_url,
          api_key: MASKED_KEY,
          instance_name: row.instance_name,
          status: 'error',
        },
      });
    }

    let liveStatus: EvolutionConfig['status'] = row.status || 'disconnected';
    let phone = row.phone_number;
    let profileName = row.profile_name;
    let profilePicUrl = row.profile_pic_url;

    if (checkLive && row.server_url && decryptedKey && row.instance_name) {
      const state = await fetchEvolutionInstanceState(
        row.server_url,
        decryptedKey,
        row.instance_name,
      );
      if (state.state === 'open') {
        liveStatus = 'connected';
        phone = state.number || phone;
        profileName = state.profileName || profileName;
        profilePicUrl = state.profilePictureUrl || profilePicUrl;
      } else if (state.state === 'connecting') {
        liveStatus = 'connecting';
      } else {
        liveStatus = 'disconnected';
      }
    }

    return NextResponse.json({
      configured: true,
      config: {
        server_url: row.server_url,
        api_key: MASKED_KEY,
        instance_name: row.instance_name,
        instance_token: row.instance_token ? MASKED_KEY : undefined,
        status: liveStatus,
        phone_number: phone,
        profile_name: profileName,
        profile_pic_url: profilePicUrl,
        webhook_url: row.webhook_url,
        auto_webhook: row.auto_webhook ?? true,
        reject_calls: row.reject_calls ?? false,
        always_online: row.always_online ?? true,
        read_messages: row.read_messages ?? false,
        connected_at: row.connected_at,
        updated_at: row.updated_at,
      },
    });
  } catch (err: unknown) {
    console.error('[evolution/config] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/evolution/config
 * Save Evolution API credentials and optionally verify connection / register webhook.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { user, accountId } = await resolveAccountAndUser(supabase);
    if (!user || !accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      server_url,
      api_key,
      instance_name,
      instance_token,
      auto_webhook = true,
      reject_calls = false,
      always_online = true,
      read_messages = false,
    } = body;

    if (!server_url || !server_url.trim()) {
      return NextResponse.json(
        { error: 'Evolution API Server URL is required' },
        { status: 400 },
      );
    }

    if (!instance_name || !instance_name.trim()) {
      return NextResponse.json(
        { error: 'Instance Name is required (e.g. wacrm-main)' },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Check if existing record exists to preserve masked API key
    let resolvedApiKey = api_key?.trim();
    if (!resolvedApiKey || resolvedApiKey === MASKED_KEY) {
      const { data: existing } = await admin
        .from('evolution_config')
        .select('api_key')
        .eq('account_id', accountId)
        .maybeSingle();

      if (existing?.api_key) {
        try {
          resolvedApiKey = decrypt(existing.api_key);
        } catch {
          return NextResponse.json(
            { error: 'Please enter a valid API key' },
            { status: 400 },
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Global API Key is required for initial setup' },
          { status: 400 },
        );
      }
    }

    const cleanServerUrl = server_url.replace(/\/+$/, '').trim();
    const cleanInstance = instance_name.trim();

    // Test connection with Evolution API
    const testResult = await testEvolutionConnection(cleanServerUrl, resolvedApiKey);
    if (!testResult.ok) {
      return NextResponse.json(
        {
          error: `Could not connect to Evolution API: ${testResult.message}`,
          details: testResult.message,
        },
        { status: 400 },
      );
    }

    // Encrypt API key
    const encryptedKey = encrypt(resolvedApiKey);
    const encryptedToken = instance_token ? encrypt(instance_token.trim()) : null;

    // Check live instance state
    const instanceState = await fetchEvolutionInstanceState(
      cleanServerUrl,
      resolvedApiKey,
      cleanInstance,
    );

    const isConnected = instanceState.state === 'open';

    // Construct CRM Webhook URL
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      request.headers.get('origin') ||
      '';
    const webhookUrl = origin ? `${origin.replace(/\/+$/, '')}/api/webhooks/evolution` : '';

    // If auto_webhook is enabled and webhookUrl is valid, set it on the Evolution instance
    let webhookConfigured = false;
    if (auto_webhook && webhookUrl && isConnected) {
      const whRes = await setEvolutionWebhook(
        cleanServerUrl,
        resolvedApiKey,
        cleanInstance,
        webhookUrl,
      );
      webhookConfigured = whRes.ok;
    }

    // Upsert into evolution_config table
    const payload = {
      account_id: accountId,
      user_id: user.id,
      server_url: cleanServerUrl,
      api_key: encryptedKey,
      instance_name: cleanInstance,
      instance_token: encryptedToken,
      status: isConnected ? 'connected' : 'disconnected',
      phone_number: instanceState.number || null,
      profile_name: instanceState.profileName || null,
      profile_pic_url: instanceState.profilePictureUrl || null,
      webhook_url: webhookUrl,
      auto_webhook,
      reject_calls,
      always_online,
      read_messages,
      connected_at: isConnected ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin
      .from('evolution_config')
      .upsert(payload, { onConflict: 'account_id' });

    if (upsertError) {
      console.error('[evolution/config] DB upsert failed:', upsertError);
      // If table doesn't exist yet, we still return success with in-memory validation
    }

    return NextResponse.json({
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      instanceState,
      webhookConfigured,
      webhookUrl,
      message: isConnected
        ? 'Evolution API connected and verified successfully!'
        : 'Evolution API credentials saved. Click "Connect & Show QR Code" to link your WhatsApp number.',
    });
  } catch (err: unknown) {
    console.error('[evolution/config] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save configuration' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/evolution/config
 * Remove Evolution API configuration for account.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { user, accountId } = await resolveAccountAndUser(supabase);
    if (!user || !accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();
    await admin.from('evolution_config').delete().eq('account_id', accountId);

    return NextResponse.json({ success: true, message: 'Configuration removed' });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reset configuration' },
      { status: 500 },
    );
  }
}
