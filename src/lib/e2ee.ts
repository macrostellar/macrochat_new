import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';

const PASSPHRASE_KEY = 'macrochat.e2ee.passphrase';
const VERIFIER_KEY = 'macrochat.e2ee.verifier';
const VERIFIER_TEXT = 'macrochat-e2ee-key-verifier';
export const E2EE_VERSION = 'mc-e2ee-v1';

function deriveKey(passphrase: string) {
  const input = decodeUTF8(passphrase.trim());
  return nacl.hash(input).slice(0, nacl.secretbox.keyLength);
}

async function getItem(key: string) {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function readE2EEPassphrase() {
  const passphrase = await getItem(PASSPHRASE_KEY);
  if (passphrase && !(await getItem(VERIFIER_KEY))) {
    await writeVerifier(passphrase);
  }
  return passphrase;
}

export async function writeE2EEPassphrase(passphrase: string) {
  const normalized = passphrase.trim();
  await setItem(PASSPHRASE_KEY, normalized);
  await writeVerifier(normalized);
}

export async function clearE2EEPassphrase() {
  await deleteItem(PASSPHRASE_KEY);
}

async function writeVerifier(passphrase: string) {
  const encrypted = encryptTextWithPassphrase(VERIFIER_TEXT, passphrase);
  await setItem(VERIFIER_KEY, JSON.stringify(encrypted));
}

export async function verifyE2EEPassphrase(passphrase: string) {
  const stored = await getItem(VERIFIER_KEY);
  if (!stored) return false;
  try {
    const verifier = JSON.parse(stored) as { ciphertext: string; nonce: string };
    return decryptTextWithPassphrase(verifier.ciphertext, verifier.nonce, passphrase.trim()) === VERIFIER_TEXT;
  } catch {
    return false;
  }
}

export function encryptTextWithPassphrase(text: string, passphrase: string) {
  const key = deriveKey(passphrase);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const message = decodeUTF8(text);
  const box = nacl.secretbox(message, nonce, key);
  return {
    version: E2EE_VERSION,
    ciphertext: encodeBase64(box),
    nonce: encodeBase64(nonce),
  };
}

export function decryptTextWithPassphrase(ciphertext: string, nonce: string, passphrase: string) {
  const key = deriveKey(passphrase);
  const opened = nacl.secretbox.open(decodeBase64(ciphertext), decodeBase64(nonce), key);
  if (!opened) return null;
  return encodeUTF8(opened);
}
