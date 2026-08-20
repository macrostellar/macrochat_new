import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'chatbubble-ellipses', updates: 'radio', calls: 'call', people: 'people', settings: 'settings',
};

export default function TabLayout() {
  const { profile, loading } = useApp();
  if (!loading && !profile) return <Redirect href="/" />;
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.neon,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.black, borderTopColor: colors.blueDark, height: 78, paddingTop: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 9 },
      tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse'} color={color} size={size} />,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Chats' }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
      <Tabs.Screen name="people" options={{ title: 'People' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
