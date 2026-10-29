const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { Buffer } = require('node:buffer');
const { setImmediate } = require('node:timers');
const { getBackendConfiguration } = require('../src/lib/backend-config');

const userId = '11111111-1111-4111-8111-111111111111';
const peerId = '22222222-2222-4222-8222-222222222222';
const chatId = '33333333-3333-4333-8333-333333333333';
const profile = { id: userId, macroId: 'MC-NOVA-1234', displayName: 'Sender', avatarColor: '#55B9FF' };
const chat = { id: chatId, macroId: 'MC-NOVA-5678', participantUserId: peerId, messages: [] };
const publicKey = 'sb_publishable_test_key';
const url = 'https://example.supabase.co';

function loadModule(path, dependencies, globals = {}, source = fs.readFileSync(path, 'utf8')) {
  const exports = {};
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) return {};
      return require(name);
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    atob, URL, Uint8Array, Blob, Error, process: { env: {} }, ...globals,
  });
  return exports;
}

function clientWith(handler) {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }) },
    from(table) {
      const operations = [];
      const query = { then(resolve, reject) { return Promise.resolve(handler(table, operations)).then(resolve, reject); } };
      for (const method of ['select', 'insert', 'upsert', 'update', 'eq', 'neq', 'in', 'is', 'gt', 'lt', 'or', 'order', 'limit', 'maybeSingle', 'single']) {
        query[method] = (...args) => { operations.push([method, ...args]); return query; };
      }
      return query;
    },
    rpc: async () => ({ data: [{ id: peerId, display_name: 'Actual recipient', avatar_color: '#abcdef' }] }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'https://example.supabase.co/media?token=fresh' }, error: null }),
    }) },
  };
}

function providerHarness({ client = null, mode = 'supabase', initialProfile = profile, approval = false, overrides = {}, globals = {} } = {}) {
  let cursor = 0;
  const states = approval ? [] : [initialProfile, false, [structuredClone(chat)]];
  const alerts = [];
  const storage = new Map();
  const effects = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useEffect: (effect) => effects.push(effect),
  };
  const backend = {
    supabase: client, backendMode: mode, isDemoMode: mode === 'demo',
    ensureAnonymousSession: async () => ({ user: { id: userId } }),
  };
  const library = loadModule(approval ? 'src/context/ApprovalsContext.tsx' : 'src/context/AppContext.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': {
      Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    },
    'expo-secure-store': {
      setItemAsync: async (key, value) => storage.set(key, value),
      getItemAsync: async (key) => storage.get(key) ?? null,
      deleteItemAsync: async (key) => storage.delete(key),
    },
    'expo-file-system/legacy': { readAsStringAsync: async () => 'aGVsbG8=' },
    '@/components/Avatar': { DEFAULT_PROFILE_AVATARS: ['avatar'] },
    '@/lib/id': { isUuid: (id) => /^[0-9a-f-]{36}$/i.test(id), generateMacroId: () => 'MC-NEW-9999', localId: () => 'local-id' },
    '@/lib/supabase': backend,
    '@/types': loadModule('src/types.ts', {}),
    '@/lib/privacy': { defaultPrivacySettings: { defaultMessageTtlSeconds: null } },
    '@/lib/useChatActivity': { useChatActivity: () => ({ activityByChat: {}, presenceByUser: {} }) },
    '@/lib/demo': { demoChats: [{ id: 'demo' }] },
    '@/lib/inbox': { inboxTopic: (id) => `macrochat-inbox-${id}`, notifyConversation: async () => {} },
    '@/context/AppContext': { useApp: () => ({ profile: initialProfile, backendMode: mode, notificationPrefs: {} }) },
    ...overrides,
  }, globals);
  return {
    states, alerts, storage, effects,
    render() {
      cursor = 0;
      effects.length = 0;
      return (approval ? library.ApprovalsProvider : library.AppProvider)({ children: null }).props.value;
    },
  };
}

test('missing backend settings never silently enable demo, including releases with the demo flag', () => {
  for (const development of [true, false]) {
    assert.equal(getBackendConfiguration({ development }).mode, 'unconfigured');
  }
  assert.equal(getBackendConfiguration({ development: false, demoEnabled: 'true' }).mode, 'unconfigured');
  assert.equal(getBackendConfiguration({ development: true, demoEnabled: 'true' }).mode, 'demo');
});

test('partial, masked, malformed and privileged keys are rejected', () => {
  const serviceKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const anonKey of ['', '******', 'YOUR_ANON_KEY', 'sb_secret_do_not_bundle', serviceKey, 'bad.jwt.key']) {
    assert.equal(getBackendConfiguration({ url, anonKey, development: false }).mode, 'unconfigured');
  }
  assert.equal(getBackendConfiguration({ url: 'not-a-url', anonKey: publicKey, development: false }).mode, 'unconfigured');
  assert.equal(getBackendConfiguration({ url: 'http://example.com', anonKey: publicKey, development: false }).mode, 'unconfigured');
  assert.equal(getBackendConfiguration({ url, demoEnabled: 'true', development: true }).mode, 'unconfigured');
});

test('publishable and legacy anon keys both configure online mode', () => {
  const legacy = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
  for (const anonKey of [publicKey, legacy]) {
    assert.equal(getBackendConfiguration({ url, anonKey, development: false }).mode, 'supabase');
  }
});

test('release config blocks missing backend and accepts a configured release', () => {
  const run = (env) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync('app.config.js', 'utf8'), {
      module, process: { env }, require: () => ({ getBackendConfiguration }),
    });
    const config = { name: 'MacroChat' };
    return module.exports({ config });
  };
  assert.throws(() => run({ NODE_ENV: 'production' }), /Online messaging is not configured/);
  assert.throws(() => run({ CONFIGURATION: 'Release', EXPO_PUBLIC_DEMO_MODE: 'true' }), /Online messaging is not configured/);
  assert.equal(run({ NODE_ENV: 'production', EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey }).name, 'MacroChat');
});

function authLibrary(env, development, client) {
  return loadModule('src/lib/supabase.ts', {
    'react-native-url-polyfill/auto': {},
    '@react-native-async-storage/async-storage': {},
    'expo-linking': {},
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    '@supabase/supabase-js': { createClient: () => client },
    './backend-config': { getBackendConfiguration },
  }, { process: { env }, __DEV__: development });
}

test('unconfigured authentication cannot create a fake identity; explicit development demo can', async () => {
  await assert.rejects(authLibrary({}, false).ensureAnonymousSession(), /not configured/);
  assert.equal(await authLibrary({ EXPO_PUBLIC_DEMO_MODE: 'true' }, true).ensureAnonymousSession(), null);
});

test('authentication surfaces session errors and missing server sessions', async () => {
  const env = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey };
  const client = clientWith(() => ({}));
  client.auth.getSession = async () => ({ data: {}, error: new Error('Session storage failed') });
  await assert.rejects(authLibrary(env, false, client).ensureAnonymousSession(), /Session storage failed/);
  client.auth.getSession = async () => ({ data: { session: null }, error: null });
  client.auth.signInAnonymously = async () => ({ data: { session: null }, error: null });
  await assert.rejects(authLibrary(env, false, client).ensureAnonymousSession(), /did not create an authenticated session/);
});

test('unconfigured chats and media cannot be created or marked sent', async () => {
  const harness = providerHarness({ mode: 'unconfigured' });
  const app = harness.render();
  await assert.rejects(app.addChat('MC-NOVA-0000'), /configured server/);
  app.sendMessage(chatId, 'This must not look delivered');
  await assert.rejects(app.sendMediaMessage(chatId, { kind: 'image', uri: 'data:image/png;base64,aA==' }), /configured server/);
  assert.equal(harness.states[2][0].messages.length, 0);
  assert.equal(harness.alerts[0][0], 'Message not sent');
});

test('failed media inserts remain failed and reject instead of reporting success', async () => {
  const client = clientWith(() => ({ data: null, error: new Error('Database rejected media') }));
  const harness = providerHarness({ client });
  await assert.rejects(harness.render().sendMediaMessage(chatId, { kind: 'image', uri: 'data:image/png;base64,aA==' }), /Database rejected media/);
  assert.equal(harness.states[2][0].messages[0].status, 'failed');
});

test('media without a confirmed saved row is not marked sent', async () => {
  const harness = providerHarness({ client: clientWith(() => ({ data: [], error: null })) });
  await assert.rejects(harness.render().sendMediaMessage(chatId, { kind: 'image', uri: 'data:image/png;base64,aA==' }), /did not confirm/);
  assert.equal(harness.states[2][0].messages[0].status, 'failed');
});

test('confirmed media inserts retain the server ID and are marked sent', async () => {
  const harness = providerHarness({
    client: clientWith(() => ({ data: [{ id: 'server-message' }], error: null })),
    overrides: { '@/lib/inbox': { notifyConversation: async () => {} } },
  });
  await harness.render().sendMediaMessage(chatId, { kind: 'image', uri: 'data:image/png;base64,aA==' });
  assert.equal(harness.states[2][0].messages[0].status, 'sent');
  assert.equal(harness.states[2][0].messages[0].id, 'server-message');
});

test('text messages with unavailable encryption fail instead of appearing sent', async () => {
  const harness = providerHarness({ client: clientWith(() => { throw new Error('Unencrypted message must not reach the database'); }) });
  harness.render().sendMessage(chatId, 'Private message');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.states[2][0].messages[0].status, 'failed');
  assert.equal(harness.alerts[0][0], 'Message not sent');
});

test('a rejected membership insert does not leave a fake local conversation', async () => {
  const client = clientWith((table, operations) => {
    if (table === 'macrochat_profiles') return { data: { id: userId } };
    if (table === 'macrochat_conversations') return { data: { id: 'new-conversation' } };
    if (operations.some(([method]) => method === 'insert')) return { error: new Error('Membership denied') };
    return { data: [] };
  });
  const harness = providerHarness({ client });
  await assert.rejects(harness.render().addChat('MC-NOVA-0000'), /Membership denied/);
  assert.equal(harness.states[2].length, 1);
});

test('restoring an account refreshes its real server name and Macro ID', async () => {
  const client = clientWith(() => ({ data: { id: userId, macro_id: 'MC-REAL-1234', display_name: 'Server name', avatar_color: '#abcdef', status: 'online' } }));
  const harness = providerHarness({ client });
  const restored = await harness.render().restoreProfile();
  assert.equal(restored.displayName, 'Server name');
  assert.equal(harness.states[0].macroId, 'MC-REAL-1234');
  assert.equal(JSON.parse(harness.storage.get('macrochat.profile')).displayName, 'Server name');
});

test('registering an existing online account preserves its Macro ID', async () => {
  const client = clientWith((table, operations) => {
    assert.equal(operations.some(([method]) => method === 'upsert'), false);
    return { data: { id: userId, macro_id: 'MC-REAL-1234', display_name: 'Existing name', avatar_color: '#abcdef' } };
  });
  assert.equal((await providerHarness({ client }).render().register('Different name')).macroId, 'MC-REAL-1234');
});

function securityHarness(initialProfile, client = clientWith(() => ({ data: null }))) {
  const initialized = [];
  client.auth.mfa = {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1' }, error: null }),
  };
  const harness = providerHarness({
    client,
    initialProfile,
    overrides: {
      '@/lib/e2ee': { readE2EEPassphrase: async () => null },
      '@/lib/e2ee-pro-service': {
        initializeE2EEProService: (id) => ({ initialize: async () => { initialized.push(id); } }),
      },
    },
  });
  return { harness, initialized };
}

test('encryption waits for an online profile even when an authenticated session exists', async () => {
  const { harness, initialized } = securityHarness(null);
  await harness.render().refreshSecurityState();
  assert.deepEqual(initialized, []);
});

test('encryption does not publish keys for a session that differs from the restored profile', async () => {
  const { harness, initialized } = securityHarness({ ...profile, id: peerId });
  await harness.render().refreshSecurityState();
  assert.deepEqual(initialized, []);
});

test('encryption initializes after a new profile is saved, not before registration', async () => {
  let saved = false;
  const client = clientWith((table, operations) => {
    assert.equal(table, 'macrochat_profiles');
    if (operations.some(([method]) => method === 'upsert')) saved = true;
    return { data: null, error: null };
  });
  const { harness, initialized } = securityHarness(null, client);
  await harness.render().refreshSecurityState();
  assert.equal(saved, false);
  assert.deepEqual(initialized, []);
  await harness.render().register('New account');
  assert.equal(saved, true);
  await harness.render().refreshSecurityState();
  assert.deepEqual(initialized, [userId]);
});

test('online startup does not expose a cached profile before the server verifies it', async () => {
  let finishRestore;
  const restored = new Promise((resolve) => { finishRestore = resolve; });
  const client = clientWith(() => restored);
  const { harness, initialized } = securityHarness(null, client);
  harness.storage.set('macrochat.profile', JSON.stringify(profile));
  harness.render();
  // The startup effect is the first effect that registers its loading promise.
  const effect = harness.effects.find((callback) => callback.toString().includes('loadProfile'));
  assert.ok(effect);
  effect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.states[0], null);
  await harness.render().refreshSecurityState();
  assert.deepEqual(initialized, []);
  finishRestore({ data: null, error: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.states[0], null);
  assert.equal(harness.storage.has('macrochat.profile'), false);
});

test('production approvals never seed demo groups, and unconfigured mutations fail', async () => {
  const harness = providerHarness({ approval: true, mode: 'unconfigured' });
  harness.render();
  const approvals = harness.render();
  assert.equal(approvals.groups.length, 0);
  assert.equal(approvals.requests.length, 0);
  await assert.rejects(approvals.createApprovalGroup({ name: 'Real group' }), /configured server/);
  assert.equal(harness.states[0].length, 0);
});

test('explicit development demo keeps sample approvals isolated from online mode', () => {
  const harness = providerHarness({
    approval: true, mode: 'demo',
    overrides: { '@/lib/approvals': { toOptions: (labels) => labels.map((label) => ({ id: label, label })) } },
  });
  harness.render();
  const approvals = harness.render();
  assert.equal(approvals.groups[0].id, 'demo-approvals');
  assert.equal(approvals.requests[0].id, 'demo-req-1');
});

test('approval load failures are visible rather than being presented as empty success', async () => {
  const harness = providerHarness({
    approval: true, client: {},
    overrides: { '@/lib/approvals': { fetchApprovalSnapshot: async () => { throw new Error('Approval tables missing'); } } },
  });
  await harness.render().refreshApprovals();
  assert.equal(harness.render().error, 'Approval tables missing');
});

test('expiry ticks preserve all chat and message references when nothing expires', () => {
  let tick;
  const harness = providerHarness({ globals: { setInterval: (callback) => { tick = callback; return 1; } } });
  harness.render();
  harness.effects.find((effect) => effect.toString().includes('const now = Date.now()'))();
  const original = harness.states[2];
  for (let i = 0; i < 10; i += 1) tick();
  assert.equal(harness.states[2], original);
});

test('expired messages are removed without rebuilding unaffected chats', () => {
  let tick;
  const harness = providerHarness({ globals: { setInterval: (callback) => { tick = callback; return 1; } } });
  harness.states[2].push({ id: 'expired-chat', messages: [{ id: 'expired', expiresAt: new Date(0).toISOString() }] });
  harness.render();
  harness.effects.find((effect) => effect.toString().includes('const now = Date.now()'))();
  const unchanged = harness.states[2][0];
  tick();
  assert.equal(harness.states[2][0], unchanged);
  assert.equal(harness.states[2][1].messages.length, 0);
});

test('failed native storage uploads reject instead of inserting a device-local URI', async () => {
  let inserted = false;
  const client = clientWith(() => { inserted = true; return { data: [] }; });
  client.storage.from = () => ({ upload: async () => ({ error: { message: 'Upload denied' } }) });
  const harness = providerHarness({ client });
  await assert.rejects(harness.render().sendMediaMessage(chatId, { kind: 'voice', uri: 'file:///local/voice.m4a', mimeType: 'audio/mp4' }), /Upload denied/);
  assert.equal(inserted, false);
  assert.equal(harness.states[2][0].messages[0].status, 'failed');
});

test('native attachments upload bytes and persist storage paths, not expiring URLs or local paths', async () => {
  let uploaded;
  let saved;
  const client = clientWith((table, operations) => {
    saved = operations.find(([method]) => method === 'insert')[1];
    return { data: [{ id: 'saved-media' }], error: null };
  });
  client.storage.from = () => ({
    upload: async (path, body) => { uploaded = body; return { error: null }; },
    createSignedUrl: async (path, seconds) => {
      assert.equal(seconds, 300);
      return { data: { signedUrl: 'https://example.com/fresh' } };
    },
  });
  const harness = providerHarness({ client, overrides: { '@/lib/inbox': { notifyConversation: async () => {} } } });
  await harness.render().sendMediaMessage(chatId, { kind: 'voice', uri: 'file:///local/voice.m4a', mimeType: 'audio/mp4' });
  assert.ok(uploaded instanceof Uint8Array);
  assert.equal(Buffer.from(uploaded).toString(), 'hello');
  assert.ok(saved.media_path.startsWith(chatId + '/' + userId + '/'));
  assert.equal(JSON.parse(saved.body).signedUrl, undefined);
  assert.equal(harness.states[2][0].messages[0].mediaUrl, 'https://example.com/fresh');
});

test('badge reconciliation explicitly clears a stale iOS badge when there are no unread chats', async () => {
  const badges = [];
  const harness = providerHarness({ overrides: { '@/lib/push': { setApplicationBadgeCount: async (count) => badges.push(count) } } });
  harness.states[2][0].unread = 0;
  harness.render();
  harness.effects.find((effect) => effect.toString().includes('setApplicationBadgeCount'))();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(badges, [0]);
});

function realtimeHarness() {
  const handlers = new Map();
  const client = clientWith((table) => ({ data: [], error: null }));
  client.channel = (name) => {
    const channel = {
      state: 'joined',
      on(type, filter, callback) { handlers.set(`${name}:${type}:${filter.event}:${filter.table ?? ''}`, callback); return channel; },
      subscribe() { return channel; },
    };
    return channel;
  };
  client.removeChannel = async () => {};
  const harness = providerHarness({ client });
  harness.states[2][0].messages = [{ id: 'sent-message', senderId: 'me', text: 'hello', status: 'read', createdAt: new Date(0).toISOString() }];
  harness.render();
  const cleanup = harness.effects.find((effect) => effect.toString().includes('let lastPolledAt'))();
  return { harness, handlers, cleanup };
}

test('a later message update cannot turn read ticks grey again', () => {
  const { harness, handlers, cleanup } = realtimeHarness();
  handlers.get(`macrochat-sync-${userId}:postgres_changes:UPDATE:macrochat_messages`)({
    new: { id: 'sent-message', conversation_id: chatId, sender_id: userId, kind: 'text', body: 'hello', created_at: new Date(0).toISOString() },
  });
  assert.equal(harness.states[2][0].messages[0].status, 'read');
  cleanup();
});

test('a read receipt updates only messages in the correct direct conversation', () => {
  const { harness, handlers, cleanup } = realtimeHarness();
  harness.states[2][0].messages[0].status = 'sent';
  const event = handlers.get(`macrochat-sync-${userId}:postgres_changes:UPDATE:macrochat_conversation_members`);
  event({ new: { conversation_id: chatId, user_id: 'unrelated-user', receipt_read_at: new Date().toISOString() } });
  assert.equal(harness.states[2][0].messages[0].status, 'sent');
  event({ new: { conversation_id: chatId, user_id: peerId, receipt_read_at: new Date().toISOString() } });
  assert.equal(harness.states[2][0].messages[0].status, 'read');
  cleanup();
});

test('native push registration reports rejected token storage instead of silently succeeding', async () => {
  const client = clientWith(() => ({ error: { message: 'Token table denied' } }));
  const push = loadModule('src/lib/push.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-constants': { expoConfig: { extra: { eas: { projectId: 'project' } } } },
    './supabase': { supabase: client },
    'expo-notifications': {
      getPermissionsAsync: async () => ({ granted: true }),
      getExpoPushTokenAsync: async () => ({ data: 'test-token' }),
    },
  });
  await assert.rejects(push.registerPushToken(userId), /Token table denied/);
});

test('typing is contained in the composer and does not send or update the conversation on each character', () => {
  const path = 'app/chat/[id].tsx';
  const file = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ConversationComposer');
  assert.ok(component);
  const values = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const composer = loadModule(path, {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  }, {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useEffect() {},
    useImperativeHandle(ref, create) { ref.current = create(); },
    View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', Ionicons: 'Icon',
    Platform: { OS: 'ios' }, styles: {}, colors: {},
  }, 'export ' + component.getText(file)).ConversationComposer;
  const sent = [];
  let voice = 0;
  const props = { ref: {}, bottom: 0, onSend: (text) => sent.push(text), onVoice: () => { voice += 1; } };
  const render = () => { stateIndex = 0; refIndex = 0; return composer(props); };
  const input = (tree) => tree.props.children[1].props.children[0];
  let tree = render();
  for (let i = 1; i <= 100; i += 1) {
    input(tree).props.onChangeText('x'.repeat(i));
    tree = render();
  }
  assert.equal(input(tree).props.value.length, 100);
  assert.equal(sent.length, 0);
  tree.props.children[2].props.onPress();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 100);
  tree = render();
  assert.equal(input(tree).props.value, '');
  tree.props.children[2].props.onPress();
  assert.equal(voice, 1);
});
