const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function pushHarness({ secret = 'test-secret', tokenCount = 1, memberError = null, rejectSecondBatch = false } = {}) {
  let serve;
  let removed = [];
  const batches = [];
  const canonical = { id: 'message', conversation_id: 'conversation', sender_id: 'sender', kind: 'text' };
  const client = {
    rpc: async () => ({ data: 7, error: null }),
    from(table) {
      const operations = [];
      const query = {
        then(resolve, reject) {
          let result = { data: [], error: null };
          if (table === 'macrochat_messages') result.data = canonical;
          if (table === 'macrochat_conversation_members') {
            result = { data: [{ user_id: 'recipient' }], error: memberError };
            assert.ok(operations.some(([method, field, value]) => method === 'neq' && field === 'user_id' && value === 'sender'));
          }
          if (table === 'macrochat_profiles') result.data = { display_name: 'Sender' };
          if (table === 'user_push_tokens') {
            if (operations.some(([method]) => method === 'delete')) removed = operations.find(([method]) => method === 'in')[2];
            else result.data = Array.from({ length: tokenCount }, (_, index) => ({ user_id: 'recipient', token: `token-${index}` }));
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      for (const name of ['select', 'eq', 'neq', 'in', 'maybeSingle', 'delete']) {
        query[name] = (...args) => { operations.push([name, ...args]); return query; };
      }
      return query;
    },
  };
  const source = ts.transpileModule(fs.readFileSync('supabase/functions/send-push/index.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: {},
    require: () => ({ createClient: () => client }),
    Deno: { env: { get: (name) => name === 'PUSH_WEBHOOK_SECRET' ? secret : 'configured' }, serve: (callback) => { serve = callback; } },
    Response, console: { error() {}, log() {} },
    fetch: async (url, options) => {
      const messages = JSON.parse(options.body);
      batches.push(messages);
      const data = messages.map((_, index) => rejectSecondBatch && batches.length === 2 && index === 0
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'ticket' });
      return new Response(JSON.stringify({ data }), { status: 200 });
    },
  });
  return {
    batches, removed: () => removed,
    request: (header = 'test-secret') => serve(new Request('https://example.com/send-push', {
      method: 'POST', headers: { 'x-webhook-secret': header },
      body: JSON.stringify({ record: { id: 'message', sender_id: 'forged', conversation_id: 'forged' } }),
    })),
  };
}

test('push fails closed when webhook authentication is missing or incorrect', async () => {
  assert.equal((await pushHarness({ secret: undefined }).request('wrong')).status, 401);
  assert.equal((await pushHarness({ secret: '' }).request()).status, 503);
  assert.equal((await pushHarness().request('wrong')).status, 401);
});

test('push uses the saved message, accurate unread badge and no plaintext message content', async () => {
  const harness = pushHarness();
  const response = await harness.request();
  assert.equal(response.status, 200);
  const message = harness.batches[0][0];
  assert.equal(message.badge, 7);
  assert.equal(message.priority, 'high');
  assert.equal(message.data.conversationId, 'conversation');
  assert.equal(message.data.messageId, 'message');
  assert.equal(message.body, 'New message');
});

test('push surfaces database errors instead of claiming no recipients', async () => {
  const harness = pushHarness({ memberError: { message: 'Database unavailable' } });
  assert.equal((await harness.request()).status, 500);
  assert.equal(harness.batches.length, 0);
});

test('invalid tokens in the second Expo batch remove the correct token and report rejection', async () => {
  const harness = pushHarness({ tokenCount: 101, rejectSecondBatch: true });
  const response = await harness.request();
  assert.equal(response.status, 502);
  assert.equal(harness.batches.length, 2);
  assert.deepEqual(Array.from(harness.removed()), ['token-100']);
  const result = await response.json();
  assert.equal(result.accepted, 100);
  assert.equal(result.rejected, 1);
});
