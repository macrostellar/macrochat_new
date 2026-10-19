const dayKeyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Label for a calendar day: "Today", "Yesterday", or a short date (with year when not the current year). */
export function formatDayLabel(iso: string, now: Date = new Date()) {
  const date = new Date(iso);
  const dayKey = dayKeyOf(date);
  if (dayKey === dayKeyOf(now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey === dayKeyOf(yesterday)) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Input must be ordered newest-first (as the chat lists render them).
 * Returns a label for each message that is the earliest message of its local calendar day,
 * so the label can be shown above that message. Local midnight starts a new day.
 */
export function buildDaySeparatorLabels<T extends { createdAt: string }>(messagesNewestFirst: T[], now: Date = new Date()): Map<T, string> {
  const labels = new Map<T, string>();
  messagesNewestFirst.forEach((message, index) => {
    const older = messagesNewestFirst[index + 1];
    const startsNewDay = !older || dayKeyOf(new Date(older.createdAt)) !== dayKeyOf(new Date(message.createdAt));
    if (startsNewDay) labels.set(message, formatDayLabel(message.createdAt, now));
  });
  return labels;
}

const STATUS_LABELS: Record<string, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
};

export function formatFullDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Rows for the "Message info" dialog. Per-message delivered/read timestamps are not stored, so only the status is shown. */
export function messageInfoRows(message: { createdAt: string; senderId: string; status?: string; expiresAt?: string }) {
  const rows: { label: string; value: string }[] = [{ label: 'Sent', value: formatFullDateTime(message.createdAt) }];
  if (message.senderId === 'me') {
    rows.push({ label: 'Status', value: STATUS_LABELS[message.status ?? 'sent'] ?? 'Sent' });
  }
  if (message.expiresAt) {
    rows.push({ label: 'Disappears', value: formatFullDateTime(message.expiresAt) });
  }
  return rows;
}
