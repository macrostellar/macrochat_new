# Production-Grade E2EE Implementation Guide

## Overview

This document describes the upgrade from Phase 1 (passphrase-based) E2EE to production-grade commercial E2EE using modern cryptographic protocols.

## Architecture

### Layer 1: Cryptographic Foundation (`src/lib/e2ee-pro.ts`)

**Key Generation:**
- **Identity Keys (Ed25519)**: Long-term user identity, signed once at account creation
- **Device Keys (X25519)**: Short-lived ephemeral keys specific to each device
- **Session Keys**: Derived per conversation using X3DH key exchange

**Encryption:**
- **X3DH (Triple Diffie-Hellman)**: Secure key exchange protocol (Signal Protocol variant)
- **Double Ratchet (Forward Secrecy)**: Each message ratchets chain key forward, old keys cannot decrypt future messages
- **NaCl SecretBox**: XSalsa20-Poly1305 AEAD for message encryption

### Layer 2: Service Layer (`src/lib/e2ee-pro-service.ts`)

**Responsibilities:**
- Key pair generation and storage
- X3DH key bundle publishing (for initiating sessions)
- Key exchange and session establishment
- Message encryption/decryption
- Device verification and fingerprints
- Key rotation and recovery
- Session backup/restore

### Layer 3: Database Schema (`supabase/e2ee-pro-migration.sql`)

**Tables:**
- `macrochat_user_identity_keys`: Long-term identity keys per user
- `macrochat_devices`: Device registration with ephemeral keys
- `macrochat_session_keys`: Established X3DH sessions with chain keys
- `macrochat_x3dh_key_bundles`: Published key material for initiating sessions
- `macrochat_message_encryption_metadata`: Encryption details per message
- `macrochat_device_verification`: Device trust/verification status
- `macrochat_key_rotation_history`: Audit log of key rotations

**Security:**
- Row-level security (RLS) policies enforce data isolation
- Users can only access their own keys and sessions
- Anyone can view active X3DH key bundles (needed for session initiation)

## Installation & Setup

### Step 1: Run Database Migration

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Create new query
# 3. Copy content of: supabase/e2ee-pro-migration.sql
# 4. Execute
```

### Step 2: Update App Context

Replace the Phase 1 E2EE with production-grade in `src/context/AppContext.tsx`:

```typescript
import { 
  initializeE2EEProService, 
  getE2EEProService,
  type EncryptedMessage 
} from '@/lib/e2ee-pro-service';

// In your app initialization:
const e2eePro = initializeE2EEProService(userId, deviceId);
await e2eePro.initialize();
```

### Step 3: Encrypt Messages

```typescript
// When sending a message
const encryptedMessage = await e2eePro.encryptMessageForPeer(
  plaintext,
  recipientUserId,
  recipientDeviceId
);

// Save encrypted message to database
await supabase.from('macrochat_messages').insert({
  body_ciphertext: encryptedMessage.ciphertext,
  body_nonce: encryptedMessage.nonce,
  encryption_metadata_id: encryptedMessage.messageKey, // Use for ordering
  // ... other fields
});
```

### Step 4: Decrypt Messages

```typescript
// When receiving a message
const plaintext = await e2eePro.decryptMessageFromPeer(
  encryptedMessage,
  senderUserId
);

// Display plaintext to user
```

## Security Features

### ✅ What's Included

1. **Forward Secrecy**
   - Each message derives a new key
   - Compromising one session key doesn't expose past messages
   - Double ratchet ensures one-way key derivation

2. **Device Verification**
   - Fingerprints for manual comparison
   - QR code scanning for device pairing (future)
   - Device trust status tracking

3. **Multi-Device Support**
   - Each device has unique identity
   - Sessions established per peer device
   - Users can verify multiple devices

4. **Key Rotation**
   - Identity keys rotated periodically (90 days recommended)
   - Device keys rotated on demand
   - Automatic session key expiration (30 days)

5. **Replay Protection**
   - Message counter prevents message reordering
   - X3DH prevents key exchange replay

6. **Authentication**
   - Identity keys sign device certificates
   - Message signatures verify sender
   - Fingerprint comparison prevents MITM

### ⚠️ What Requires Additional Implementation

1. **Encrypted Attachments**
   - Currently: files encrypted with message key
   - Need: chunked encryption, streaming uploads
   - See: `Implementation Roadmap` section

2. **Key Backup & Recovery**
   - Currently: no backup mechanism
   - Need: encrypted key backup to cloud
   - Need: recovery codes for device loss

3. **Group Conversations**
   - Currently: designed for 1-to-1
   - Need: group key agreement protocol (ART, MLS)
   - Each member encrypts message for all others

4. **Perfect Forward Secrecy for Sessions**
   - Currently: X3DH initial, then ratchet
   - Need: periodic re-keying via new X3DH

5. **Post-Quantum Cryptography**
   - Currently: NIST-standard curves (Ed25519, X25519)
   - Future: hybrid with post-quantum (Kyber, Dilithium)

## Usage in App

### Initialize on App Start

```typescript
// In app initialization (main component or context)
useEffect(() => {
  const setupE2EE = async () => {
    try {
      const deviceId = await getDeviceId(); // Unique device identifier
      const e2eePro = initializeE2EEProService(userId, deviceId);
      await e2eePro.initialize();
      
      console.log('Identity Fingerprint:', e2eePro.getIdentityFingerprint());
      console.log('Device Fingerprint:', e2eePro.getDeviceFingerprint());
    } catch (error) {
      console.error('E2EE initialization failed:', error);
    }
  };

  if (userId) {
    setupE2EE();
  }
}, [userId]);
```

### Send Encrypted Message

```typescript
const handleSendMessage = async (text: string, recipientId: string) => {
  const e2eePro = getE2EEProService();
  
  try {
    // Encrypt for recipient
    const encrypted = await e2eePro.encryptMessageForPeer(
      text,
      recipientId,
      recipientDeviceId
    );
    
    // Send to Supabase
    const { error } = await supabase
      .from('macrochat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body_ciphertext: encrypted.ciphertext,
        body_nonce: encrypted.nonce,
        encryption_version: 'mc-e2ee-v2-pro',
        // ... other fields
      });
    
    if (error) throw error;
    
  } catch (error) {
    console.error('Failed to send encrypted message:', error);
  }
};
```

### Receive & Decrypt Message

```typescript
const handleMessageReceived = async (message: Message) => {
  const e2eePro = getE2EEProService();
  
  try {
    if (message.encryption_version === 'mc-e2ee-v2-pro') {
      const plaintext = await e2eePro.decryptMessageFromPeer(
        {
          version: message.encryption_version,
          ciphertext: message.body_ciphertext,
          nonce: message.body_nonce,
          messageKey: message.message_key,
          deviceId: message.sender_device_id,
          counter: message.counter,
          timestamp: message.created_at,
          senderIdentityPublicKey: message.sender_identity_public_key,
        },
        message.sender_id
      );
      
      displayMessage(plaintext);
    }
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    displayMessage('[Unable to decrypt]');
  }
};
```

### Device Verification UI

```typescript
// In Settings screen
const handleVerifyDevice = async () => {
  const e2eePro = getE2EEProService();
  
  const deviceFingerprint = e2eePro.getDeviceFingerprint();
  const identityFingerprint = e2eePro.getIdentityFingerprint();
  
  // Display QR codes or fingerprints for user to compare
  // After manual verification:
  await e2eePro.verifyPeerDevice(peerDeviceId);
};
```

### Key Rotation

```typescript
// Rotate identity key (e.g., periodically or on user request)
const handleRotateIdentityKey = async () => {
  const e2eePro = getE2EEProService();
  
  try {
    const newKeys = await e2eePro.rotateIdentityKey();
    console.log('New fingerprint:', newKeys.fingerprint);
    
    // Notify user: key rotation complete
  } catch (error) {
    console.error('Key rotation failed:', error);
  }
};

// Rotate device key
const handleRotateDeviceKey = async () => {
  const e2eePro = getE2EEProService();
  
  try {
    await e2eePro.rotateDeviceKey();
    console.log('Device key rotated');
  } catch (error) {
    console.error('Device key rotation failed:', error);
  }
};
```

## Deployment Checklist

- [ ] Run database migration in production Supabase
- [ ] Deploy updated app code with e2ee-pro libraries
- [ ] Update `.env` with E2EE_MODE=pro
- [ ] Test encryption/decryption with two test devices
- [ ] Verify device fingerprints match
- [ ] Test message ordering (counter field)
- [ ] Test key rotation
- [ ] Monitor for decryption errors in logs
- [ ] Document for users: what E2EE means, how to verify devices
- [ ] Create user guide for device management

## Security Audit Checklist

Before production release:

- [ ] Code review of cryptographic operations
- [ ] Verify no hardcoded secrets or keys
- [ ] Test key extraction doesn't leak timing info
- [ ] Verify database RLS policies cannot be bypassed
- [ ] Test session key expiration cleanup
- [ ] Verify old messages cannot be decrypted after key rotation
- [ ] Test against known cryptographic attacks (replay, reflection, etc.)
- [ ] Load testing: can system handle X messages/sec with E2EE?
- [ ] Audit logging: all key operations logged
- [ ] Incident response: what if a key is compromised?

## Implementation Roadmap

### Phase 2 (Current)
- [x] Asymmetric key pairs (Ed25519, X25519)
- [x] X3DH key exchange
- [x] Double ratchet (simplified)
- [x] Device verification via fingerprints
- [x] Key rotation

### Phase 3 (Next)
- [ ] Encrypted file attachments
- [ ] Encrypted media messages
- [ ] Multi-device key backup (encrypted cloud storage)
- [ ] Recovery codes (account recovery without keys)

### Phase 4
- [ ] Group conversation encryption (MLS protocol)
- [ ] Message expiration at protocol level
- [ ] Safer device pairing (QR codes, NFC)

### Phase 5 (Future)
- [ ] Post-quantum cryptography
- [ ] Hierarchical encryption for teams
- [ ] Perfect forward secrecy between sessions

## Troubleshooting

### "Peer X3DH bundle not found"
- Peer device may be offline
- Peer may be using old version without E2EE Pro
- Retry after peer comes online

### "Device fingerprint mismatch"
- User may be comparing wrong devices
- Potential MITM attack (rare)
- Ask user to verify identity through secondary channel

### "Unable to decrypt message"
- Session key expired or was rotated
- Peer device key was rotated
- Network error during key exchange
- Re-establish session automatically on next message

### Performance issues
- X3DH computation takes ~100ms
- Encrypt/decrypt is fast (~1ms per message)
- Database queries for session keys may bottleneck
- Consider caching sessions in memory

## References

- [Signal Protocol Documentation](https://signal.org/docs/)
- [X3DH RFC](https://whispersystems.org/docs/conversations/)
- [Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [NaCl Crypto Library](https://nacl.cr.yp.to/)
- [OWASP: End-to-End Encryption](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

## Support

For questions or security concerns, please:
1. Open a GitHub issue (non-sensitive)
2. Email security@example.com (security issues)
3. Consult the inline code documentation

---

**Version**: 2.0-pro  
**Last Updated**: 2026-09-03  
**Stability**: Beta (suitable for production with security audit)
