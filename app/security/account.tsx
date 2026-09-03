import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import {
  getAccountRecoveryState,
  describeAuthFailure,
  linkGoogleIdentity,
  requestAccountContactLink,
  verifyAccountContactLink,
  type AccountContactMethod,
} from '@/lib/supabase';
import { colors } from '@/theme/colors';

type RecoveryState = Awaited<ReturnType<typeof getAccountRecoveryState>>;
type Notice = { tone: 'success' | 'error'; text: string; canRecover?: boolean };

function normalizeContact(method: AccountContactMethod, value: string) {
  const normalized = value.trim();
  if (method === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email address.');
    return normalized.toLowerCase();
  }
  const compact = normalized.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) throw new Error('Use an international phone number such as +47 123 45 678.');
  return compact;
}

export default function AccountSecurityScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { loading, profile } = useApp();
  const [state, setState] = useState<RecoveryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<AccountContactMethod>('email');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await getAccountRecoveryState());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Account recovery details could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (!loading && !profile) {
      router.replace('/');
      return;
    }
    if (profile) void refresh();
  }, [loading, profile, refresh, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    let normalized: string;
    try {
      normalized = normalizeContact(method, destination);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : `Enter a valid ${method}.` });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestAccountContactLink(method, normalized);
      setDestination(normalized);
      if (result.confirmed) {
        await refresh();
        setDestination('');
        setCode('');
        setCodeSent(false);
        setNotice({ tone: 'success', text: `Your ${method} is connected and can restore this Macro ID.` });
        return;
      }
      setCodeSent(true);
      setResendIn(60);
      setNotice({ tone: 'success', text: `Verification sent. Check your ${method} for the confirmation code.` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setNotice({
        tone: 'error',
        text: describeAuthFailure(error, method === 'email' ? 'email-link' : 'phone-link'),
        canRecover: method === 'email' && /already (been )?registered|already exists/i.test(detail),
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6,8}$/.test(code.trim())) {
      setNotice({ tone: 'error', text: 'Enter the 6 to 8 digit verification code.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await verifyAccountContactLink(method, destination, code);
      await refresh();
      setDestination('');
      setCode('');
      setCodeSent(false);
      setResendIn(0);
      setNotice({ tone: 'success', text: `Your ${method} can now restore this Macro ID.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The verification code could not be confirmed.' });
    } finally {
      setBusy(false);
    }
  };

  const connectGoogle = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await linkGoogleIdentity();
      await refresh();
      setNotice({ tone: 'success', text: 'Google can now restore this Macro ID on another device.' });
    } catch (error) {
      setNotice({ tone: 'error', text: describeAuthFailure(error, 'google-link') });
    } finally {
      setBusy(false);
    }
  };

  const cancelVerification = () => {
    setDestination('');
    setCode('');
    setCodeSent(false);
    setResendIn(0);
    setNotice(null);
  };

  const connectedValue = method === 'email' ? state?.email : state?.phone;

  const content = (
      <ScrollView contentContainerStyle={[styles.content, Platform.OS === 'web' && width >= 820 && styles.webContent]} keyboardShouldPersistTaps="handled">
        {!(Platform.OS === 'web' && width >= 820) && (
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Account & recovery</Text>
        </View>
        )}

        {loadError ? (
          <View style={styles.errorState}>
            <Ionicons name="cloud-offline-outline" color={colors.danger} size={24} />
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={refresh}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        ) : !state ? <ActivityIndicator color={colors.blue} /> : (
          <View style={styles.status}>
            <Ionicons name={state.recoverable ? 'shield-checkmark' : 'phone-portrait-outline'} color={state.recoverable ? colors.neon : colors.blue} size={25} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>{state.recoverable ? 'Recovery enabled' : 'Username-only account'}</Text>
              <Text style={styles.statusText}>{state.recoverable ? 'Your Macro ID can be restored on another device.' : 'Private and anonymous. This account currently exists only on this device.'}</Text>
            </View>
          </View>
        )}

        {notice && <View style={[styles.notice, notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess]}><Ionicons name={notice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} color={notice.tone === 'error' ? colors.danger : colors.neon} size={20} /><Text style={styles.noticeText}>{notice.text}</Text>{notice.canRecover && <Pressable accessibilityRole="button" onPress={() => router.push('/recover-account')}><Text style={styles.noticeAction}>Recover account</Text></Pressable>}</View>}

        <View style={styles.sectionHeading}><Text style={styles.section}>CONNECTED METHODS</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh recovery status" onPress={refresh} disabled={busy}><Ionicons name="refresh" color={colors.blue} size={18} /></Pressable></View>
        <View style={styles.methodRow}><Ionicons name="mail-outline" color={colors.blue} size={20} /><Text style={styles.methodLabel}>Email</Text><Text style={styles.methodValue}>{state?.email ?? 'Not connected'}</Text></View>
        <View style={styles.methodRow}><Ionicons name="call-outline" color={colors.blue} size={20} /><Text style={styles.methodLabel}>Phone</Text><Text style={styles.methodValue}>{state?.phone ?? 'Not connected'}</Text></View>
        <View style={styles.methodRow}><Ionicons name="logo-google" color={colors.blue} size={20} /><Text style={styles.methodLabel}>Google</Text><Text style={styles.methodValue}>{state?.providers.includes('google') ? 'Connected' : 'Not connected'}</Text></View>

        <Text style={styles.section}>{connectedValue ? 'CHANGE RECOVERY METHOD' : 'ADD RECOVERY METHOD'}</Text>
        <View style={styles.segmented}>
          {(['email', 'phone'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="button" style={[styles.segment, method === option && styles.segmentActive]} onPress={() => { setMethod(option); cancelVerification(); }}>
              <Text style={[styles.segmentText, method === option && styles.segmentTextActive]}>{option === 'email' ? 'Email' : 'Phone'}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={destination}
          onChangeText={setDestination}
          editable={!codeSent && !busy}
          keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={method === 'email' ? 'you@example.com' : '+47 000 00 000'}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        {codeSent && <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="Verification code" placeholderTextColor={colors.muted} style={styles.input} maxLength={8} />}
        <Pressable accessibilityRole="button" style={[styles.primary, (busy || !state) && styles.disabled]} onPress={codeSent ? verify : sendCode} disabled={busy || !state}>
          {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>{codeSent ? 'Verify code' : `${connectedValue ? 'Change' : 'Connect'} ${method}`}</Text>}
        </Pressable>
        {codeSent && <View style={styles.verificationActions}><Pressable accessibilityRole="button" onPress={sendCode} disabled={busy || resendIn > 0}><Text style={[styles.textAction, resendIn > 0 && styles.textActionDisabled]}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</Text></Pressable><Pressable accessibilityRole="button" onPress={cancelVerification} disabled={busy}><Text style={styles.cancelAction}>Cancel</Text></Pressable></View>}

        {!state?.providers.includes('google') && (
          <Pressable accessibilityRole="button" style={[styles.google, (busy || !state) && styles.disabled]} onPress={connectGoogle} disabled={busy || !state}>
            <Ionicons name="logo-google" size={18} color={colors.white} />
            <Text style={styles.googleText}>Connect Google</Text>
          </Pressable>
        )}

        <Text style={styles.note}>Email and phone are optional and are used only for account access. Other users continue to find you by your Macro ID.</Text>
      </ScrollView>
  );

  if (Platform.OS === 'web' && width >= 820) {
    return <WebSettingsShell activeId="account" title="Account and recovery" subtitle="Connect optional recovery methods without exposing them to contacts">{content}</WebSettingsShell>;
  }

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 27, fontWeight: '900' },
  status: { flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 16 },
  statusCopy: { flex: 1 },
  statusTitle: { color: colors.white, fontWeight: '900', fontSize: 17 },
  statusText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  section: { color: colors.blue, fontWeight: '800', fontSize: 11, marginTop: 24, marginBottom: 8 },
  sectionHeading: { marginTop: 24, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notice: { marginTop: 16, padding: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeSuccess: { borderColor: colors.neon },
  noticeError: { borderColor: colors.danger },
  noticeText: { color: colors.white, fontSize: 12, lineHeight: 18, flex: 1 },
  noticeAction: { color: colors.blue, fontSize: 12, fontWeight: '900' },
  methodRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  methodLabel: { color: colors.white, fontWeight: '800', width: 58 },
  methodValue: { color: colors.muted, flex: 1, textAlign: 'right' },
  segmented: { height: 44, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 3, marginBottom: 10 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  segmentActive: { backgroundColor: colors.blue },
  segmentText: { color: colors.muted, fontWeight: '800' },
  segmentTextActive: { color: colors.black },
  input: { height: 52, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 15, marginBottom: 10 },
  primary: { height: 50, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.black, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  verificationActions: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textAction: { color: colors.blue, fontWeight: '800', fontSize: 12 },
  textActionDisabled: { color: colors.muted },
  cancelAction: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  google: { height: 50, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  googleText: { color: colors.white, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 18 },
  errorState: { borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center', gap: 10 },
  errorText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retry: { minHeight: 40, paddingHorizontal: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.navy950, fontWeight: '900' },
});