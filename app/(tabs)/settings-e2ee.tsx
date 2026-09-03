import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useState, useEffect } from 'react';
import { colors } from '@/theme/colors';

export default function E2EESettings() {
  const { e2eePro, profile } = useApp();
  const [identityFingerprint, setIdentityFingerprint] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [e2eeProEnabled, setE2eeProEnabled] = useState(false);

  useEffect(() => {
    const loadFingerprints = async () => {
      try {
        if (!e2eePro) {
          setLoading(false);
          return;
        }

        setE2eeProEnabled(true);
        const identity = e2eePro.getIdentityFingerprint();
        const device = e2eePro.getDeviceFingerprint();
        
        setIdentityFingerprint(identity);
        setDeviceFingerprint(device);
      } catch (error) {
        console.error('[E2EE Settings] Failed to load fingerprints:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFingerprints();
  }, [e2eePro]);

  const handleRotateIdentityKey = async () => {
    Alert.alert(
      'Rotate Identity Key?',
      'This will generate a new long-term identity key. Existing conversations may need re-verification.',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Rotate',
          onPress: async () => {
            try {
              if (!e2eePro) return;
              setLoading(true);
              await e2eePro.rotateIdentityKey();
              const newFingerprint = e2eePro.getIdentityFingerprint();
              setIdentityFingerprint(newFingerprint);
              Alert.alert('✓ Identity Key Rotated', 'Your new identity key fingerprint is displayed below.');
            } catch (error) {
              Alert.alert('Error', `Failed to rotate key: ${error}`);
              console.error('[E2EE Settings] Key rotation failed:', error);
            } finally {
              setLoading(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleRotateDeviceKey = async () => {
    Alert.alert(
      'Rotate Device Key?',
      'This will generate a new ephemeral key for this device. All sessions will be reset.',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Rotate',
          onPress: async () => {
            try {
              if (!e2eePro) return;
              setLoading(true);
              await e2eePro.rotateDeviceKey();
              const newFingerprint = e2eePro.getDeviceFingerprint();
              setDeviceFingerprint(newFingerprint);
              Alert.alert('✓ Device Key Rotated', 'Your new device key fingerprint is displayed below.');
            } catch (error) {
              Alert.alert('Error', `Failed to rotate key: ${error}`);
              console.error('[E2EE Settings] Device key rotation failed:', error);
            } finally {
              setLoading(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy950 }}>
      <ScrollView style={{ flex: 1, padding: 16 }} contentInsetAdjustmentBehavior="automatic">
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.white, marginBottom: 8 }}>
          End-to-End Encryption
        </Text>
        
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 24, lineHeight: 18 }}>
          Your messages are protected with military-grade encryption using the Signal Protocol. Only you and the recipient can read messages.
        </Text>

        {/* E2EE Pro Status */}
        <View style={{
          backgroundColor: colors.navy800,
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          borderLeftWidth: 4,
          borderLeftColor: e2eeProEnabled ? colors.neon : colors.danger,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.white }}>
              E2EE Pro (Production)
            </Text>
            <View style={{
              backgroundColor: e2eeProEnabled ? colors.neon : colors.danger,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.navy950 }}>
                {e2eeProEnabled ? 'ACTIVE' : 'INACTIVE'}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {e2eeProEnabled 
              ? 'Production-grade E2EE enabled. All messages use X3DH + Double Ratchet encryption.'
              : 'E2EE Pro not initialized. Using legacy encryption.'}
          </Text>
        </View>

        {loading ? (
          <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={colors.blue} />
          </View>
        ) : (
          <>
            {/* Identity Key Fingerprint */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.white, marginBottom: 8 }}>
                Identity Fingerprint (Long-term)
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12, lineHeight: 16 }}>
                This identifies you across all devices. Verify this with contacts for security.
              </Text>
              {identityFingerprint ? (
                <View style={{
                  backgroundColor: colors.navy700,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <Text style={{
                    fontSize: 11,
                    color: colors.white,
                    fontFamily: 'monospace',
                    lineHeight: 16,
                  }}>
                    {identityFingerprint.match(/.{1,32}/g)?.join('\n') || identityFingerprint}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.danger }}>Unable to load fingerprint</Text>
              )}
              <TouchableOpacity
                onPress={handleRotateIdentityKey}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.blue,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.blue, textAlign: 'center' }}>
                  Rotate Identity Key
                </Text>
              </TouchableOpacity>
            </View>

            {/* Device Fingerprint */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.white, marginBottom: 8 }}>
                Device Fingerprint (Ephemeral)
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12, lineHeight: 16 }}>
                This device's unique identifier. Changes when you rotate device keys.
              </Text>
              {deviceFingerprint ? (
                <View style={{
                  backgroundColor: colors.navy700,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <Text style={{
                    fontSize: 11,
                    color: colors.white,
                    fontFamily: 'monospace',
                    lineHeight: 16,
                  }}>
                    {deviceFingerprint.match(/.{1,32}/g)?.join('\n') || deviceFingerprint}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.danger }}>Unable to load fingerprint</Text>
              )}
              <TouchableOpacity
                onPress={handleRotateDeviceKey}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.blue,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.blue, textAlign: 'center' }}>
                  Rotate Device Key
                </Text>
              </TouchableOpacity>
            </View>

            {/* Security Features */}
            <View style={{
              backgroundColor: colors.navy800,
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.white, marginBottom: 12 }}>
                Security Features
              </Text>
              
              <SecurityFeature
                title="Forward Secrecy"
                description="Each message uses a unique key. Even if a key is compromised, old messages stay encrypted."
              />
              <SecurityFeature
                title="X3DH Key Exchange"
                description="Secure session establishment using triple Diffie-Hellman. Based on Signal Protocol."
              />
              <SecurityFeature
                title="Multi-Device Support"
                description="Seamless encryption across your devices. Each device has its own key pair."
              />
              <SecurityFeature
                title="Device Verification"
                description="Verify device fingerprints with contacts to prevent impersonation attacks."
              />
              <SecurityFeature
                title="Automatic Key Rotation"
                description="Keys rotate periodically. Old keys are archived for compliance."
              />
              <SecurityFeature
                title="Audit Logging"
                description="All key operations are logged for security compliance and incident response."
              />
            </View>

            {/* Privacy Notice */}
            <View style={{
              backgroundColor: colors.navy700,
              borderRadius: 8,
              padding: 12,
              marginBottom: 32,
            }}>
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                🔐 <Text style={{ fontWeight: '600', color: colors.white }}>Privacy Guaranteed</Text>
                {'\n\n'}
                Your encryption keys never leave this device. Messages are encrypted before leaving your device and can only be decrypted on the recipient's device.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SecurityFeature({ title, description }: { title: string; description: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.white, marginBottom: 4 }}>
        ✓ {title}
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted, lineHeight: 16 }}>
        {description}
      </Text>
    </View>
  );
}
