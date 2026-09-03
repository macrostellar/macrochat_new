import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { colors } from '@/theme/colors';

export default function E2EEScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();

  const content = (
      <ScrollView contentContainerStyle={[styles.content, Platform.OS === 'web' && width >= 820 && styles.webContent]}>
        {!(Platform.OS === 'web' && width >= 820) && (
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable>
          <Text style={styles.title}>Message Encryption</Text>
        </View>
        )}

        <View style={styles.card}>
          <Text style={styles.caption}>Status</Text>
          <Text style={[styles.state, { color: colors.neon }]}>✓ Enabled (E2EE Pro - Automatic)</Text>
          <Text style={styles.note}>Messages protected with Signal Protocol X3DH + Double Ratchet. Per-device encryption. Forward secrecy. Multi-device support.</Text>
        </View>

        <Text style={styles.section}>How MacroChat Protects Your Privacy</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="lock-closed" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>End-to-End Encryption</Text>
              <Text style={styles.infoText}>Every message is encrypted on your device before leaving. Only you and the recipient can read it.</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="key" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Your Keys Stay Private</Text>
              <Text style={styles.infoText}>Encryption keys are generated and stored only on your device. Not even MacroChat servers or admins can access your messages.</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="finger-print" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Device Identity Verification</Text>
              <Text style={styles.infoText}>Each device has a unique fingerprint. Verify fingerprints with contacts to ensure you're talking to the right person.</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>No Password Needed</Text>
              <Text style={styles.infoText}>Sign in once with your email. Encryption works silently in the background. No passphrase to remember.</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="trending-up" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Forward Secrecy</Text>
              <Text style={styles.infoText}>Even if a device key is compromised, past messages remain protected. Each message uses a unique encryption key.</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="call" size={18} color={colors.neon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Secure Calls & Media</Text>
              <Text style={styles.infoText}>Voice calls, video calls, and media files use the same military-grade encryption as your messages.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.privacyNotice]}>
          <Text style={styles.privacyTitle}>🔒 Your Privacy is Guaranteed</Text>
          <Text style={styles.privacyText}>MacroChat uses Signal Protocol — the same encryption standard trusted by WhatsApp, Signal, and tens of millions of users worldwide.</Text>
        </View>
      </ScrollView>
  );

  if (Platform.OS === 'web' && width >= 820) {
    return <WebSettingsShell activeId="e2ee" title="Message encryption" subtitle="Production-grade E2EE with Signal Protocol (automatic)">{content}</WebSettingsShell>;
  }

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontWeight: '900', fontSize: 30 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 16, padding: 14, marginBottom: 20 },
  caption: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  state: { marginTop: 8, fontSize: 18, fontWeight: '900' },
  note: { color: colors.muted, marginTop: 6, fontSize: 12, lineHeight: 18 },
  section: { color: colors.blue, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginBottom: 12, marginTop: 8 },
  infoCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 12, padding: 12, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTitle: { color: colors.white, fontWeight: '800', fontSize: 13 },
  infoText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  privacyNotice: { borderWidth: 2, borderColor: colors.neon, backgroundColor: 'rgba(0,255,200,0.08)', borderRadius: 12, padding: 14, marginTop: 16 },
  privacyTitle: { color: colors.neon, fontWeight: '900', fontSize: 13, marginBottom: 6 },
  privacyText: { color: colors.white, fontSize: 12, lineHeight: 18 },
});
