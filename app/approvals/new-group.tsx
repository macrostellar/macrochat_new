import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { NewApprovalGroupForm } from '@/components/ApprovalViews';
import { Screen } from '@/components/Screen';
import { WebApprovals } from '@/components/WebSections';
import { colors } from '@/theme/colors';

export default function NewApprovalGroupScreen() {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= 820) return <WebApprovals initialMode="new-group" />;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/approvals'))}><Ionicons name="chevron-back" size={22} color={colors.white} /></Pressable>
        <View><Text style={styles.eyebrow}>2 OR MORE PEOPLE</Text><Text style={styles.title}>New approval group</Text></View>
      </View>
      <NewApprovalGroupForm onDone={(id) => router.replace({ pathname: '/approvals/group/[id]', params: { id } })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  back: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.blue, fontWeight: '800', letterSpacing: 1.4, fontSize: 10 },
  title: { color: colors.white, fontSize: 24, fontWeight: '900' },
});
