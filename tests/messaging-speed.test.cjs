const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const read = (file) => fs.readFileSync(file, 'utf8');

function loadActivityRoutes() {
  const source = read('src/lib/useChatActivity.ts');
  const start = source.indexOf('export const MAX_ACTIVITY_CHANNELS');
  const end = source.indexOf('export function useChatActivity');
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(js, sandbox);
  return sandbox.exports;
}

test('typing/presence channels are capped and always include the open chat', () => {
  const { MAX_ACTIVITY_CHANNELS, selectActivityRoutes } = loadActivityRoutes();
  const chats = Array.from({ length: 60 }, (_, index) => ({ id: `chat-${index}`, participantUserId: `user-${index}` }));
  chats.push({ id: 'group', participantUserId: undefined });

  const idle = selectActivityRoutes(chats, null);
  assert.equal(idle.length, MAX_ACTIVITY_CHANNELS);

  const open = selectActivityRoutes(chats, 'chat-55');
  assert.equal(open.length, MAX_ACTIVITY_CHANNELS + 1);
  assert.ok(open.some(([chatId, peerId]) => chatId === 'chat-55' && peerId === 'user-55'));
  assert.ok(!open.some(([chatId]) => chatId === 'group'));
  assert.equal(selectActivityRoutes(chats, 'chat-2').length, MAX_ACTIVITY_CHANNELS);
});

test('channels are opened and closed incrementally instead of rebuilt when the open chat changes', () => {
  const source = read('src/lib/useChatActivity.ts');
  assert.match(source, /syncChannels\.current\?\.\(\)/);
  assert.match(source, /if \(!wanted\.has\(chatId\)\) closeChannel\(chatId\)/);
  assert.match(source, /\}, \[userId, publish\]\);/);
});

test('sending does not wait for the unused session bookkeeping write and reuses the peer device', () => {
  const source = read('src/lib/e2ee-pro-service.ts');
  assert.doesNotMatch(source, /await supabase\s*\.from\('macrochat_session_keys'\)\s*\.update/);
  assert.match(source, /peerDeviceCache/);
  assert.match(source, /PEER_DEVICE_CACHE_TTL_MS/);
});

test('decryption tries the last working key for the peer before the others', () => {
  const source = read('src/lib/e2ee-pro-service.ts');
  assert.match(source, /lastWorkingSecretByPeer\.get\(peerUserId\)/);
  assert.match(source, /lastWorkingSecretByPeer\.set\(peerUserId, secret\)/);
});

test('polling slows down only while both realtime channels are joined and catches up on reconnect', () => {
  const source = read('src/context/AppContext.tsx');
  assert.match(source, /syncChannelJoined && inboxChannelJoined && pollTick % 5 !== 0/);
  assert.match(source, /status === 'CLOSED'/);
  assert.match(source, /inboxChannelJoined = status === 'SUBSCRIBED'/);
});

test('open chat screens publish their id so only that chat gets a typing channel', () => {
  assert.match(read('app/chat/[id].tsx'), /setActiveChatId\(activityChatId\)/);
  assert.match(read('src/components/WebMessenger.tsx'), /setActiveChatId\(chat\.id\)/);
  assert.match(read('src/context/AppContext.tsx'), /privacySettings\.shareTypingActivity, activeChatId\)/);
});

test('opening a chat warms the recipient key without creating a session', () => {
  const service = read('src/lib/e2ee-pro-service.ts');
  assert.match(service, /async warmPeer\(peerUserId: string\)/);
  assert.match(service, /getOrCreateSession\(peerUserId, peerDeviceId, false\)/);
  assert.match(service, /if \(!createIfMissing\) throw/);
  assert.match(read('app/chat/[id].tsx'), /e2eePro\.warmPeer\(warmPeerUserId\)/);
  assert.match(read('src/components/WebMessenger.tsx'), /e2eePro\.warmPeer\(chat\.participantUserId\)/);
});
