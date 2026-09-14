import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CallOverlay } from '@/components/CallOverlay';
import { TabActivityBadge } from '@/components/TabActivityBadge';
import { AppProvider } from '@/context/AppContext';
import { colors } from '@/theme/colors';

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
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
      </Stack>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
