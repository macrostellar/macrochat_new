import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { requestAccountSignIn, verifyAccountSignIn, type AccountContactMethod } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function RecoverAccountScreen() {
  const { restoreProfile } = useApp();
  const [method, setMethod] = useState<AccountContactMethod>('email');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!destination.trim()) return Alert.alert('Missing details', `Enter your ${method}.`);
    setBusy(true);
    try {
      await requestAccountSignIn(method, destination);
      setCodeSent(true);
      Alert.alert('Verification sent', `Check your ${method} for the sign-in code.`);
    } catch (error) {
      Alert.alert('Could not send code', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 6) return Alert.alert('Invalid code', 'Enter the verification code.');
    setBusy(true);
    try {
      await verifyAccountSignIn(method, destination, code);
      const restored = await restoreProfile();
      if (!restored) throw new Error('No MacroChat profile is linked to this account.');
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Account recovery failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={23} color={colors.white} />
            </Pressable>
            <Text style={styles.title}>Recover account</Text>
          </View>

          <Text style={styles.intro}>Sign in with a contact method you previously connected. Your existing Macro ID and chats will be restored.</Text>

          <View style={styles.segmented}>
            {(['email', 'phone'] as const).map((option) => (
              <Pressable key={option} style={[styles.segment, method === option && styles.segmentActive]} onPress={() => { setMethod(option); setCodeSent(false); setCode(''); }}>
                <Ionicons name={option === 'email' ? 'mail-outline' : 'call-outline'} size={17} color={method === option ? colors.black : colors.muted} />
                <Text style={[styles.segmentText, method === option && styles.segmentTextActive]}>{option === 'email' ? 'Email' : 'Phone'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{method === 'email' ? 'EMAIL ADDRESS' : 'PHONE NUMBER'}</Text>
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

          {codeSent && (
            <>
              <Text style={styles.label}>VERIFICATION CODE</Text>
              <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" placeholderTextColor={colors.muted} style={styles.codeInput} maxLength={8} />
            </>
          )}

          <Pressable style={styles.primary} onPress={codeSent ? verify : sendCode} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>{codeSent ? 'Verify and restore' : 'Send verification code'}</Text>}
          </Pressable>

          {codeSent && <Pressable style={styles.secondary} onPress={() => { setCodeSent(false); setCode(''); }}><Text style={styles.secondaryText}>Use a different {method}</Text></Pressable>}
          <Text style={styles.notice}>A public Macro ID alone cannot unlock an account. This prevents anyone who knows your username from taking it over.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 28, fontWeight: '900' },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 22 },
  segmented: { height: 46, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 3, marginBottom: 22 },
  segment: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
  segmentActive: { backgroundColor: colors.blue },
  segmentText: { color: colors.muted, fontWeight: '800' },
  segmentTextActive: { color: colors.black },
  label: { color: colors.blue, fontWeight: '800', fontSize: 11, marginBottom: 8, marginTop: 4 },
  input: { height: 54, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 16, marginBottom: 18 },
  codeInput: { height: 54, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 20, fontWeight: '800', marginBottom: 18 },
  primary: { height: 52, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.black, fontWeight: '900', fontSize: 15 },
  secondary: { height: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.blue, fontWeight: '800' },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 18 },
});