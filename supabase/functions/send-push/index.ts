// Sends an Expo push notification to every member of a conversation except the
// sender. Invoked by a database webhook on INSERT into macrochat_messages.
//
// Message bodies are end-to-end encrypted, so the server cannot read them. The
// payload is deliberately contentless; the app fills in detail after it opens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: string | null;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: string | null;
  priority: 'high';
  channelId: string;
  badge?: number;
  data: Record<string, unknown>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let record: MessageRow | undefined;
  try {
    ({ record } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!record?.conversation_id || !record.sender_id) {
    return json({ error: 'Missing record fields' }, 400);
  }

  const { data: members } = await supabase
    .from('macrochat_conversation_members')
    .select('user_id')
    .eq('conversation_id', record.conversation_id)
    .neq('user_id', record.sender_id);

  const recipientIds = (members ?? []).map((m) => m.user_id as string);
  if (recipientIds.length === 0) return json({ sent: 0 });

  const [{ data: prefsRows }, { data: tokenRows }, { data: sender }] = await Promise.all([
    supabase
      .from('notification_preferences')
      .select('user_id, messages, sound, badge, preview')
      .in('user_id', recipientIds),
    supabase.from('user_push_tokens').select('user_id, token').in('user_id', recipientIds),
    supabase
      .from('macrochat_profiles')
      .select('display_name')
      .eq('id', record.sender_id)
      .maybeSingle(),
  ]);

  const prefsByUser = new Map((prefsRows ?? []).map((row) => [row.user_id as string, row]));
  const senderName = (sender?.display_name as string | undefined) ?? 'MacroChat';

  const kindLabel =
    record.kind && record.kind !== 'text'
      ? `Sent ${record.kind === 'image' ? 'a photo' : record.kind === 'video' ? 'a video' : 'an attachment'}`
      : 'New message';

  const messages: ExpoPushMessage[] = [];
  for (const row of tokenRows ?? []) {
    const userId = row.user_id as string;
    const prefs = prefsByUser.get(userId);

    // Absent prefs means the user never opened settings, so fall back to "on".
    if (prefs && prefs.messages !== 'on') continue;

    const hidePreview = prefs?.preview === false;

    messages.push({
      to: row.token as string,
      title: hidePreview ? 'MacroChat' : senderName,
      body: hidePreview ? 'New message' : kindLabel,
      sound: prefs?.sound === false ? null : 'default',
      priority: 'high',
      channelId: prefs?.sound === false ? 'messages_silent' : 'messages_push',
      badge: prefs?.badge === false ? undefined : 1,
      data: { conversationId: record.conversation_id, messageId: record.id },
    });
  }

  if (messages.length === 0) return json({ sent: 0 });

  const receipts: unknown[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    receipts.push(await res.json().catch(() => null));
  }

  // Drop tokens Expo reports as permanently unregistered.
  const dead: string[] = [];
  for (const receipt of receipts) {
    const tickets = (receipt as { data?: { status: string; details?: { error?: string } }[] })?.data;
    tickets?.forEach((ticket, index) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        const message = messages[index];
        if (message) dead.push(message.to);
      }
    });
  }
  if (dead.length > 0) {
    await supabase.from('user_push_tokens').delete().in('token', dead);
  }

  return json({ sent: messages.length, removed: dead.length });
});
