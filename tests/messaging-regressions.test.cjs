const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(path, dependencies) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: (name) => dependencies[name] ?? require(name),
    console, setTimeout, clearTimeout, crypto: globalThis.crypto,
  });
  return exports;
}

function nativePlayback() {
  const loads = [];
  const sounds = [];
  const library = loadModule('src/lib/ringtones.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-av': { Audio: {
      setAudioModeAsync: async () => {},
      Sound: { createAsync: (source, options) => new Promise((resolve) => {
        assert.equal(options.shouldPlay, false);
        loads.push(() => {
          const sound = {
            playing: false, unloaded: false,
            setOnPlaybackStatusUpdate(callback) { this.callback = callback; },
            async playAsync() { this.playing = true; },
            async unloadAsync() { this.playing = false; this.unloaded = true; },
          };
          sounds.push(sound);
          resolve({ sound });
        });
      }) },
    } },
  });
  return { library, loads, sounds };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('leaving while a native preview loads never starts late audio', async () => {
  const { library, loads, sounds } = nativePlayback();
  const pending = library.previewRingtone('midnight-watch');
  await flush();
  assert.equal(loads.length, 1);
  await library.stopPreview();
  loads[0]();
  await pending;
  assert.equal(sounds[0].playing, false);
  assert.equal(sounds[0].unloaded, true);
});

test('rapid preview selection keeps only the newest sound', async () => {
  const { library, loads, sounds } = nativePlayback();
  const first = library.previewRingtone('midnight-watch');
  await flush();
  const second = library.previewRingtone('copper-and-reed');
  await flush();
  loads[1]();
  await second;
  loads[0]();
  await first;
  assert.equal(sounds.filter((sound) => sound.playing).length, 1);
  assert.equal(sounds[1].unloaded, true);
  await library.stopPreview();
  assert.equal(sounds.some((sound) => sound.playing), false);
});

test('an answered call cannot start ringing after its load completes', async () => {
  const { library, loads, sounds } = nativePlayback();
  const pending = library.startCallRingtone('midnight-watch');
  await flush();
  await library.stopCallRingtone();
  loads[0]();
  await pending;
  assert.equal(sounds[0].unloaded, true);
  assert.equal(sounds[0].playing, false);
});

test('stopping a preview does not stop an incoming call', async () => {
  const { library, loads, sounds } = nativePlayback();
  const pending = library.startCallRingtone('midnight-watch');
  await flush();
  loads[0]();
  await pending;
  await library.stopPreview();
  assert.equal(sounds[0].playing, true);
  await library.stopCallRingtone();
});

test('stored ciphertext and nonce round-trip with a reloaded session secret', () => {
  const crypto = loadModule('src/lib/e2ee-pro.ts', { 'expo-crypto': {} });
  const nacl = require('tweetnacl');
  const { encodeBase64 } = require('tweetnacl-util');
  const secret = encodeBase64(nacl.randomBytes(32));
  let session = crypto.initializeSessionFromSharedSecret(secret, 'recipient-device');
  for (const text of ['First message', 'Next message', 'Mobile to web']) {
    const result = crypto.encryptMessageE2EEPro(text, session, 'sender-device', 'identity');
    session = result.newSession;
    assert.equal(crypto.decryptMessageWithSharedSecret(result.encrypted.ciphertext, result.encrypted.nonce, secret), text);
    assert.equal(crypto.decryptMessageWithSharedSecret(result.encrypted.ciphertext, result.encrypted.nonce, encodeBase64(nacl.randomBytes(32))), null);
  }
});