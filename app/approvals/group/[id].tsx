import { Platform, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApprovalGroupDetail } from '@/components/ApprovalViews';
import { Screen } from '@/components/Screen';
import { WebApprovals } from '@/components/WebSections';

export default function ApprovalGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= 820) return <WebApprovals initialGroupId={id} initialMode="group" />;
  return (
    <Screen>
      <ApprovalGroupDetail
        groupId={id}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/approvals'))}
        onNewRequest={() => router.push({ pathname: '/approvals/new', params: { groupId: id } })}
        onOpenChat={() => router.push({ pathname: '/chat/[id]', params: { id } })}
        onOpenRequest={(requestId) => router.push({ pathname: '/approvals/[id]', params: { id: requestId } })}
      />
    </Screen>
  );
}
