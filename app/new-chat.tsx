import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

const MACRO_ID_REGEX = /^MC-[A-Z]+-\d{4}$/i;

export default function NewChatScreen() {
  const params = useLocalSearchParams<{ macroId?: string | string[]; autoStart?: string | string[] }>();
  const { addChat } = useApp();
  const [macroId, setMacroId] = useState('');
  const [starting, setStarting] = useState(false);
  const autoStarted = useRef(false);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Connection timed out. Please try again.')), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  const start = useCallback(async (candidateMacroId?: string) => {
    const normalizedMacroId = (candidateMacroId ?? macroId).trim().toUpperCase();
    if (!MACRO_ID_REGEX.test(normalizedMacroId)) return Alert.alert('Invalid Macro ID', 'Use a format like MC-NOVA-1234.');
    if (starting) return;
    setStarting(true);
    try {
      const id = await withTimeout(addChat(normalizedMacroId), 12000);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
      Alert.alert('Could not connect privately', detail || 'Unknown error');
    } finally {
      setStarting(false);
    }
  }, [addChat, macroId, starting]);

  useEffect(() => {
    const nextMacroId = Array.isArray(params.macroId) ? params.macroId[0] : params.macroId;
    if (!nextMacroId) return;
    setMacroId(nextMacroId.toUpperCase());
  }, [params.macroId]);

  useEffect(() => {
    const nextMacroId = Array.isArray(params.macroId) ? params.macroId[0] : params.macroId;
    const shouldAutoStart = (Array.isArray(params.autoStart) ? params.autoStart[0] : params.autoStart) === '1';
    if (!nextMacroId || !shouldAutoStart || autoStarted.current || starting) return;
    if (!MACRO_ID_REGEX.test(nextMacroId.trim())) return;
    autoStarted.current = true;
    setMacroId(nextMacroId.toUpperCase());
    start(nextMacroId);
  }, [params.autoStart, params.macroId, start, starting]);

  return (
    <View style={styles.page}>
      <View style={styles.art}><Ionicons name="person-add" size={36} color={colors.neon} /></View>
      <Text style={styles.title}>Connect privately</Text>
      <Text style={styles.body}>Enter someone’s Macro ID. Their phone number and email remain private.</Text>
      <Text style={styles.label}>MACRO ID</Text>
      <TextInput value={macroId} onChangeText={setMacroId} placeholder="MC-NOVA-1234" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} style={styles.input} />
      <Pressable onPress={() => router.push('/scan-macro')} style={styles.scanButton}>
        <Ionicons name="qr-code-outline" size={20} color={colors.white} />
        <Text style={styles.scanButtonText}>Scan QR code</Text>
      </Pressable>
      <Pressable onPress={() => start()} disabled={starting} style={[styles.button, starting && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{starting ? 'Connecting...' : 'Start conversation'}</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.navy950} />
      </Pressable>
      <View style={styles.tip}><Ionicons name="qr-code-outline" size={22} color={colors.blue} /><View><Text style={styles.tipTitle}>Tip</Text><Text style={styles.tipText}>You can type Macro ID or scan QR code.</Text></View></View>
    </View>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.navy950, padding: 24 }, art: { marginTop: 24, width: 70, height: 70, borderRadius: 22, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.white, fontSize: 28, fontWeight: '900', marginTop: 22 }, body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 30 }, label: { color: colors.blue, fontWeight: '900', fontSize: 11, letterSpacing: 1.5, marginBottom: 9 }, input: { height: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 18, fontSize: 17, fontWeight: '700', letterSpacing: 1 }, scanButton: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 }, scanButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' }, button: { height: 56, borderRadius: 16, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14 }, buttonDisabled: { opacity: 0.6 }, buttonText: { color: colors.navy950, fontSize: 15, fontWeight: '900' }, tip: { flexDirection: 'row', gap: 13, backgroundColor: colors.navy800, borderRadius: 16, padding: 16, marginTop: 28 }, tipTitle: { color: colors.white, fontWeight: '800', fontSize: 13 }, tipText: { color: colors.muted, fontSize: 12, marginTop: 3 } });
