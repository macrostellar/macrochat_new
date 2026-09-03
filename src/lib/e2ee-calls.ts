/**
 * Call-specific E2EE encryption/decryption for secure signaling.
 * Encrypts SDP (Session Description Protocol) and ICE candidates
 * so the signaling server cannot listen to or decode call setup.
 */

import { encryptTextWithPassphrase, decryptTextWithPassphrase } from './e2ee';

/**
 * Encrypt call signaling data (SDP offer/answer) with passphrase.
 * @param sdp The Session Description Protocol string
 * @param passphrase The E2EE passphrase
 * @returns Encrypted ciphertext and nonce for signaling transmission
 */
export function encryptCallSignaling(sdp: string, passphrase: string) {
  const { ciphertext, nonce } = encryptTextWithPassphrase(sdp, passphrase);
  return { ciphertext, nonce };
}

/**
 * Decrypt call signaling data (SDP offer/answer) with passphrase.
 * @param ciphertext Encrypted SDP
 * @param nonce Decryption nonce
 * @param passphrase The E2EE passphrase
 * @returns Plaintext SDP if successful, null if decryption fails
 */
export function decryptCallSignaling(ciphertext: string, nonce: string, passphrase: string): string | null {
  return decryptTextWithPassphrase(ciphertext, nonce, passphrase);
}

/**
 * Encrypt ICE candidate for secure transmission over signaling server.
 * ICE candidates contain network information needed for peer connection.
 */
export function encryptICECandidate(candidate: RTCIceCandidate | string, passphrase: string) {
  const candidateStr = typeof candidate === 'string' ? candidate : candidate.candidate;
  const { ciphertext, nonce } = encryptTextWithPassphrase(candidateStr, passphrase);
  return { ciphertext, nonce };
}

/**
 * Decrypt ICE candidate with passphrase.
 */
export function decryptICECandidate(ciphertext: string, nonce: string, passphrase: string): string | null {
  return decryptTextWithPassphrase(ciphertext, nonce, passphrase);
}
