export type Profile = {
  id: string;
  macroId: string;
  displayName: string;
  avatarColor: string;
};

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageKind = 'text' | 'image' | 'file' | 'voice' | 'system';

export type Message = {
  id: string;
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
  createdAt: string;
  status: MessageStatus;
  replyTo?: string;
  reaction?: string;
};

export type Chat = {
  id: string;
  name: string;
  macroId: string;
  participantUserId?: string;
  avatarColor: string;
  online: boolean;
  lastSeen: string;
  unread: number;
  isGroup?: boolean;
  messages: Message[];
};
