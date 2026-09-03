import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { enrollTOTP, listMFAFactors, removeMFAFactor, verifyTOTP, type MFAFactor } from '@/lib/mfa';
import { describeAuthFailure, getAccountRecoveryState } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function MFAScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { mfaAal2, refreshSecurityState } = useApp();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [secretUri, setSecretUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [recoveryConnected, setRecoveryConnected] = useState<boolean | null>(null);

  const loadFactors = async () => {
    setLoading(true);
    try {
      const [all, recovery] = await Promise.all([listMFAFactors(), getAccountRecoveryState()]);
      setRecoveryConnected(recovery.recoverable);
      setFactors(all);
      const pending = all.find((factor) => factor.status !== 'verified');
      setFactorId(pending?.id ?? all[0]?.id ?? null);
    } catch (error) {
      setNotice({ error: true, text: describeAuthFailure(error, 'mfa') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFactors(); }, []);

  const startEnrollment = async () => {
    if (!recoveryConnected) {
      setNotice({ error: true, text: 'Connect email, phone, or Google in Account and recovery before enabling 2FA.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const enrollment = await enrollTOTP('MacroChat Authenticator');
      setSecretUri(enrollment.totp.uri);
      setFactorId(enrollment.id);
      setNotice({ error: false, text: 'Scan the QR code, then enter the current 6-digit code from your authenticator app.' });
      await loadFactors();
    } catch (error) {
      setNotice({ error: true, text: describeAuthFailure(error, 'mfa') });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!factorId) return setNotice({ error: true, text: 'Enroll or select an authenticator factor first.' });
    if (!/^\d{6}$/.test(code.trim())) return setNotice({ error: true, text: 'Enter the current 6-digit authenticator code.' });
    setBusy(true);
    setNotice(null);
    try {
      await verifyTOTP(factorId, code.trim());
      setCode('');
      await refreshSecurityState();
      await loadFactors();
      setNotice({ error: false, text: 'Authenticator verified. This session now has AAL2 protection.' });
    } catch (error) {
      setNotice({ error: true, text: describeAuthFailure(error, 'mfa') });
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (factor: MFAFactor) => {
    const remove = async () => {
      setBusy(true);
      setNotice(null);
      try {
        await removeMFAFactor(factor.id);
        if (factor.id === factorId) setFactorId(null);
        setSecretUri(null);
        await refreshSecurityState();
        await loadFactors();
        setNotice({ error: false, text: 'Authenticator factor removed.' });
      } catch (error) {
        setNotice({ error: true, text: describeAuthFailure(error, 'mfa') });
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      if (globalThis.confirm(`Remove ${factor.friendlyName ?? 'this authenticator'}?`)) await remove();
      return;
    }
    Alert.alert('Remove authenticator?', 'You will need to enroll it again to use 2FA.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void remove() }]);
  };

  const content = (
      <ScrollView contentContainerStyle={[styles.content, Platform.OS === 'web' && width >= 820 && styles.webContent]}>
        {!(Platform.OS === 'web' && width >= 820) && (
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable>
          <Text style={styles.title}>2FA Security</Text>
        </View>
        )}

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Session Assurance</Text>
          <Text style={[styles.statusValue, { color: mfaAal2 ? colors.neon : colors.danger }]}>{mfaAal2 ? 'AAL2 Verified' : 'AAL1 (Not Verified)'}</Text>
          <Text style={styles.helper}>AAL2 is required once MFA RLS enforcement is active.</Text>
        </View>

        {notice && <View style={[styles.notice, { borderColor: notice.error ? colors.danger : colors.neon }]}><Ionicons name={notice.error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={notice.error ? colors.danger : colors.neon} /><Text style={styles.noticeText}>{notice.text}</Text></View>}

        {loading ? <ActivityIndicator color={colors.blue} style={{ marginTop: 20 }} /> : (
          <>
            <Text style={styles.section}>Enrolled Factors</Text>
            {factors.length === 0 ? <Text style={styles.empty}>No MFA factor enrolled yet.</Text> : factors.map((factor) => (
              <Pressable key={factor.id} accessibilityRole="button" style={[styles.factorRow, factor.id === factorId && styles.factorSelected]} onPress={() => setFactorId(factor.id)}>
                <View style={styles.factorCopy}><Text style={styles.factorName}>{factor.friendlyName ?? 'Authenticator'}</Text><Text style={[styles.factorStatus, { color: factor.status === 'verified' ? colors.neon : colors.blue }]}>{factor.status}</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${factor.friendlyName ?? 'authenticator'}`} style={styles.removeFactor} onPress={() => void removeFactor(factor)} disabled={busy}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
              </Pressable>
            ))}

            {recoveryConnected === false ? (
              <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/security/account')}><Text style={styles.primaryText}>Connect recovery method first</Text></Pressable>
            ) : (
              <Pressable accessibilityRole="button" style={[styles.primary, (busy || recoveryConnected === null) && styles.disabled]} onPress={startEnrollment} disabled={busy || recoveryConnected === null}><Text style={styles.primaryText}>{factors.length ? 'Add another authenticator' : 'Enable 2FA with authenticator'}</Text></Pressable>
            )}

            {secretUri && (
              <View style={styles.secretBox}>
                <Text style={styles.secretLabel}>SCAN WITH YOUR AUTHENTICATOR APP</Text>
                <View style={styles.qrWrap}><QRCode value={secretUri} size={180} color={colors.navy950} backgroundColor={colors.white} /></View>
                <Text style={styles.secretHint}>After scanning, enter the current 6-digit code below.</Text>
                <Text style={styles.secretLabel}>MANUAL SETUP URI</Text>
                <Text selectable style={styles.secretText}>{secretUri}</Text>
              </View>
            )}

            <Text style={styles.section}>Verify Code</Text>
            <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" placeholderTextColor={colors.muted} style={styles.input} maxLength={6} />
            <Pressable accessibilityRole="button" style={[styles.verify, (busy || !factorId) && styles.disabled]} onPress={verify} disabled={busy || !factorId}><Text style={styles.verifyText}>Verify 2FA Code</Text></Pressable>
          </>
        )}
      </ScrollView>
  );

  if (Platform.OS === 'web' && width >= 820) {
    return <WebSettingsShell activeId="mfa" title="Two-factor authentication" subtitle="Protect this account with a time-based authenticator code">{content}</WebSettingsShell>;
  }

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
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
  factorSelected: { borderColor: colors.blue },
  factorCopy: { flex: 1 },
  removeFactor: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  factorName: { color: colors.white, fontWeight: '700' },
  factorStatus: { fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  primary: { height: 50, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: colors.black, fontWeight: '900' },
  secretBox: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.navy800, padding: 10 },
  secretLabel: { color: colors.muted, fontSize: 11, marginBottom: 6 },
  qrWrap: { alignSelf: 'center', backgroundColor: colors.white, borderRadius: 8, padding: 10, marginVertical: 12 },
  secretHint: { color: colors.muted, textAlign: 'center', fontSize: 12, marginBottom: 18 },
  secretText: { color: colors.white, fontSize: 12 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
  verify: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  verifyText: { color: colors.black, fontWeight: '900' },
  notice: { borderWidth: 1, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { color: colors.white, fontSize: 12, lineHeight: 18, flex: 1 },
  disabled: { opacity: 0.5 },
});
