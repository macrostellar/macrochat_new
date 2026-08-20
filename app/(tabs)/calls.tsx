import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

const calls = [{ name: 'Alex Rivera', meta: '↗ Today, 10:31 AM', color: '#55B9FF', video: true }, { name: 'Maya Chen', meta: '↙ Yesterday, 7:14 PM', color: '#A78BFA', video: false }];
export default function CallsScreen() {
	const { chats, signalingEnabled, signalingReady, activeCall, startAudioCall, startVideoCall, acceptIncomingCall, rejectIncomingCall, endActiveCall } = useApp();
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

	return <Screen><View style={styles.header}><Text style={styles.title}>Calls</Text><Pressable style={styles.new} onPress={quickAudioCall}><Ionicons name="call" size={21} color={colors.navy950} /></Pressable></View><View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: signalingEnabled && signalingReady ? colors.neon : colors.danger }]} /><Text style={styles.meta}>{signalingEnabled ? (signalingReady ? 'Signaling connected' : 'Signaling configured, reconnecting...') : 'Set EXPO_PUBLIC_SIGNALING_URL to enable in-app calls'}</Text></View>{activeCall && <View style={styles.activeCard}><Text style={styles.name}>{activeCall.status === 'ringing' && activeCall.incoming ? 'Incoming call' : `Call ${activeCall.status}`}</Text><Text style={styles.meta}>{activeCall.video ? 'Video' : 'Audio'} · {activeCall.incoming ? 'From contact' : 'To contact'}</Text><View style={styles.activeActions}>{activeCall.incoming ? <><Pressable style={styles.accept} onPress={acceptIncomingCall}><Text style={styles.activeText}>Accept</Text></Pressable><Pressable style={styles.reject} onPress={rejectIncomingCall}><Text style={styles.activeText}>Reject</Text></Pressable></> : <Pressable style={styles.reject} onPress={endActiveCall}><Text style={styles.activeText}>End</Text></Pressable>}</View></View>}<Pressable style={styles.link} onPress={copyLink}><View style={styles.linkIcon}><Ionicons name="link" size={23} color={colors.neon} /></View><View style={{ flex: 1 }}><Text style={styles.name}>Copy signaling endpoint</Text><Text style={styles.meta}>Useful for QA environments and shared setup</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={20} /></Pressable><Text style={styles.section}>RECENT</Text>{calls.map((item) => <View style={styles.row} key={item.name}><Avatar name={item.name} color={item.color} /><View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.meta}</Text></View><Pressable style={styles.action} onPress={quickAudioCall}><Ionicons name={item.video ? 'videocam-outline' : 'call-outline'} color={colors.blue} size={22} /></Pressable></View>)}</Screen>;
}
const styles = StyleSheet.create({ header: { padding: 20, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: colors.white, fontSize: 32, fontWeight: '900' }, new: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, statusRow: { marginHorizontal: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, statusDot: { width: 8, height: 8, borderRadius: 4 }, activeCard: { marginHorizontal: 20, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 14 }, activeActions: { marginTop: 8, flexDirection: 'row', gap: 8 }, accept: { minWidth: 100, height: 36, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }, reject: { minWidth: 100, height: 36, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }, activeText: { color: colors.black, fontWeight: '800' }, link: { margin: 20, padding: 16, backgroundColor: colors.navy800, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, linkIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' }, name: { color: colors.white, fontSize: 15, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 12, marginTop: 4 }, section: { color: colors.blue, marginHorizontal: 20, marginBottom: 7, fontSize: 11, letterSpacing: 1.5, fontWeight: '900' }, row: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 }, action: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' } });
