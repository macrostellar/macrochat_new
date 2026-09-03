import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(timer);
  }, [router]);

  return <View style={styles.screen}><ActivityIndicator color={colors.blue} /><Text style={styles.text}>Completing secure sign-in...</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy950, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { color: colors.muted, fontSize: 13 },
});