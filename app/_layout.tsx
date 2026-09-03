import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { CallOverlay } from '@/components/CallOverlay';
import { TabActivityBadge } from '@/components/TabActivityBadge';
import { AppProvider } from '@/context/AppContext';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  return (
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
        <Stack.Screen name="security/mfa" options={{ headerShown: false }} />
        <Stack.Screen name="security/e2ee" options={{ headerShown: false }} />
        <Stack.Screen name="security/account" options={{ headerShown: false }} />
        <Stack.Screen name="security/privacy" options={{ headerShown: false }} />
      </Stack>
    </AppProvider>
  );
}
