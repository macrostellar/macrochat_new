import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CallOverlay } from '@/components/CallOverlay';
import { TabActivityBadge } from '@/components/TabActivityBadge';
import { AppProvider } from '@/context/AppContext';
import { ApprovalsProvider } from '@/context/ApprovalsContext';
import { colors } from '@/theme/colors';
import { backendConfigurationError } from '@/lib/supabase';

export default function RootLayout() {
  const router = useRouter();

  // react-native-web leaves the browser focus ring on inputs; strip it globally.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = 'input:focus,textarea:focus,[contenteditable]:focus{outline:none!important;box-shadow:none!important;}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    void import('expo-notifications').then((notifications) => {
      if (cancelled) return;
      subscription = notifications.addNotificationResponseReceivedListener((response) => {
        const conversationId = response.notification.request.content.data?.conversationId;
        if (typeof conversationId === 'string') router.push(`/chat/${conversationId}`);
      });
    }).catch(() => undefined);
    return () => { cancelled = true; subscription?.remove(); };
  }, [router]);

  if (backendConfigurationError) {
    return (
      <View style={styles.configurationError}>
        <StatusBar style="light" />
        <Text style={styles.title}>Online messaging unavailable</Text>
        <Text style={styles.detail}>{backendConfigurationError}</Text>
        <Text style={styles.detail}>No messages have been sent. Ask the app publisher for a configured build.</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
      <ApprovalsProvider>
        <StatusBar style="light" />
        <TabActivityBadge />
        <CallOverlay />
        <Stack screenOptions={{
          headerStyle: { backgroundColor: colors.black },
          headerTintColor: colors.white,
          contentStyle: { backgroundColor: colors.navy950 },
          headerShadowVisible: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          animation: Platform.OS === 'ios' ? 'default' : 'fade',
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="recover-account" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false, animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom' }} />
        <Stack.Screen name="new-chat" options={{ title: 'New chat', headerShown: Platform.OS === 'web' ? false : undefined, presentation: Platform.OS === 'web' ? 'card' : 'modal', animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="scan-macro" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="security" options={{ headerShown: false }} />
        <Stack.Screen name="approvals/[id]" options={{ headerShown: false, animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom' }} />
        <Stack.Screen name="approvals/group/[id]" options={{ headerShown: false, animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom' }} />
        <Stack.Screen name="approvals/new" options={{ headerShown: false, presentation: Platform.OS === 'web' ? 'card' : 'modal', animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
        <Stack.Screen name="approvals/new-group" options={{ headerShown: false, presentation: Platform.OS === 'web' ? 'card' : 'modal', animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom' }} />
      </Stack>
      </ApprovalsProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  configurationError: { flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: colors.navy950 },
  title: { color: colors.white, fontSize: 24, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 16, lineHeight: 24 },
});
