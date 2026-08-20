import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { QuantumField } from '@/components/QuantumField';
import { useApp } from '@/context/AppContext';
import { signInWithGoogle } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function WelcomeScreen() {
  const { profile, loading, register, backendMode } = useApp();
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
      useNativeDriver: true,
    }).start();

    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.65, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const ctaLoop = Animated.loop(Animated.sequence([
      Animated.timing(ctaFloat, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(ctaFloat, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
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
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 14 : 28}>
      <QuantumField />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.hero, entryStyle]}>
          <Animated.View style={[styles.logoHalo, { opacity: pulse }]} />
          <Image source={require('../assets/images/macrostellar-logo.png')} style={styles.logoImage} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={entryStyle}>
          <Text style={styles.brand}>MACROSTELLAR // MACROCHAT</Text>
          <Text style={styles.title}>Quantum private messaging.{`\n`}Signal-grade speed.</Text>
          <Text style={styles.body}>Create an anonymous Macro ID with zero email and zero phone requirements.</Text>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            value={name} onChangeText={setName} placeholder="How should people know you?"
            placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words"
            returnKeyType="done" onSubmitEditing={createIdentity} maxLength={32}
          />
          <Animated.View style={{ transform: [{ translateY: ctaFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
            <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.86, transform: [{ scale: 0.99 }] }]} onPress={createIdentity} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.black} /> : <><Text style={styles.buttonText}>Create anonymous ID</Text><Ionicons name="arrow-forward" size={20} color={colors.black} /></>}
            </Pressable>
          </Animated.View>
          <Pressable style={({ pressed }) => [styles.googleButton, pressed && { opacity: 0.86 }]} onPress={continueWithGoogle} disabled={googleLoading}>
            {googleLoading
              ? <ActivityIndicator color={colors.white} />
              : <>
                <Ionicons name="logo-google" size={18} color={colors.white} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>}
          </Pressable>
          <View style={styles.security}><Ionicons name="shield-checkmark" color={colors.neon} size={16} /><Text style={styles.securityText}>Secure local identity · {backendMode === 'demo' ? 'Offline mode' : 'Online mode'}</Text></View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy950, overflow: 'hidden' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 46, paddingBottom: 42 },
  loading: { flex: 1, backgroundColor: colors.navy950, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 18 },
  logoHalo: { position: 'absolute', width: 126, height: 126, borderRadius: 63, backgroundColor: colors.glowBlue, top: -8 },
  logoImage: { width: 108, height: 108, marginBottom: 12 },
  brand: { color: colors.blue, fontWeight: '900', letterSpacing: 2.5, marginBottom: 18, fontSize: 11 },
  title: { color: colors.white, fontSize: 33, lineHeight: 41, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 16, marginBottom: 34 },
  label: { color: colors.blue, fontWeight: '800', fontSize: 11, letterSpacing: 1.4, marginBottom: 9 },
  input: { color: colors.white, backgroundColor: colors.navy800, borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, height: 58, fontSize: 16 },
  button: { height: 58, borderRadius: 16, backgroundColor: colors.neon, marginTop: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: colors.black, fontSize: 16, fontWeight: '900' },
  googleButton: { height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, marginTop: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  googleButtonText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  security: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center' },
  securityText: { color: colors.muted, fontSize: 12 },
});
