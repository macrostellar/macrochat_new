import type { Chat } from '@/types';

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const demoChats: Chat[] = [
  {
    id: 'alex', name: 'Alex Rivera', macroId: 'MC-ORBIT-2471', avatarColor: '#55B9FF', online: true,
    lastSeen: 'online', unread: 2,
    messages: [
      { id: 'a1', chatId: 'alex', senderId: 'alex', text: 'Your private MacroChat is ready 🚀', createdAt: ago(18), status: 'read' },
      { id: 'a2', chatId: 'alex', senderId: 'me', text: 'Nice! No phone number needed.', createdAt: ago(16), status: 'read' },
      { id: 'a3', chatId: 'alex', senderId: 'alex', text: 'Exactly. Share only your Macro ID.', createdAt: ago(3), status: 'delivered' },
    ],
  },
  {
    id: 'team', name: 'Macro Team', macroId: 'GROUP-1001', avatarColor: '#71F79F', online: false,
    lastSeen: '4 members', unread: 0, isGroup: true,
    messages: [
      { id: 't1', chatId: 'team', senderId: 'sam', text: 'The new dark theme looks sharp.', createdAt: ago(70), status: 'read' },
      { id: 't2', chatId: 'team', senderId: 'me', text: 'Shipping it today!', createdAt: ago(66), status: 'read', reaction: '🔥 3' },
    ],
  },
  {
    id: 'maya', name: 'Maya Chen', macroId: 'MC-LUNAR-8820', avatarColor: '#A78BFA', online: false,
    lastSeen: 'last seen 12m ago', unread: 0,
    messages: [{ id: 'm1', chatId: 'maya', senderId: 'maya', text: 'Voice note UI is next 🎙️', createdAt: ago(140), status: 'read' }],
  },
];
