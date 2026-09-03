export type Profile = {
  id: string;
  macroId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
};

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'system' | 'call';

export type Message = {
  id: string;
  clientId?: string;
  chatId: string;
  senderId: string;
  text: string;
  kind?: MessageKind;
  mediaPath?: string;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  durationMs?: number;
  encrypted?: boolean;
  encryptionVersion?: string;
  ciphertext?: string;
  nonce?: string;
  expiresAt?: string;
  createdAt: string;
  status: MessageStatus;
  replyTo?: string;
  reaction?: string;
  textColor?: string;
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
  callInfo?: {
    video: boolean;
    outcome: string;
    durationSeconds?: number;
  };
};

export type UpdateItem = {
  id: string;
  userId: string;
  name: string;
  avatarColor: string;
  kind: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  caption?: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  mine: boolean;
};

export type CallOutcome = 'answered' | 'missed' | 'rejected' | 'cancelled';

export type CallHistoryEntry = {
  id: string;
  conversationId: string;
  peerUserId: string;
  video: boolean;
  incoming: boolean;
  outcome: CallOutcome;
  durationSeconds: number;
  startedAt: string;
};

export type Chat = {
  id: string;
  name: string;
  macroId: string;
  participantUserId?: string;
  avatarColor: string;
  avatarUrl?: string;
  online: boolean;
  lastSeen: string;
  unread: number;
  isGroup?: boolean;
  pinned?: boolean;
  muted?: boolean;
  disappearingSeconds?: number | null;
  messages: Message[];
};

export type UpdateReaction = {
  id: string;
  updateId: string;
  userId: string;
  userDisplayName: string;
  emoji: string;
  createdAt: string;
};

export type UpdateComment = {
  id: string;
  updateId: string;
  userId: string;
  userDisplayName: string;
  text: string;
  createdAt: string;
};

export type MessageReaction = {
  id: string;
  messageId: string;
  userId: string;
  userDisplayName: string;
  emoji: string;
  createdAt: string;
};

export type MessageComment = {
  id: string;
  messageId: string;
  userId: string;
  userDisplayName: string;
  text: string;
  createdAt: string;
};
