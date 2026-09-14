import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function SecurityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: Platform.OS !== 'web',
        animationEnabled: true,
      }}
    >
      <Stack.Screen
        name="privacy"
        options={{
          title: 'Privacy',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="appearance"
        options={{
          title: 'Appearance',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="storage"
        options={{
          title: 'Data & Storage',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account & Recovery',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="mfa"
        options={{
          title: 'Two-Factor Authentication',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="e2ee"
        options={{
          title: 'End-to-End Encryption',
          headerBackTitle: 'Back',
        }}
      />
    </Stack>
  );
}
