import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { enrollTOTP, listMFAFactors, verifyTOTP, type MFAFactor } from '@/lib/mfa';
import { colors } from '@/theme/colors';

export default function MFAScreen() {
  const router = useRouter();
  const { mfaAal2, refreshSecurityState } = useApp();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [secretUri, setSecretUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const loadFactors = async () => {
    setLoading(true);
    try {
      const all = await listMFAFactors();
      setFactors(all);
      const pending = all.find((factor) => factor.status !== 'verified');
      if (pending) setFactorId(pending.id);
    } catch (error) {
      Alert.alert('Unable to load MFA', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFactors(); }, []);

  const startEnrollment = async () => {
    try {
      const enrollment = await enrollTOTP('MacroChat Authenticator');
      setSecretUri(enrollment.totp.uri);
      setFactorId(enrollment.id);
      setChallengeId(null);
      Alert.alert('Scan this secret', 'Copy the URI below into your authenticator app if QR scan is unavailable.');
      await loadFactors();
    } catch (error) {
      Alert.alert('MFA enrollment failed', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const verify = async () => {
    if (!factorId) return Alert.alert('No factor selected', 'Enroll a factor first.');
    if (code.trim().length < 6) return Alert.alert('Invalid code', 'Enter the 6-digit authenticator code.');
    try {
      await verifyTOTP(factorId, code.trim(), challengeId ?? undefined);
      setChallengeId(challengeId);
      setCode('');
      await refreshSecurityState();
      await loadFactors();
      Alert.alert('MFA enabled', 'Your account is now verified for AAL2.');
    } catch (error) {
      Alert.alert('Verification failed', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable>
          <Text style={styles.title}>2FA Security</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Session Assurance</Text>
          <Text style={[styles.statusValue, { color: mfaAal2 ? colors.neon : colors.danger }]}>{mfaAal2 ? 'AAL2 Verified' : 'AAL1 (Not Verified)'}</Text>
          <Text style={styles.helper}>AAL2 is required once MFA RLS enforcement is active.</Text>
        </View>

        {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 20 }} /> : (
          <>
            <Text style={styles.section}>Enrolled Factors</Text>
            {factors.length === 0 ? <Text style={styles.empty}>No MFA factor enrolled yet.</Text> : factors.map((factor) => (
              <View key={factor.id} style={styles.factorRow}>
                <Text style={styles.factorName}>{factor.friendlyName ?? 'Authenticator'}</Text>
                <Text style={[styles.factorStatus, { color: factor.status === 'verified' ? colors.neon : colors.blue }]}>{factor.status}</Text>
              </View>
            ))}

            <Pressable style={styles.primary} onPress={startEnrollment}><Text style={styles.primaryText}>Enroll Authenticator (TOTP)</Text></Pressable>

            {secretUri && (
              <View style={styles.secretBox}>
                <Text style={styles.secretLabel}>TOTP URI</Text>
                <Text selectable style={styles.secretText}>{secretUri}</Text>
              </View>
            )}

            <Text style={styles.section}>Verify Code</Text>
            <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" placeholderTextColor={colors.muted} style={styles.input} maxLength={6} />
            <Pressable style={styles.verify} onPress={verify}><Text style={styles.verifyText}>Verify 2FA Code</Text></Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontWeight: '900', fontSize: 30 },
  statusCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 16, padding: 14, marginBottom: 16 },
  statusLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  statusValue: { marginTop: 8, fontSize: 22, fontWeight: '900' },
  helper: { color: colors.muted, marginTop: 6, fontSize: 12 },
  section: { color: colors.blue, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginTop: 10, marginBottom: 8 },
  empty: { color: colors.muted, marginBottom: 8 },
  factorRow: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  factorName: { color: colors.white, fontWeight: '700' },
  factorStatus: { fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  primary: { height: 50, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: colors.black, fontWeight: '900' },
  secretBox: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.navy800, padding: 10 },
  secretLabel: { color: colors.muted, fontSize: 11, marginBottom: 6 },
  secretText: { color: colors.white, fontSize: 12 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
  verify: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  verifyText: { color: colors.black, fontWeight: '900' },
});
