export type ProfileStatus = 'online' | 'busy' | 'away' | 'offline';

export type TextSizePreset = 'compact' | 'comfortable' | 'large' | 'xl';
export type ChatWallpaperPreset = 'midnight' | 'obsidian' | 'aurora' | 'graphite';
export type ChatFontFamily = 'system' | 'figtree' | 'space-grotesk' | 'instrument-serif' | 'oswald' | 'dancing-script';

export type AppearanceSettings = {
  textSize: TextSizePreset;
  wallpaper: ChatWallpaperPreset;
  fontFamily: ChatFontFamily;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  textSize: 'comfortable',
  wallpaper: 'midnight',
  fontFamily: 'system',
};

export type NotificationPreferences = {
  messages: 'on' | 'mentions' | 'off';
  calls: 'on' | 'off';
  status: 'on' | 'mentions' | 'off';
  updates: 'on' | 'off';
  approvals: 'on' | 'off';
  sound: boolean;
  vibration: boolean;
  preview: boolean;
  badge: boolean;
  backgroundSync: boolean;
  /** Ringtone id from the built-in catalog, or `custom:<uri>` for a device file. */
  messageRingtone: string;
  callRingtone: string;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  messages: 'on',
  calls: 'on',
  status: 'mentions',
  updates: 'on',
  approvals: 'on',
  sound: true,
  vibration: true,
  preview: true,
  badge: true,
  backgroundSync: true,
  messageRingtone: 'beep-high',
  callRingtone: 'midnight-watch',
};

export type Profile = {
  id: string;
  macroId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  status: ProfileStatus;
};

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageKind = 'text' | 'image' | 'video' | 'file' | 'voice' | 'system' | 'call';

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
  pinned?: boolean;
  starred?: boolean;
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
  status?: ProfileStatus;
  peerDevice?: 'mobile' | 'desktop' | 'web';
  lastSeen: string;
  unread: number;
  isGroup?: boolean;
  pinned?: boolean;
  muted?: boolean;
  disappearingSeconds?: number | null;
  messages: Message[];
  hasOlderMessages?: boolean;
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

export type ApprovalRole = 'approver' | 'submitter';
export type ApprovalMode = 'all' | 'any';
export type ApprovalContentKind = 'text' | 'email' | 'image' | 'video' | 'file';
export type ApprovalDecisionKind = 'approved' | 'rejected' | 'changes';
export type ApprovalStatus = 'pending' | ApprovalDecisionKind | 'cancelled';

export type ApprovalOption = { id: string; label: string };

export type ApprovalMember = {
  userId: string;
  displayName: string;
  macroId: string;
  avatarColor: string;
  avatarUrl?: string;
  role: ApprovalRole;
};

export type ApprovalGroup = {
  /** Same as the backing group conversation id. */
  id: string;
  name: string;
  category: string;
  approvalMode: ApprovalMode;
  createdBy: string;
  createdAt: string;
  members: ApprovalMember[];
  myRole: ApprovalRole | null;
  isOwner: boolean;
};

export type ApprovalDecision = {
  id: string;
  requestId: string;
  approverId: string;
  approverName: string;
  decision: ApprovalDecisionKind;
  selectedOptions: string[];
  comment?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRequest = {
  id: string;
  groupId: string;
  groupName: string;
  groupCategory: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarColor: string;
  title: string;
  contentKind: ApprovalContentKind;
  body?: string;
  mediaPath?: string;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  approveOptions: ApprovalOption[];
  approveMulti: boolean;
  rejectOptions: ApprovalOption[];
  rejectMulti: boolean;
  dueAt?: string;
  status: ApprovalStatus;
  createdAt: string;
  editedAt?: string;
  resolvedAt?: string;
  decisions: ApprovalDecision[];
  /** Approvers who are expected to decide (requester excluded). */
  approverIds: string[];
  mine: boolean;
  myDecision?: ApprovalDecision;
  /** True when I am an approver on an open request and have not decided yet. */
  awaitingMe: boolean;
};

export type NewApprovalRequestInput = {
  groupId: string;
  title: string;
  contentKind: ApprovalContentKind;
  body?: string;
  /** New file to upload; omit to keep the existing attachment when editing. */
  media?: { uri: string; fileName?: string; mimeType?: string };
  /** When editing, set to drop the current attachment. */
  removeMedia?: boolean;
  approveOptions: string[];
  approveMulti: boolean;
  rejectOptions: string[];
  rejectMulti: boolean;
  dueAt?: string;
};

export type ApprovalDecisionInput = {
  decision: ApprovalDecisionKind;
  selectedOptions: string[];
  comment?: string;
};
