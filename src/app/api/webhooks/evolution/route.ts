import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { reopenClosedConversation } from '@/lib/conversations/reopen';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { dispatchInboundToFlows } from '@/lib/flows/engine';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _adminClient;
}

/**
 * Clean phone number from WhatsApp JID (e.g. 5511999999999@s.whatsapp.net -> +5511999999999).
 */
function cleanJidToPhone(jid?: string): string {
  if (!jid) return '';
  const cleaned = jid.split('@')[0].replace(/\D/g, '');
  return cleaned ? `+${cleaned}` : '';
}

/**
 * POST /api/webhooks/evolution
 * Inbound webhook receiver for Evolution API events (MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED).
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const event = payload.event?.toUpperCase() || payload.type?.toUpperCase() || '';
    const instanceName = payload.instance || payload.instanceName || '';
    const data = payload.data || {};

    const admin = supabaseAdmin();

    // Look up which account owns this instance
    let accountId: string | null = null;
    let fallbackUserId: string | null = null;

    if (instanceName) {
      const { data: configRow } = await admin
        .from('evolution_config')
        .select('account_id, user_id')
        .eq('instance_name', instanceName)
        .maybeSingle();

      if (configRow) {
        accountId = configRow.account_id;
        fallbackUserId = configRow.user_id;
      }
    }

    // If not found by instance name, take the first active evolution_config row
    if (!accountId) {
      const { data: anyConfig } = await admin
        .from('evolution_config')
        .select('account_id, user_id')
        .limit(1)
        .maybeSingle();

      if (anyConfig) {
        accountId = anyConfig.account_id;
        fallbackUserId = anyConfig.user_id;
      }
    }

    // 1. CONNECTION STATE UPDATE
    if (event.includes('CONNECTION') || event === 'CONNECTION_UPDATE') {
      const state = data?.state || payload.state;
      if (accountId && state) {
        const isConnected = state === 'open' || state === 'connected';
        await admin
          .from('evolution_config')
          .update({
            status: isConnected ? 'connected' : 'disconnected',
            connected_at: isConnected ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', accountId);
      }
      return NextResponse.json({ ok: true, handled: 'CONNECTION_UPDATE' });
    }

    // 2. INCOMING / OUTGOING MESSAGES (MESSAGES_UPSERT / MESSAGES_UPDATE)
    if (event === 'MESSAGES_UPSERT' || event === 'MESSAGES_UPDATE' || event === 'SEND_MESSAGE') {
      if (!accountId || !fallbackUserId) {
        return NextResponse.json({ ok: true, ignored: 'no_matching_account' });
      }

      // In Evolution API v1 / v2, message data is inside data or data.messages[0]
      const msgItem = Array.isArray(data) ? data[0] : data?.message || data;
      const key = msgItem?.key || data?.key || {};
      const fromMe = key.fromMe ?? false;
      const remoteJid = key.remoteJid || '';

      // Skip status broadcast messages or group messages if desired
      if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
        return NextResponse.json({ ok: true, ignored: 'group_or_status' });
      }

      const phone = cleanJidToPhone(remoteJid);
      if (!phone) {
        return NextResponse.json({ ok: true, ignored: 'no_phone' });
      }

      const pushName = msgItem?.pushName || data?.pushName || undefined;

      // Extract message content
      const msgContent = msgItem?.message || data?.message || {};
      let text =
        msgContent?.conversation ||
        msgContent?.extendedTextMessage?.text ||
        msgContent?.imageMessage?.caption ||
        msgContent?.videoMessage?.caption ||
        msgContent?.documentMessage?.caption ||
        '';

      let contentType: 'text' | 'image' | 'audio' | 'video' | 'document' = 'text';
      let mediaUrl: string | undefined = undefined;

      if (msgContent?.imageMessage) {
        contentType = 'image';
        mediaUrl = msgContent.imageMessage.url;
      } else if (msgContent?.audioMessage) {
        contentType = 'audio';
        mediaUrl = msgContent.audioMessage.url;
      } else if (msgContent?.videoMessage) {
        contentType = 'video';
        mediaUrl = msgContent.videoMessage.url;
      } else if (msgContent?.documentMessage) {
        contentType = 'document';
        mediaUrl = msgContent.documentMessage.url;
      }

      if (!text && !mediaUrl) {
        text = 'Media message';
      }

      const wamid = key.id || `evo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const normalized = normalizePhone(phone);

      // Find or create Contact
      let contactId: string | null = null;
      const existing = await findExistingContact(admin, accountId, {
        phone,
        phoneNormalized: normalized,
      });

      if (existing) {
        contactId = existing.id;
        if (pushName && !existing.name) {
          await admin
            .from('contacts')
            .update({ name: pushName, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      } else {
        const { data: newContact } = await admin
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: fallbackUserId,
            phone,
            name: pushName || phone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        contactId = newContact?.id || null;
      }

      if (!contactId) {
        return NextResponse.json({ ok: false, error: 'Failed to resolve contact' }, { status: 500 });
      }

      // Find or create Conversation
      const { data: conv } = await admin
        .from('conversations')
        .select('id, status, unread_count, assigned_agent_id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle();

      let conversationId = conv?.id;
      if (!conversationId) {
        const { data: newConv } = await admin
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: fallbackUserId,
            contact_id: contactId,
            status: 'open',
            unread_count: fromMe ? 0 : 1,
            last_message_text: text,
            last_message_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        conversationId = newConv?.id;
      } else {
        // Reopen if closed and incoming
        if (!fromMe && conv.status === 'closed') {
          await reopenClosedConversation(admin, conversationId, accountId);
        }

        await admin
          .from('conversations')
          .update({
            last_message_text: text,
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? (conv.unread_count || 0) : (conv.unread_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }

      // Check if message already exists
      const { data: existingMsg } = await admin
        .from('messages')
        .select('id')
        .eq('wamid', wamid)
        .maybeSingle();

      if (!existingMsg && conversationId) {
        const { data: insertedMsg } = await admin
          .from('messages')
          .insert({
            account_id: accountId,
            conversation_id: conversationId,
            user_id: fallbackUserId,
            wamid,
            sender_type: fromMe ? 'agent' : 'customer',
            content_type: contentType,
            content_text: text,
            media_url: mediaUrl,
            status: fromMe ? 'sent' : 'delivered',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        // If incoming from customer, trigger automations, flows, and AI reply
        if (!fromMe && insertedMsg) {
          try {
            await runAutomationsForTrigger({
              triggerType: 'message_received',
              accountId,
              contactId,
              conversationId,
              messageId: insertedMsg.id,
              messageText: text,
            });
          } catch (e) {
            console.error('[Evolution Webhook] Automation error:', e);
          }

          try {
            await dispatchInboundToFlows({
              accountId,
              contactId,
              conversationId,
              messageId: insertedMsg.id,
              text,
            });
          } catch (e) {
            console.error('[Evolution Webhook] Flows error:', e);
          }

          try {
            await dispatchInboundToAiReply({
              accountId,
              contactId,
              conversationId,
              incomingMessage: text,
            });
          } catch (e) {
            console.error('[Evolution Webhook] AI reply error:', e);
          }

          try {
            await dispatchWebhookEvent(accountId, 'message.received', {
              message_id: insertedMsg.id,
              conversation_id: conversationId,
              contact_id: contactId,
              text,
              phone,
            });
          } catch (e) {
            console.error('[Evolution Webhook] Webhook dispatch error:', e);
          }
        }
      }

      return NextResponse.json({ ok: true, handled: 'message_processed' });
    }

    return NextResponse.json({ ok: true, event });
  } catch (err: unknown) {
    console.error('[Evolution Webhook Error]:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
