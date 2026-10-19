import { Platform, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApprovalRequestDetail } from '@/components/ApprovalViews';
import { Screen } from '@/components/Screen';
import { WebApprovals } from '@/components/WebSections';

export default function ApprovalRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= 820) return <WebApprovals initialRequestId={id} />;
  return (
    <Screen>
      <ApprovalRequestDetail
        requestId={id}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/approvals'))}
        onOpenGroup={(groupId) => router.push({ pathname: '/approvals/group/[id]', params: { id: groupId } })}
        onEdit={(requestId) => router.push({ pathname: '/approvals/new', params: { editId: requestId } })}
      />
    </Screen>
  );
}
