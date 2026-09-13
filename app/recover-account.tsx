import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { requestAccountSignIn, verifyAccountSignIn, type AccountContactMethod } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function RecoverAccountScreen() {
  const { restoreProfile } = useApp();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  
  const [method, setMethod] = useState<AccountContactMethod>('email');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateDestination = (): boolean => {
    const trimmed = destination.trim();
    if (!trimmed) {
      setError(`Enter your ${method}.`);
      return false;
    }
    if (method === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        setError('Enter a valid email address.');
        return false;
      }
    } else if (method === 'phone') {
      const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
      if (!phoneRegex.test(trimmed)) {
        setError('Enter a valid phone number.');
        return false;
      }
    }
    return true;
  };

  const sendCode = async () => {
    setError(null);
    setSuccess(null);
    
    if (!validateDestination()) return;
    
    setBusy(true);
    try {
      await requestAccountSignIn(method, destination);
      setCodeSent(true);
      setSuccess(`Verification code sent to your ${method}. Check your inbox (including spam folder).`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Could not send code. Try again.`;
      setError(errorMsg);
      console.error('[recover-account] Send code error:', err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setSuccess(null);
    
    const trimmedCode = code.trim();
    if (trimmedCode.length < 6) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    
    setBusy(true);
    try {
      await verifyAccountSignIn(method, destination, trimmedCode);
      setSuccess('Code verified! Restoring your account...');
      
      const restored = await restoreProfile();
      if (!restored) throw new Error('No MacroChat profile found. This account may not have a profile.');
      
      // Brief delay to show success message
      await new Promise(resolve => setTimeout(resolve, 500));
      router.replace('/(tabs)');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Account recovery failed. Try again.';
      setError(errorMsg);
      console.error('[recover-account] Verify error:', err);
    } finally {
      setBusy(false);
    }
  };

  const switchMethod = () => {
    setCodeSent(false);
    setCode('');
    setError(null);
    setSuccess(null);
    setMethod(method === 'email' ? 'phone' : 'email');
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, isWeb && width >= 640 && styles.webContent]} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={23} color={colors.white} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Recover account</Text>
              <Text style={styles.subtitle}>Sign in to restore your account</Text>
            </View>
          </View>

          {/* Intro */}
          <Text style={styles.intro}>Sign in with an email or phone number you previously connected. Your Macro ID, chats, and settings will be restored.</Text>

          {/* Method Selector */}
          <View style={styles.segmented}>
            {(['email', 'phone'] as const).map((option) => (
              <Pressable 
                key={option} 
                style={[styles.segment, method === option && styles.segmentActive]} 
                onPress={() => switchMethod()}
                disabled={codeSent || busy}
              >
                <Ionicons 
                  name={option === 'email' ? 'mail-outline' : 'call-outline'} 
                  size={17} 
                  color={method === option ? colors.navy950 : colors.muted} 
                />
                <Text style={[styles.segmentText, method === option && styles.segmentTextActive]}>
                  {option === 'email' ? 'Email' : 'Phone'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Alert Messages */}
          {error && (
            <View style={[styles.alert, styles.alertError]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.alertText}>{error}</Text>
            </View>
          )}

          {success && (
            <View style={[styles.alert, styles.alertSuccess]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.neon} />
              <Text style={styles.alertText}>{success}</Text>
            </View>
          )}

          {/* Input Section */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>{method === 'email' ? 'EMAIL ADDRESS' : 'PHONE NUMBER'}</Text>
            <TextInput
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                setError(null);
              }}
              editable={!codeSent && !busy}
              keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={method === 'email' ? 'you@example.com' : '+1 (555) 000-0000'}
              placeholderTextColor={colors.muted}
              style={[styles.input, error && !codeSent && styles.inputError]}
            />
          </View>

          {/* Code Input */}
          {codeSent && (
            <View style={styles.inputSection}>
              <View style={styles.codeHeader}>
                <Text style={styles.label}>VERIFICATION CODE</Text>
                <Text style={styles.codeHint}>6 digits</Text>
              </View>
              <TextInput 
                value={code} 
                onChangeText={(text) => {
                  setCode(text);
                  setError(null);
                }} 
                keyboardType="number-pad" 
                placeholder="000000" 
                placeholderTextColor={colors.muted} 
                style={[styles.codeInput, error && styles.inputError]} 
                maxLength={8}
              />
              <Text style={styles.codeHint}>Enter the code sent to your {method}</Text>
            </View>
          )}

          {/* Primary Action Button */}
          <Pressable 
            style={[styles.primary, busy && styles.primaryDisabled]} 
            onPress={codeSent ? verify : sendCode} 
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.navy950} size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons 
                  name={codeSent ? 'shield-checkmark-outline' : 'mail-open-outline'} 
                  size={18} 
                  color={colors.navy950} 
                />
                <Text style={styles.primaryText}>
                  {codeSent ? 'Verify and restore account' : 'Send verification code'}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Secondary Action */}
          {codeSent && (
            <Pressable 
              style={styles.secondary} 
              onPress={switchMethod}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Try with {method === 'email' ? 'phone' : 'email'}</Text>
            </Pressable>
          )}

          {/* Help Text */}
          <View style={styles.helpSection}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.blue} />
            <View style={styles.helpText}>
              <Text style={styles.helpTitle}>Account security</Text>
              <Text style={styles.helpDetail}>Your account is protected by end-to-end encryption. A public Macro ID alone cannot unlock an account.</Text>
            </View>
          </View>

          {/* Footer Link */}
          <Pressable onPress={() => router.push('/')} style={styles.footerLink}>
            <Text style={styles.footerText}>Don&apos;t have an account? <Text style={styles.footerLinkText}>Create one</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  webContent: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingTop: 60, paddingBottom: 60 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 28 },
  back: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  headerText: { flex: 1 },
  title: { color: colors.white, fontSize: 28, fontWeight: '900', marginBottom: 4 },
  subtitle: { color: colors.muted, fontSize: 14 },

  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 28 },

  // Segmented control
  segmented: { height: 48, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 4, marginBottom: 28, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 7, opacity: 0.6 },
  segmentActive: { backgroundColor: colors.blue, opacity: 1 },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: colors.navy950 },

  // Alerts
  alert: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  alertError: { backgroundColor: 'rgba(255, 71, 87, 0.08)', borderColor: colors.danger },
  alertSuccess: { backgroundColor: 'rgba(113, 247, 159, 0.08)', borderColor: colors.neon },
  alertText: { color: colors.white, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '500' },

  // Input section
  inputSection: { marginBottom: 22 },
  label: { color: colors.blue, fontWeight: '800', fontSize: 11, marginBottom: 10, letterSpacing: 0.5 },
  input: { height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 16, fontSize: 16, fontWeight: '500' },
  inputError: { borderColor: colors.danger },
  
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  codeHint: { color: colors.muted, fontSize: 12, marginTop: 8, fontWeight: '500' },
  codeInput: { height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 16, fontSize: 24, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },

  // Button
  primary: { height: 56, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginTop: 12, flexDirection: 'row', gap: 10 },
  primaryDisabled: { opacity: 0.6 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryText: { color: colors.navy950, fontWeight: '900', fontSize: 16 },

  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.blue, borderRadius: 10, marginBottom: 24 },
  secondaryText: { color: colors.blue, fontWeight: '800', fontSize: 14 },

  // Help section
  helpSection: { marginTop: 32, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 10, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  helpText: { flex: 1 },
  helpTitle: { color: colors.neon, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  helpDetail: { color: colors.muted, fontSize: 12, lineHeight: 18 },

  // Footer
  footerLink: { marginTop: 32, alignItems: 'center', paddingVertical: 12 },
  footerText: { color: colors.muted, fontSize: 13 },
  footerLinkText: { color: colors.blue, fontWeight: '800' },
});