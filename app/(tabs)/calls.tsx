import { Alert, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { WebCalls } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

function timeAgo(iso: string) {
	const diffMs = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function callOutcomeLabel(item: { incoming: boolean; outcome: string; durationSeconds: number }) {
	if (item.outcome === 'missed') return 'Missed';
	if (item.outcome === 'rejected') return item.incoming ? 'Declined' : 'Declined by contact';
	if (item.outcome === 'cancelled') return 'Cancelled';
	const minutes = Math.floor(item.durationSeconds / 60);
	const seconds = item.durationSeconds % 60;
	return `${item.incoming ? '↙' : '↗'} ${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CallsScreen() {
	const { width } = useWindowDimensions();
	const { chats, signalingEnabled, signalingReady, activeCall, callHistory, startAudioCall, acceptIncomingCall, rejectIncomingCall, endActiveCall } = useApp();
	if (Platform.OS === 'web' && width >= 820) return <WebCalls />;
	const firstDirectChat = chats.find((chat) => !chat.isGroup && chat.participantUserId);

	const quickAudioCall = async () => {
		if (!firstDirectChat) return Alert.alert('No direct contact', 'Start a private chat first to place a direct call.');
		try {
			await startAudioCall(firstDirectChat.id);
		} catch (error) {
			Alert.alert('Call unavailable', error instanceof Error ? error.message : 'Try again.');
		}
	};

	const copyLink = async () => {
		const url = signalingEnabled ? (process.env.EXPO_PUBLIC_SIGNALING_URL || '') : '';
		if (!url) {
			Alert.alert('No signaling URL', 'Set EXPO_PUBLIC_SIGNALING_URL first.');
			return;
		}
		await Clipboard.setStringAsync(url);
		Alert.alert('Signaling URL copied', 'Share this with testers who need the call signaling endpoint.');
	};

	return <Screen><View style={styles.header}><Text style={styles.title}>Calls</Text><Pressable style={styles.new} onPress={quickAudioCall}><Ionicons name="call" size={21} color={colors.navy950} /></Pressable></View><View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: signalingEnabled && signalingReady ? colors.neon : colors.danger }]} /><Text style={styles.meta}>{signalingEnabled ? (signalingReady ? 'Signaling connected' : 'Signaling configured, reconnecting...') : 'Set EXPO_PUBLIC_SIGNALING_URL to enable in-app calls'}</Text></View>{activeCall && <View style={styles.activeCard}><Text style={styles.name}>{activeCall.status === 'ringing' && activeCall.incoming ? 'Incoming call' : `Call ${activeCall.status}`}</Text><Text style={styles.meta}>{activeCall.video ? 'Video' : 'Audio'} · {activeCall.incoming ? 'From contact' : 'To contact'}</Text><View style={styles.activeActions}>{activeCall.incoming ? <><Pressable style={styles.accept} onPress={acceptIncomingCall}><Text style={styles.activeText}>Accept</Text></Pressable><Pressable style={styles.reject} onPress={rejectIncomingCall}><Text style={styles.activeText}>Reject</Text></Pressable></> : <Pressable style={styles.reject} onPress={endActiveCall}><Text style={styles.activeText}>End</Text></Pressable>}</View></View>}<Pressable style={styles.link} onPress={copyLink}><View style={styles.linkIcon}><Ionicons name="link" size={23} color={colors.neon} /></View><View style={{ flex: 1 }}><Text style={styles.name}>Copy signaling endpoint</Text><Text style={styles.meta}>Useful for QA environments and shared setup</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={20} /></Pressable><Text style={styles.section}>RECENT</Text>{callHistory.length === 0 ? <Text style={styles.meta}>No calls yet.</Text> : callHistory.map((item) => { const peer = chats.find((chat) => chat.participantUserId === item.peerUserId); return <View style={styles.row} key={item.id}><Avatar name={peer?.name || 'Contact'} color={peer?.avatarColor || colors.blue} /><View style={{ flex: 1 }}><Text style={styles.name}>{peer?.name || 'Contact'}</Text><Text style={[styles.meta, item.outcome === 'missed' && styles.missedCall]}>{callOutcomeLabel(item)} · {timeAgo(item.startedAt)}</Text></View><Pressable style={styles.action} onPress={() => startAudioCall(item.conversationId).catch((error) => Alert.alert('Call unavailable', error instanceof Error ? error.message : 'Try again.'))}><Ionicons name={item.video ? 'videocam-outline' : 'call-outline'} color={item.outcome === 'missed' ? colors.danger : colors.blue} size={22} /></Pressable></View>; })}</Screen>;
}
const styles = StyleSheet.create({ header: { padding: 20, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: colors.white, fontSize: 32, fontWeight: '900' }, new: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, statusRow: { marginHorizontal: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, statusDot: { width: 8, height: 8, borderRadius: 4 }, activeCard: { marginHorizontal: 20, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 14 }, activeActions: { marginTop: 8, flexDirection: 'row', gap: 8 }, accept: { minWidth: 100, height: 36, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }, reject: { minWidth: 100, height: 36, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }, activeText: { color: colors.black, fontWeight: '800' }, link: { margin: 20, padding: 16, backgroundColor: colors.navy800, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, linkIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' }, name: { color: colors.white, fontSize: 15, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 12, marginTop: 4 }, missedCall: { color: colors.danger }, section: { color: colors.blue, marginHorizontal: 20, marginBottom: 7, fontSize: 11, letterSpacing: 1.5, fontWeight: '900' }, row: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 }, action: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' } });
