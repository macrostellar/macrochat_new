import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { QuantumField } from '@/components/QuantumField';
import { useApp } from '@/context/AppContext';
import { signInWithGoogle } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function WelcomeScreen() {
  const { profile, loading, register, restoreProfile, backendMode } = useApp();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const entry = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.7)).current;
  const ctaFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading && profile) router.replace('/(tabs)');
  }, [loading, profile]);

  useEffect(() => {
    Animated.timing(entry, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.65, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    const ctaLoop = Animated.loop(Animated.sequence([
      Animated.timing(ctaFloat, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(ctaFloat, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    pulseLoop.start();
    ctaLoop.start();
    return () => {
      pulseLoop.stop();
      ctaLoop.stop();
    };
  }, [ctaFloat, entry, pulse]);

  const createIdentity = async () => {
    if (name.trim().length < 2) return Alert.alert('Add a name', 'Enter at least two characters.');
    setSubmitting(true);
    try {
      await register(name);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Could not create identity', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const continueWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      const existingProfile = await restoreProfile();
      if (existingProfile) {
        router.replace('/(tabs)');
        return;
      }
      const suggestedName =
        name.trim()
        || session?.user.user_metadata?.full_name
        || session?.user.user_metadata?.name
        || (typeof session?.user.email === 'string' ? session.user.email.split('@')[0] : '')
        || 'Macro User';
      await register(suggestedName);
      router.replace('/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      Alert.alert('Google sign-in failed', message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const openRppLink = () => {
    if (Platform.OS === 'web') {
      window.open('https://rppnet.com', '_blank', 'noopener,noreferrer');
      return;
    }

    // no-op on native as this screen is web-first
  };

  if (loading || profile) return <View style={styles.loading}><ActivityIndicator color={colors.blue} /></View>;

  const entryStyle = {
    opacity: entry,
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 14 : 0}
    >
      <QuantumField />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Animated.View style={[styles.shell, entryStyle]}>
            <View style={styles.card}>
              <View style={styles.headerGroup}>
                <Animated.View style={[styles.logoHalo, { opacity: pulse }]} />
                <Image source={require('../assets/images/macrostellar-logo.png')} style={styles.logoImage} resizeMode="contain" />
              </View>

              <Text style={styles.brand}>MACROCHAT - BY MACROSTELLAR</Text>
              <Text style={styles.title}>Quantum private messaging.{`\n`}Signal-grade speed.</Text>
              <Text style={styles.body}>Create an anonymous Macro ID with zero email and zero phone requirements.</Text>

              <View style={styles.formWrap}>
                <Text style={styles.label}>DISPLAY NAME</Text>
                <TextInput
                  value={name} onChangeText={setName} placeholder="How should people know you?"
                  placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words"
                  returnKeyType="done" onSubmitEditing={createIdentity} maxLength={32}
                />

                <Animated.View style={{ transform: [{ translateY: ctaFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
                  <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]} onPress={createIdentity} disabled={submitting}>
                    {submitting ? <ActivityIndicator color={colors.black} /> : <><Text style={styles.buttonText}>Create anonymous ID</Text><Ionicons name="arrow-forward" size={20} color={colors.black} /></>}
                  </Pressable>
                </Animated.View>

                <Pressable style={({ pressed }) => [styles.googleButton, pressed && { opacity: 0.9 }]} onPress={continueWithGoogle} disabled={googleLoading}>
                  {googleLoading
                    ? <ActivityIndicator color={colors.white} />
                    : <>
                      <Ionicons name="logo-google" size={18} color={colors.white} />
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </>}
                </Pressable>

                <Pressable style={styles.recoverButton} onPress={() => router.push('/recover-account')}>
                  <Ionicons name="key-outline" size={17} color={colors.blue} />
                  <Text style={styles.recoverButtonText}>Recover existing account</Text>
                </Pressable>

                <View style={styles.security}><Ionicons name="shield-checkmark" color={colors.neon} size={16} /><Text style={styles.securityText}>Secure local identity · {backendMode === 'demo' ? 'Offline mode' : 'Online mode'}</Text></View>
              </View>
            </View>
          </Animated.View>
        </View>

        <Text style={styles.footer}>
          2026: Copyright © 2019-2025{' '}
          <Text style={styles.footerLink} onPress={openRppLink}>RPP Net.com</Text>
          {' '}– All rights reserved | Developed by{' '}
          <Text style={styles.footerBrand} onPress={openRppLink}>RPP TECHNOLOGY</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: colors.navy950,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: '100%',
    paddingBottom: 18,
  },
  content: {
    flex: 1,
    minHeight: 560,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  loading: { flex: 1, backgroundColor: colors.navy950, alignItems: 'center', justifyContent: 'center' },
  shell: { width: '100%', alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: 'rgba(9, 20, 31, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(120, 204, 255, 0.18)',
    boxShadow: '0 10px 22px rgba(103, 211, 255, 0.18)',
  },
  headerGroup: { alignItems: 'center', marginBottom: 12 },
  logoHalo: { position: 'absolute', width: 115, height: 115, borderRadius: 63, backgroundColor: 'rgba(0, 214, 255, 0.12)', top: -10 },
  logoImage: { width: 98, height: 98, marginBottom: 8 },
  brand: { color: colors.blue, fontWeight: '900', letterSpacing: 2.2, marginBottom: 14, fontSize: 12, textAlign: 'center' },
  title: {
    color: colors.white,
    fontSize: Platform.OS === 'web' ? 32 : 28,
    lineHeight: Platform.OS === 'web' ? 38 : 34,
    fontWeight: '800',
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 22,
    textAlign: 'center',
    maxWidth: 560,
    alignSelf: 'center',
  },
  formWrap: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: 6 },
  label: { color: colors.blue, fontWeight: '800', fontSize: 11, letterSpacing: 1.4, marginBottom: 8, marginTop: 6 },
  input: {
    color: colors.white,
    backgroundColor: 'rgba(18, 33, 48, 0.9)',
    borderColor: 'rgba(120, 204, 255, 0.18)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 15,
    marginBottom: 14,
    width: '100%',
    alignSelf: 'center',
  },
  button: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.neon,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    boxShadow: '0 0 16px rgba(109, 245, 194, 0.35)',
  },
  buttonText: { color: colors.black, fontSize: 16, fontWeight: '900' },
  googleButton: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120, 204, 255, 0.18)',
    backgroundColor: 'rgba(18, 33, 48, 0.9)',
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  googleButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  recoverButton: {
    height: 42,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
  },
  recoverButtonText: { color: colors.blue, fontSize: 13, fontWeight: '800' },
  security: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' },
  securityText: { color: colors.muted, fontSize: 12 },
  footer: {
    textAlign: 'center',
    color: 'rgba(181, 199, 219, 0.72)',
    fontSize: 8,
    letterSpacing: 0.2,
    fontWeight: '300',
    paddingHorizontal: 18,
    paddingBottom: 8,
    marginTop: 10,
  },
  footerLink: {
    color: '#9be9d1',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  footerBrand: {
    color: '#d5f6ff',
    fontWeight: '800',
    letterSpacing: 0.8,
    textDecorationLine: 'underline',
  },
});
