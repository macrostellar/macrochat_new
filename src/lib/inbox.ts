import type { SupabaseClient } from '@supabase/supabase-js';

// Payloads carry ids only; receivers fetch the row, so RLS still guards the content.
export type InboxEvent = 'new-message' | 'new-chat';

export const inboxTopic = (userId: string) => `macrochat-inbox-${userId}`;

function sendToUser(client: SupabaseClient, userId: string, event: InboxEvent, payload: Record<string, string>) {
  const channel = client.channel(inboxTopic(userId));
  channel.httpSend(event, payload)
    .catch(() => undefined)
    .finally(() => { void client.removeChannel(channel); });
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
    const { data } = await client.from('macrochat_conversation_members').select('user_id').eq('conversation_id', conversationId);
    recipients = (data ?? []).map((row) => row.user_id as string);
  }
  recipients
    .filter((id) => id !== actorUserId)
    .forEach((id) => sendToUser(client, id, event, { conversationId, ...payload }));
}
