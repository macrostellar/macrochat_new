import { Redirect, Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { useApprovals } from '@/context/ApprovalsContext';
import { colors } from '@/theme/colors';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'chatbubble-ellipses', updates: 'radio', approvals: 'checkmark-done-circle', calls: 'call', people: 'people', settings: 'settings',
};

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { profile, loading, updates } = useApp();
  const { pendingForMe } = useApprovals();
  const unreadStatusCount = updates.filter((item) => !item.mine && !item.viewed).length;

  if (!loading && !profile) return <Redirect href="/" />;
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.neon,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: Platform.OS === 'web' && width >= 820
        ? { display: 'none' }
        : { backgroundColor: colors.black, borderTopColor: colors.blueDark, height: 78, paddingTop: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 9 },
      tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse'} color={color} size={size} />,
      tabBarBadge: route.name === 'updates' && unreadStatusCount > 0
        ? unreadStatusCount
        : route.name === 'approvals' && pendingForMe > 0 ? pendingForMe : undefined,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Chats' }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
      <Tabs.Screen name="people" options={{ title: 'People' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
