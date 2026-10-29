import type { SupabaseClient } from '@supabase/supabase-js';

// Payloads carry ids only; receivers fetch the row, so RLS still guards the content.
export type InboxEvent = 'new-message' | 'new-chat' | 'read-receipt';

export const inboxTopic = (userId: string) => `macrochat-inbox-${userId}`;

async function sendToUser(client: SupabaseClient, userId: string, event: InboxEvent, payload: Record<string, string>) {
  const channel = client.channel(inboxTopic(userId));
  try {
    await channel.httpSend(event, payload);
  } finally {
    await client.removeChannel(channel);
  }
}

// Pings the other members so they pick up a change without waiting on postgres_changes.
export async function notifyConversation(
  client: SupabaseClient,
  conversationId: string,
  actorUserId: string,
  event: InboxEvent,
  payload: Record<string, string>,
  knownPeerId?: string,
) {
  let recipients: string[] = knownPeerId ? [knownPeerId] : [];
  if (recipients.length === 0) {
    const { data, error } = await client.from('macrochat_conversation_members').select('user_id').eq('conversation_id', conversationId);
    if (error) throw error;
    recipients = (data ?? []).map((row) => row.user_id as string);
  }
  await Promise.all(recipients
    .filter((id) => id !== actorUserId)
    .map((id) => sendToUser(client, id, event, { conversationId, ...payload })));
}
