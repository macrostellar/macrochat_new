/**
 * E2EE Pro Service Layer
 * 
 * Manages key generation, device registration, key exchange, and message encryption.
 * Integrates with Supabase and the e2ee-pro crypto library.
 */

import { createClient } from '@supabase/supabase-js';
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
  computeFingerprint,
  verifyDeviceCertificate,
  type UserKeyPair,
  type DeviceKeyPair,
  type X3DHKeyBundle,
  type SessionKey,
  type EncryptedMessage,
} from './e2ee-pro';

// Assume you have Supabase client configured
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ============================================================================
// E2EE PRO SERVICE
// ============================================================================

export class E2EEProService {
  private userId: string;
  private deviceId: string;
  private userIdentityKeyPair: UserKeyPair | null = null;
  private deviceKeyPair: DeviceKeyPair | null = null;
  private sessionKeys: Map<string, SessionKey> = new Map();

  constructor(userId: string, deviceId: string) {
    this.userId = userId;
    this.deviceId = deviceId;
  }

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initialize E2EE for this user/device.
   * Loads or creates identity keys, device keys, and publishes key bundle.
   */
  async initialize(): Promise<void> {
    try {
      // Load or create identity keys
      const identityKeys = await this.loadOrCreateIdentityKeys();
      this.userIdentityKeyPair = identityKeys;

      // Load or create device ephemeral keys
      const deviceKeys = await this.loadOrCreateDeviceKeys();
      this.deviceKeyPair = deviceKeys;

      // Publish key bundle for other users to initiate sessions
      await this.publishX3DHKeyBundle();

      console.log('E2EE Pro initialized successfully');
    } catch (error) {
      console.error('E2EE Pro initialization failed:', error);
      throw error;
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
        .single();

      if (error && error.code === 'PGRST116') {
        // No keys found, create new ones
        const newKeys = generateUserIdentityKeyPair();

        // Save to database
        await supabase.from('macrochat_user_identity_keys').insert({
          user_id: this.userId,
          identity_public_key: newKeys.identityPublicKey,
          identity_secret_key: newKeys.identitySecretKey,
          fingerprint: newKeys.fingerprint,
          created_at: new Date(newKeys.createdAt),
          is_active: true,
        });

        return newKeys;
      }

      if (error) throw error;

      // Return loaded keys
      return {
        identityPublicKey: data.identity_public_key,
        identitySecretKey: data.identity_secret_key,
        fingerprint: data.fingerprint,
        createdAt: new Date(data.created_at).getTime(),
      };
    } catch (error) {
      console.error('Failed to load/create identity keys:', error);
      throw error;
    }
  }

  /**
   * Load device ephemeral keys from database, or create new ones.
   */
  async loadOrCreateDeviceKeys(): Promise<DeviceKeyPair> {
    try {
      if (!this.userIdentityKeyPair) {
        throw new Error('Identity keys not initialized');
      }

      // Try to load from database
      const { data, error } = await supabase
        .from('macrochat_devices')
        .select('*')
        .eq('user_id', this.userId)
        .eq('device_id', this.deviceId)
        .eq('is_active', true)
        .single();

      if (error && error.code === 'PGRST116') {
        // No device keys found, create new ones
        const newKeys = generateDeviceEphemeralKeyPair(
          this.deviceId,
          this.userIdentityKeyPair.identitySecretKey
        );

        // Save to database
        await supabase.from('macrochat_devices').insert({
          user_id: this.userId,
          device_id: this.deviceId,
          device_name: this.getDeviceName(),
          ephemeral_public_key: newKeys.ephemeralPublicKey,
          ephemeral_signature: newKeys.signedKeySignature,
          device_fingerprint: computeFingerprint(newKeys.ephemeralPublicKey),
          created_at: new Date(newKeys.createdAt),
          is_active: true,
          is_verified: false,
        });

        return newKeys;
      }

      if (error) throw error;

      // Return loaded device keys
      return {
        ephemeralPublicKey: data.ephemeral_public_key,
        ephemeralSecretKey: '', // Not loaded from DB for security (generate new on each session)
        deviceId: data.device_id,
        createdAt: new Date(data.created_at).getTime(),
        signedKeySignature: data.ephemeral_signature,
      };
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
      await supabase.from('macrochat_x3dh_key_bundles').upsert({
        user_id: this.userId,
        device_id: this.deviceId,
        identity_public_key: bundle.identityKey,
        ephemeral_public_key: bundle.ephemeralKey,
        ephemeral_signature: bundle.ephemeralSignature,
        device_fingerprint: computeFingerprint(bundle.ephemeralKey),
        published_at: new Date(bundle.timestamp),
        is_active: true,
      });

      console.log('X3DH key bundle published');
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
      this.sessionKeys.set(sessionKey, session);

      await supabase.from('macrochat_session_keys').upsert({
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
      });

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

    // Try to load from database
    const { data, error } = await supabase
      .from('macrochat_session_keys')
      .select('*')
      .eq('user_id', this.userId)
      .eq('peer_user_id', peerUserId)
      .eq('device_id', this.deviceId)
      .eq('peer_device_id', peerDeviceId)
      .eq('is_active', true)
      .single();

    if (!error && data) {
      // Found session in database
      const session: SessionKey = {
        sharedSecret: data.shared_secret,
        chainKey: data.chain_key,
        messageKeyCounter: data.message_key_counter,
        createdAt: new Date(data.created_at).getTime(),
        peerDeviceId,
      };

      this.sessionKeys.set(sessionKey, session);
      return session;
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

      if (error || !bundles || bundles.length === 0) {
        console.warn('No active X3DH key bundles found for peer:', peerUserId);
        return null;
      }

      const peerDeviceId = bundles[0].device_id;
      return await this.encryptMessageForPeer(plaintext, peerUserId, peerDeviceId);
    } catch (error) {
      console.error('Failed to encrypt message for peer:', error);
      return null;
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
    // In production, detect actual device name
    // For now, use a generic name
    if (typeof navigator !== 'undefined') {
      return `${navigator.userAgent.split(' ').pop()} - ${this.deviceId}`;
    }
    return this.deviceId;
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
}

// Export a singleton instance per user/device
let e2eeProService: E2EEProService | null = null;

export function initializeE2EEProService(userId: string, deviceId: string): E2EEProService {
  e2eeProService = new E2EEProService(userId, deviceId);
  return e2eeProService;
}

export function getE2EEProService(): E2EEProService {
  if (!e2eeProService) {
    throw new Error('E2EE Pro service not initialized');
  }
  return e2eeProService;
}
