import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { NewApprovalRequestForm } from '@/components/ApprovalViews';
import { Screen } from '@/components/Screen';
import { WebApprovals } from '@/components/WebSections';
import { useApprovals } from '@/context/ApprovalsContext';
import { colors } from '@/theme/colors';

export default function NewApprovalRequestScreen() {
  const { groupId, editId } = useLocalSearchParams<{ groupId?: string; editId?: string }>();
  const { width } = useWindowDimensions();
  const { requests } = useApprovals();
  const editRequest = editId ? requests.find((request) => request.id === editId) : undefined;
  if (Platform.OS === 'web' && width >= 820) return editId ? <WebApprovals initialMode="edit" initialRequestId={editId} /> : <WebApprovals initialMode="new" initialGroupId={groupId} />;
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/approvals'))}><Ionicons name="chevron-back" size={22} color={colors.white} /></Pressable>
        <View><Text style={styles.eyebrow}>{editRequest ? 'UPDATE BEFORE DECISION' : 'SEND FOR SIGN-OFF'}</Text><Text style={styles.title}>{editRequest ? 'Edit request' : 'New request'}</Text></View>
      </View>
      <NewApprovalRequestForm
        key={editRequest?.id ?? 'new'}
        initialGroupId={groupId}
        editRequest={editRequest}
        onDone={(id) => router.replace({ pathname: '/approvals/[id]', params: { id } })}
        onCreateGroup={() => router.replace('/approvals/new-group')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  back: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.blue, fontWeight: '800', letterSpacing: 1.4, fontSize: 10 },
  title: { color: colors.white, fontSize: 24, fontWeight: '900' },
});
