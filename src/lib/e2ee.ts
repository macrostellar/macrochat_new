import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';

const PASSPHRASE_KEY = 'macrochat.e2ee.passphrase';
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
  return getItem(PASSPHRASE_KEY);
}

export async function writeE2EEPassphrase(passphrase: string) {
  await setItem(PASSPHRASE_KEY, passphrase.trim());
}

export async function clearE2EEPassphrase() {
  await deleteItem(PASSPHRASE_KEY);
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
