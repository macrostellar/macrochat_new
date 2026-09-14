/**
 * E2EE Pro Service Layer
 * 
 * Manages key generation, device registration, key exchange, and message encryption.
 * Integrates with Supabase and the e2ee-pro crypto library.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  generateUserIdentityKeyPair,
  generateDeviceEphemeralKeyPair,
  createX3DHKeyBundle,
  verifyX3DHKeyBundle,
  computeX3DHInitiator,
  computeX3DHResponder,
  initializeSessionFromSharedSecret,
  encryptMessageE2EEPro,
  decryptMessageE2EEPro,
  decryptMessageWithSharedSecret,
  decryptMessageWithSelfIdentityKey,
  computeFingerprint,
  verifyDeviceCertificate,
  type UserKeyPair,
  type DeviceKeyPair,
  type X3DHKeyBundle,
  type SessionKey,
  type EncryptedMessage,
} from './e2ee-pro';
import { supabase as sharedSupabase } from './supabase';

const supabase = sharedSupabase!;

// ============================================================================
// E2EE PRO SERVICE
// ============================================================================

export class E2EEProService {
  private userId: string;
  private deviceId: string;
  private userIdentityKeyPair: UserKeyPair | null = null;
  private deviceKeyPair: DeviceKeyPair | null = null;
  private sessionKeys: Map<string, SessionKey> = new Map();
  private initPromise: Promise<void> | null = null;

  constructor(userId: string, deviceId: string) {
    this.userId = userId;
    this.deviceId = deviceId;
  }

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initialize E2EE for this user/device.
   * Loads or creates identity keys, device keys, publishes key bundle, and loads active session keys.
   */
  async initialize(): Promise<void> {
    // Dedupe concurrent init calls (e.g. effect double-invocation) into a single run.
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.runInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async runInitialize(): Promise<void> {
    try {
      // Load or create identity keys
      const identityKeys = await this.loadOrCreateIdentityKeys();
      this.userIdentityKeyPair = identityKeys;

      // Load or create device ephemeral keys
      const deviceKeys = await this.loadOrCreateDeviceKeys();
      this.deviceKeyPair = deviceKeys;

      // Publish key bundle for other users to initiate sessions
      await this.publishX3DHKeyBundle();

      // Pre-load active session keys from DB
      await this.loadActiveSessions();

      console.log('E2EE Pro initialized successfully');
    } catch (error) {
      console.error('E2EE Pro initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load active sessions from database into memory cache.
   */
  async loadActiveSessions(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('macrochat_session_keys')
        .select('*')
        .or(`user_id.eq.${this.userId},peer_user_id.eq.${this.userId}`)
        .eq('is_active', true);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const peerUserId = row.user_id === this.userId ? row.peer_user_id : row.user_id;
          const peerDeviceId = row.user_id === this.userId ? row.peer_device_id : row.device_id;
          const sessionObj: SessionKey = {
            sharedSecret: row.shared_secret,
            chainKey: row.chain_key,
            messageKeyCounter: row.message_key_counter,
            createdAt: new Date(row.created_at).getTime(),
            peerDeviceId,
          };
          // Store by unique session ID and unique shared secret to prevent overwriting older session keys
          this.sessionKeys.set(row.id, sessionObj);
          this.sessionKeys.set(row.shared_secret, sessionObj);
          this.sessionKeys.set(`${peerUserId}:${peerDeviceId}`, sessionObj);
        }
      }
    } catch (error) {
      console.warn('Failed to load active sessions:', error);
    }
  }

  // ========================================================================
  // KEY MANAGEMENT
  // ========================================================================

  /**
   * Load user's identity keys from database, or create new ones.
   */
  async loadOrCreateIdentityKeys(): Promise<UserKeyPair> {
    try {
      // Try to load from database
      const { data, error } = await supabase
        .from('macrochat_user_identity_keys')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        return {
          identityPublicKey: data.identity_public_key,
          identitySecretKey: data.identity_secret_key,
          fingerprint: data.fingerprint,
          createdAt: new Date(data.created_at).getTime(),
        };
      }

      // No active key row yet. Upsert (ignoring a concurrent duplicate insert from
      // another init call) instead of a plain insert, which would 409 on a race.
      const newKeys = generateUserIdentityKeyPair();
      const { data: inserted, error: insertError } = await supabase
        .from('macrochat_user_identity_keys')
        .upsert({
          user_id: this.userId,
          identity_public_key: newKeys.identityPublicKey,
          identity_secret_key: newKeys.identitySecretKey,
          fingerprint: newKeys.fingerprint,
          created_at: new Date(newKeys.createdAt),
          is_active: true,
        }, { onConflict: 'user_id', ignoreDuplicates: true })
        .select('*')
        .maybeSingle();

      if (insertError) throw insertError;
      if (inserted) return newKeys;

      // Another call already created the row; fetch the authoritative keys.
      const { data: existing, error: existingError } = await supabase
        .from('macrochat_user_identity_keys')
        .select('*')
        .eq('user_id', this.userId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return {
          identityPublicKey: existing.identity_public_key,
          identitySecretKey: existing.identity_secret_key,
          fingerprint: existing.fingerprint,
          createdAt: new Date(existing.created_at).getTime(),
        };
      }

      return newKeys;
    } catch (error) {
      console.error('Failed to load/create identity keys:', error);
      throw error;
    }
  }

  /**
   * Load device ephemeral keys from local storage/database, or create new ones.
   */
  async loadOrCreateDeviceKeys(): Promise<DeviceKeyPair> {
    try {
      if (!this.userIdentityKeyPair) {
        throw new Error('Identity keys not initialized');
      }

      const storageKey = `macrochat.device_keypair.${this.userId}.${this.deviceId}`;
      try {
        const raw = Platform.OS === 'web'
          ? (typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null)
          : await SecureStore.getItemAsync(storageKey);
        if (raw) {
          const cachedKeys = JSON.parse(raw) as DeviceKeyPair;
          if (cachedKeys && cachedKeys.ephemeralPublicKey && cachedKeys.ephemeralSecretKey) {
            return cachedKeys;
          }
        }
      } catch (e) {
        console.warn('Failed to read device keys from storage:', e);
      }

      // Try to load device record from database
      const { data, error } = await supabase
        .from('macrochat_devices')
        .select('*')
        .eq('user_id', this.userId)
        .eq('device_id', this.deviceId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      const newKeys = generateDeviceEphemeralKeyPair(
        this.deviceId,
        this.userIdentityKeyPair.identitySecretKey
      );

      if (!data) {
        // Upsert so a concurrent init call racing on the same (user_id, device_id) pair
        // updates the row instead of hitting a unique-constraint conflict.
        const { error: upsertError } = await supabase.from('macrochat_devices').upsert({
          user_id: this.userId,
          device_id: this.deviceId,
          device_name: this.getDeviceName(),
          ephemeral_public_key: newKeys.ephemeralPublicKey,
          ephemeral_signature: newKeys.signedKeySignature,
          device_fingerprint: computeFingerprint(newKeys.ephemeralPublicKey),
          created_at: new Date(newKeys.createdAt),
          is_active: true,
          is_verified: false,
        }, { onConflict: 'user_id,device_id' });
        if (upsertError) console.warn('Failed to upsert device record:', upsertError.message);
      } else {
        // Device record exists, update public key and signature
        const { error: updateError } = await supabase.from('macrochat_devices').update({
          ephemeral_public_key: newKeys.ephemeralPublicKey,
          ephemeral_signature: newKeys.signedKeySignature,
          device_fingerprint: computeFingerprint(newKeys.ephemeralPublicKey),
        }).eq('id', data.id);
        if (updateError) console.warn('Failed to update device record:', updateError.message);
      }

      // Persist keypair in local storage so this device reuses the same ephemeral secret key across reloads
      try {
        const json = JSON.stringify(newKeys);
        if (Platform.OS === 'web') {
          if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, json);
        } else {
          await SecureStore.setItemAsync(storageKey, json);
        }
      } catch (e) {
        console.warn('Failed to save device keys to storage:', e);
      }

      return newKeys;
    } catch (error) {
      console.error('Failed to load/create device keys:', error);
      throw error;
    }
  }

  /**
   * Publish X3DH key bundle for initiating sessions.
   */
  async publishX3DHKeyBundle(): Promise<void> {
    try {
      if (!this.userIdentityKeyPair || !this.deviceKeyPair) {
        throw new Error('Keys not initialized');
      }

      const bundle = createX3DHKeyBundle(
        this.userIdentityKeyPair.identityPublicKey,
        this.deviceKeyPair.ephemeralPublicKey,
        this.deviceKeyPair.signedKeySignature,
        this.deviceId
      );

      // Save to database
      const { error } = await supabase.from('macrochat_x3dh_key_bundles').upsert({
        user_id: this.userId,
        device_id: this.deviceId,
        identity_public_key: bundle.identityKey,
        ephemeral_public_key: bundle.ephemeralKey,
        ephemeral_signature: bundle.ephemeralSignature,
        device_fingerprint: computeFingerprint(bundle.ephemeralKey),
        published_at: new Date(bundle.timestamp),
        is_active: true,
      }, { onConflict: 'user_id,device_id' });
      if (error) throw error;
    } catch (error) {
      console.error('Failed to publish X3DH key bundle:', error);
      throw error;
    }
  }

  // ========================================================================
  // KEY EXCHANGE
  // ========================================================================

  /**
   * Initiate a session with another user/device using X3DH.
   */
  async initiateSessionWithPeer(peerUserId: string, peerDeviceId: string): Promise<SessionKey> {
    try {
      if (!this.userIdentityKeyPair || !this.deviceKeyPair) {
        throw new Error('Keys not initialized');
      }

      // Fetch peer's X3DH key bundle
      const { data: peerBundle, error } = await supabase
        .from('macrochat_x3dh_key_bundles')
        .select('*')
        .eq('user_id', peerUserId)
        .eq('device_id', peerDeviceId)
        .eq('is_active', true)
        .single();

      if (error) throw new Error(`Peer X3DH bundle not found: ${error.message}`);

      // Verify the bundle
      const bundle: X3DHKeyBundle = {
        identityKey: peerBundle.identity_public_key,
        ephemeralKey: peerBundle.ephemeral_public_key,
        ephemeralSignature: peerBundle.ephemeral_signature,
        deviceId: peerBundle.device_id,
        timestamp: new Date(peerBundle.published_at).getTime(),
      };

      if (!verifyX3DHKeyBundle(bundle)) {
        throw new Error('Peer X3DH bundle verification failed');
      }

      // Compute shared secret using X3DH
      const sharedSecret = computeX3DHInitiator({
        myIdentitySecretKey: this.userIdentityKeyPair.identitySecretKey,
        myIdentityPublicKey: this.userIdentityKeyPair.identityPublicKey,
        myEphemeralSecretKey: this.deviceKeyPair.ephemeralSecretKey,
        peerBundle: bundle,
      });

      // Initialize session
      const session = initializeSessionFromSharedSecret(sharedSecret, peerDeviceId);

      // Save session to database
      const sessionKey = `${peerUserId}:${peerDeviceId}`;

      const { data: inserted, error: sessionError } = await supabase.from('macrochat_session_keys').upsert({
        user_id: this.userId,
        peer_user_id: peerUserId,
        device_id: this.deviceId,
        peer_device_id: peerDeviceId,
        shared_secret: sharedSecret, // In production, encrypt this before storing
        chain_key: session.chainKey,
        message_key_counter: session.messageKeyCounter,
        x3dh_bundle_id: peerBundle.id,
        created_at: new Date(session.createdAt),
        is_active: true,
      }).select('id').single();
      if (sessionError) throw sessionError;

      const keyId = inserted?.id || `sess-${Date.now()}`;
      this.sessionKeys.set(keyId, session);
      this.sessionKeys.set(sharedSecret, session);
      this.sessionKeys.set(sessionKey, session);

      console.log(`Session established with ${peerUserId}:${peerDeviceId}`);
      return session;
    } catch (error) {
      console.error('Failed to initiate session:', error);
      throw error;
    }
  }

  /**
   * Get or initiate session with a peer.
   */
  async getOrCreateSession(peerUserId: string, peerDeviceId: string): Promise<SessionKey> {
    const sessionKey = `${peerUserId}:${peerDeviceId}`;

    // Check in-memory cache first
    if (this.sessionKeys.has(sessionKey)) {
      return this.sessionKeys.get(sessionKey)!;
    }
    for (const session of this.sessionKeys.values()) {
      if (session.peerDeviceId === peerDeviceId) {
        return session;
      }
    }

    // Try to load from database (initiated by me or initiated by peer)
    const { data, error } = await supabase
      .from('macrochat_session_keys')
      .select('*')
      .or(`and(user_id.eq.${this.userId},peer_user_id.eq.${peerUserId}),and(user_id.eq.${peerUserId},peer_user_id.eq.${this.userId})`)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      let newestSession: SessionKey | null = null;
      for (const row of data) {
        const actualPeerDeviceId = row.user_id === this.userId ? row.peer_device_id : row.device_id;
        const session: SessionKey = {
          sharedSecret: row.shared_secret,
          chainKey: row.chain_key,
          messageKeyCounter: row.message_key_counter,
          createdAt: new Date(row.created_at).getTime(),
          peerDeviceId: actualPeerDeviceId,
        };

        this.sessionKeys.set(row.id, session);
        this.sessionKeys.set(row.shared_secret, session);
        this.sessionKeys.set(`${peerUserId}:${actualPeerDeviceId}`, session);
        if (!newestSession) newestSession = session;
      }
      if (newestSession) return newestSession;
    }

    // No session found, initiate new one
    return this.initiateSessionWithPeer(peerUserId, peerDeviceId);
  }

  // ========================================================================
  // MESSAGE ENCRYPTION/DECRYPTION
  // ========================================================================

  /**
   * Encrypt a message for a peer.
   */
  async encryptMessageForPeer(
    plaintext: string,
    peerUserId: string,
    peerDeviceId: string
  ): Promise<EncryptedMessage> {
    try {
      if (!this.userIdentityKeyPair) {
        throw new Error('Identity keys not initialized');
      }

      // Get or create session
      const session = await this.getOrCreateSession(peerUserId, peerDeviceId);

      // Encrypt the message
      const { encrypted, newSession } = encryptMessageE2EEPro(
        plaintext,
        session,
        this.deviceId,
        this.userIdentityKeyPair.identityPublicKey
      );

      // Update session in memory and database
      const sessionKey = `${peerUserId}:${peerDeviceId}`;
      this.sessionKeys.set(sessionKey, newSession);

      await supabase
        .from('macrochat_session_keys')
        .update({
          chain_key: newSession.chainKey,
          message_key_counter: newSession.messageKeyCounter,
        })
        .eq('user_id', this.userId)
        .eq('peer_user_id', peerUserId)
        .eq('device_id', this.deviceId)
        .eq('peer_device_id', peerDeviceId);

      return encrypted;
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      throw error;
    }
  }

  /**
   * Encrypt a message for a peer (auto-selects peer's primary device).
   * Convenience method that fetches peer's device ID automatically.
   * Queries the public X3DH key bundle table (has public read RLS policy).
   */
  async encryptMessageForPeerAuto(
    plaintext: string,
    peerUserId: string
  ): Promise<EncryptedMessage | null> {
    try {
      // Fetch peer's active X3DH key bundle (public read allowed by RLS)
      const { data: bundles, error } = await supabase
        .from('macrochat_x3dh_key_bundles')
        .select('device_id')
        .eq('user_id', peerUserId)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!bundles || bundles.length === 0) {
        console.warn('No active X3DH key bundles found for peer:', peerUserId);
        return null;
      }

      const peerDeviceId = bundles[0].device_id;
      return await this.encryptMessageForPeer(plaintext, peerUserId, peerDeviceId);
    } catch (error) {
      console.error('Failed to encrypt message for peer:', error);
      throw error;
    }
  }

  /**
   * Decrypt a message from a peer.
   */
  async decryptMessageFromPeer(
    encrypted: EncryptedMessage,
    peerUserId: string
  ): Promise<string | null> {
    try {
      // Get session with peer
      const session = await this.getOrCreateSession(peerUserId, encrypted.deviceId);

      // Decrypt the message
      const plaintext = decryptMessageE2EEPro(
        encrypted,
        session,
        encrypted.senderIdentityPublicKey
      );

      return plaintext;
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return null;
    }
  }

  /**
   * Attempt synchronous decryption of ciphertext using cached session keys or self-encryption key with peer.
   */
  decryptCiphertextSync(
    ciphertext: string,
    nonce: string,
    peerUserId: string
  ): string | null {
    if (!ciphertext || !nonce) return null;
    
    // Deduplicate shared secrets in memory
    const uniqueSecrets = new Set<string>();
    for (const session of this.sessionKeys.values()) {
      if (session.sharedSecret) uniqueSecrets.add(session.sharedSecret);
    }

    // Try every active session shared secret
    for (const secret of uniqueSecrets) {
      const decrypted = decryptMessageWithSharedSecret(ciphertext, nonce, secret);
      if (decrypted) return decrypted;
    }

    // Fallback: try self-identity derived key for self-sent messages
    if (this.userIdentityKeyPair?.identitySecretKey) {
      const decrypted = decryptMessageWithSelfIdentityKey(
        ciphertext,
        nonce,
        this.userIdentityKeyPair.identitySecretKey
      );
      if (decrypted) return decrypted;
    }

    return null;
  }

  // ========================================================================
  // DEVICE VERIFICATION
  // ========================================================================

  /**
   * Get current device fingerprint for manual verification.
   */
  getDeviceFingerprint(): string | null {
    if (!this.deviceKeyPair) return null;
    return computeFingerprint(this.deviceKeyPair.ephemeralPublicKey);
  }

  /**
   * Get user identity fingerprint for long-term verification.
   */
  getIdentityFingerprint(): string | null {
    if (!this.userIdentityKeyPair) return null;
    return this.userIdentityKeyPair.fingerprint;
  }

  /**
   * Mark a peer's device as verified.
   */
  async verifyPeerDevice(peerDeviceId: string): Promise<void> {
    try {
      // In production, this would involve:
      // 1. User scanning QR code of peer's device
      // 2. Comparing fingerprints
      // 3. Calling Supabase function to mark as verified

      const { error } = await supabase.rpc('mark_device_as_verified', {
        p_device_id: peerDeviceId,
        p_verifying_user_id: this.userId,
      });

      if (error) throw error;

      console.log('Device verified successfully');
    } catch (error) {
      console.error('Failed to verify device:', error);
      throw error;
    }
  }

  // ========================================================================
  // KEY ROTATION
  // ========================================================================

  /**
   * Rotate identity key (should be done periodically, e.g., every 90 days).
   */
  async rotateIdentityKey(): Promise<UserKeyPair> {
    try {
      if (!this.userIdentityKeyPair) {
        throw new Error('Current identity keys not loaded');
      }

      // Generate new identity key pair
      const newKeys = generateUserIdentityKeyPair();

      // Call database function to rotate
      const { error } = await supabase.rpc('rotate_user_identity_key', {
        p_user_id: this.userId,
        p_new_identity_public_key: newKeys.identityPublicKey,
        p_new_identity_secret_key: newKeys.identitySecretKey,
        p_new_fingerprint: newKeys.fingerprint,
      });

      if (error) throw error;

      // Update in-memory keys
      this.userIdentityKeyPair = newKeys;

      // Publish new key bundle
      await this.publishX3DHKeyBundle();

      console.log('Identity key rotated successfully');
      return newKeys;
    } catch (error) {
      console.error('Failed to rotate identity key:', error);
      throw error;
    }
  }

  /**
   * Rotate device ephemeral key.
   */
  async rotateDeviceKey(): Promise<DeviceKeyPair> {
    try {
      if (!this.userIdentityKeyPair) {
        throw new Error('Identity keys not initialized');
      }

      // Generate new device key pair
      const newKeys = generateDeviceEphemeralKeyPair(
        this.deviceId,
        this.userIdentityKeyPair.identitySecretKey
      );

      // Update in database
      await supabase
        .from('macrochat_devices')
        .update({
          ephemeral_public_key: newKeys.ephemeralPublicKey,
          ephemeral_signature: newKeys.signedKeySignature,
        })
        .eq('user_id', this.userId)
        .eq('device_id', this.deviceId);

      // Update in-memory keys
      this.deviceKeyPair = newKeys;

      // Publish updated key bundle
      await this.publishX3DHKeyBundle();

      // Clear all sessions (they will be re-established with new keys)
      this.sessionKeys.clear();

      console.log('Device key rotated successfully');
      return newKeys;
    } catch (error) {
      console.error('Failed to rotate device key:', error);
      throw error;
    }
  }

  // ========================================================================
  // UTILITIES
  // ========================================================================

  /**
   * Get device name based on platform.
   */
  private getDeviceName(): string {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
    if (typeof userAgent === 'string' && userAgent.length > 0) {
      return `${userAgent.split(' ').pop()} - ${this.deviceId}`;
    }
    return `${Platform.OS} - ${this.deviceId}`;
  }

  /**
   * Export all active sessions (for backup).
   */
  async exportSessions(): Promise<Record<string, SessionKey>> {
    const exported: Record<string, SessionKey> = {};
    this.sessionKeys.forEach((session, key) => {
      exported[key] = session;
    });
    return exported;
  }

  /**
   * Import sessions from backup.
   */
  importSessions(sessions: Record<string, SessionKey>): void {
    Object.entries(sessions).forEach(([key, session]) => {
      this.sessionKeys.set(key, session);
    });
  }

  matches(userId: string, deviceId: string): boolean {
    return this.userId === userId && this.deviceId === deviceId;
  }
}

// Export a singleton instance per user/device
let e2eeProService: E2EEProService | null = null;

export function initializeE2EEProService(userId: string, deviceId: string): E2EEProService {
  // Reuse the existing instance for the same user/device instead of creating a fresh one,
  // so a second concurrent call reuses the in-flight initialize() promise.
  if (e2eeProService && e2eeProService.matches(userId, deviceId)) {
    return e2eeProService;
  }
  e2eeProService = new E2EEProService(userId, deviceId);
  return e2eeProService;
}

export function getE2EEProService(): E2EEProService {
  if (!e2eeProService) {
    throw new Error('E2EE Pro service not initialized');
  }
  return e2eeProService;
}
