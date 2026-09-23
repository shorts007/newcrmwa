import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  testEvolutionConnection,
  fetchEvolutionInstanceState,
  createEvolutionInstance,
  connectEvolutionInstance,
  restartEvolutionInstance,
  logoutEvolutionInstance,
  setEvolutionWebhook,
} from '@/lib/evolution/api';

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
 * POST /api/evolution/instance
 * Perform instance actions (create, connect/qr, restart, logout, set-webhook, state).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { user, accountId } = await resolveAccountAndUser(supabase);
    if (!user || !accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, server_url, api_key, instance_name, instance_token, webhook_url } = body;

    const admin = supabaseAdmin();
    let effectiveServerUrl = server_url?.replace(/\/+$/, '').trim();
    let effectiveInstanceName = instance_name?.trim();
    let effectiveApiKey = api_key?.trim();

    // If credentials are not passed or are masked, read from saved config in DB
    if (
      !effectiveServerUrl ||
      !effectiveInstanceName ||
      !effectiveApiKey ||
      effectiveApiKey === MASKED_KEY
    ) {
      const { data: saved } = await admin
        .from('evolution_config')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();

      if (saved) {
        effectiveServerUrl = effectiveServerUrl || saved.server_url;
        effectiveInstanceName = effectiveInstanceName || saved.instance_name;
        if (!effectiveApiKey || effectiveApiKey === MASKED_KEY) {
          try {
            effectiveApiKey = decrypt(saved.api_key);
          } catch {
            return NextResponse.json(
              { error: 'Could not decrypt stored API key. Please re-enter it.' },
              { status: 400 },
            );
          }
        }
      }
    }

    if (!effectiveServerUrl || !effectiveApiKey || !effectiveInstanceName) {
      return NextResponse.json(
        { error: 'Server URL, API Key, and Instance Name are required.' },
        { status: 400 },
      );
    }

    // 1. TEST ACTION
    if (action === 'test') {
      const result = await testEvolutionConnection(effectiveServerUrl, effectiveApiKey);
      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        message: 'Evolution API server is reachable and API key is valid.',
        instancesCount: result.instancesCount,
      });
    }

    // 2. STATE ACTION
    if (action === 'state') {
      const state = await fetchEvolutionInstanceState(
        effectiveServerUrl,
        effectiveApiKey,
        effectiveInstanceName,
      );
      return NextResponse.json({ ok: true, state });
    }

    // 3. CREATE INSTANCE
    if (action === 'create') {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        request.headers.get('origin') ||
        '';
      const defaultWebhookUrl = origin
        ? `${origin.replace(/\/+$/, '')}/api/webhooks/evolution`
        : '';

      const createRes = await createEvolutionInstance(
        effectiveServerUrl,
        effectiveApiKey,
        {
          instanceName: effectiveInstanceName,
          token: instance_token,
          webhookUrl: webhook_url || defaultWebhookUrl,
        },
      );

      if (!createRes.ok) {
        return NextResponse.json({ error: createRes.error }, { status: 400 });
      }

      return NextResponse.json({ ok: true, data: createRes });
    }

    // 4. CONNECT / QR CODE
    if (action === 'connect' || action === 'qrcode') {
      // First ensure instance exists or trigger connect
      const connectRes = await connectEvolutionInstance(
        effectiveServerUrl,
        effectiveApiKey,
        effectiveInstanceName,
      );

      if (!connectRes.ok) {
        // If not found, try creating it automatically
        if (
          connectRes.error?.toLowerCase().includes('not found') ||
          connectRes.error?.toLowerCase().includes('does not exist')
        ) {
          const createAttempt = await createEvolutionInstance(
            effectiveServerUrl,
            effectiveApiKey,
            {
              instanceName: effectiveInstanceName,
            },
          );
          if (createAttempt.ok) {
            const retryConnect = await connectEvolutionInstance(
              effectiveServerUrl,
              effectiveApiKey,
              effectiveInstanceName,
            );
            return NextResponse.json({ ...retryConnect });
          }
        }
        return NextResponse.json({ error: connectRes.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        base64: connectRes.base64,
        code: connectRes.code,
        pairingCode: connectRes.pairingCode,
        count: connectRes.count,
      });
    }

    // 5. RESTART
    if (action === 'restart') {
      const res = await restartEvolutionInstance(
        effectiveServerUrl,
        effectiveApiKey,
        effectiveInstanceName,
      );
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: 'Instance restarted successfully.' });
    }

    // 6. LOGOUT / DISCONNECT
    if (action === 'logout' || action === 'disconnect') {
      const res = await logoutEvolutionInstance(
        effectiveServerUrl,
        effectiveApiKey,
        effectiveInstanceName,
      );
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      // Update status in DB
      await admin
        .from('evolution_config')
        .update({
          status: 'disconnected',
          phone_number: null,
          connected_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId);

      return NextResponse.json({
        ok: true,
        message: 'Instance logged out and disconnected.',
      });
    }

    // 7. SET WEBHOOK
    if (action === 'set-webhook') {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        request.headers.get('origin') ||
        '';
      const targetWebhook =
        webhook_url || (origin ? `${origin.replace(/\/+$/, '')}/api/webhooks/evolution` : '');

      if (!targetWebhook) {
        return NextResponse.json(
          { error: 'Webhook URL could not be determined.' },
          { status: 400 },
        );
      }

      const res = await setEvolutionWebhook(
        effectiveServerUrl,
        effectiveApiKey,
        effectiveInstanceName,
        targetWebhook,
      );

      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      await admin
        .from('evolution_config')
        .update({
          webhook_url: targetWebhook,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId);

      return NextResponse.json({
        ok: true,
        message: `Webhook configured successfully to ${targetWebhook}`,
        webhookUrl: targetWebhook,
      });
    }

    return NextResponse.json(
      { error: `Unsupported action "${action}"` },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error('[evolution/instance] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Instance action failed' },
      { status: 500 },
    );
  }
}
