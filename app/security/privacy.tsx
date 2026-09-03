import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { Avatar } from '@/components/Avatar';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

function PrivacyToggle({ icon, title, detail, value, onChange }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Ionicons name={icon} size={20} color={colors.blue} /></View>
      <View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.detail}>{detail}</Text></View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.navy800, true: colors.blue }} thumbColor={value ? colors.neon : colors.muted} />
    </View>
  );
}

export default function PrivacyScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { chats, privacySettings, blockedContacts, updatePrivacySetting, blockContact, unblockContact } = useApp();
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const directContacts = chats.filter((chat) => !chat.isGroup && chat.participantUserId);
  const timerOptions = [
    { label: 'Off', value: null },
    { label: '1 hour', value: 3600 },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
    { label: '30 days', value: 2592000 },
  ] as const;

  const runContactAction = (title: string, message: string, action: () => Promise<void>) => {
    const run = async () => {
      setNotice(null);
      try {
        await action();
        setNotice({ error: false, text: title.includes('Unblock') ? 'Contact unblocked.' : 'Contact blocked. They can no longer message or call you.' });
      } catch (error) {
        setNotice({ error: true, text: error instanceof Error ? error.message : 'Privacy change failed.' });
      }
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) void run();
      return;
    }
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: title, style: 'destructive', onPress: () => void run() }]);
  };

  const saveSetting = async <Key extends keyof typeof privacySettings>(key: Key, value: (typeof privacySettings)[Key]) => {
    setNotice(null);
    try {
      await updatePrivacySetting(key, value);
      setNotice({ error: false, text: 'Privacy preference saved across your signed-in devices.' });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Privacy preference could not be saved.' });
    }
  };

  const content = (
    <ScrollView contentContainerStyle={[styles.content, Platform.OS === 'web' && width >= 820 && styles.webContent]}>
      {!(Platform.OS === 'web' && width >= 820) && <View style={styles.header}><Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable><Text style={styles.title}>Privacy</Text></View>}

      <Text style={styles.section}>LIVE PRIVACY CONTROLS</Text>
      {notice && <View style={[styles.notice, { borderColor: notice.error ? colors.danger : colors.neon }]}><Ionicons name={notice.error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={notice.error ? colors.danger : colors.neon} /><Text style={styles.noticeText}>{notice.text}</Text></View>}
      <PrivacyToggle icon="checkmark-done-outline" title="Read receipts" detail="Let direct-chat senders see when you have read their messages." value={privacySettings.readReceipts} onChange={(value) => void saveSetting('readReceipts', value)} />
      <PrivacyToggle icon="create-outline" title="Share typing activity" detail="Let people in the open chat see when you are typing or recording." value={privacySettings.shareTypingActivity} onChange={(value) => void saveSetting('shareTypingActivity', value)} />
      <PrivacyToggle icon="call-outline" title="Allow incoming calls" detail="When disabled, new audio and video calls are rejected automatically." value={privacySettings.allowIncomingCalls} onChange={(value) => void saveSetting('allowIncomingCalls', value)} />

      <Text style={styles.section}>DISAPPEARING MESSAGES</Text>
      <Text style={styles.intro}>Choose the default timer for new messages in direct chats. Existing messages keep their original expiry.</Text>
      <View style={styles.timerGrid}>{timerOptions.map((option) => <Pressable key={option.label} accessibilityRole="button" style={[styles.timerOption, privacySettings.defaultMessageTtlSeconds === option.value && styles.timerActive]} onPress={() => void saveSetting('defaultMessageTtlSeconds', option.value)}><Text style={[styles.timerText, privacySettings.defaultMessageTtlSeconds === option.value && styles.timerTextActive]}>{option.label}</Text></Pressable>)}</View>

      <Text style={styles.section}>BLOCK CONTACTS</Text>
      {directContacts.length === 0 ? <Text style={styles.empty}>No direct contacts available to block.</Text> : directContacts.map((chat) => <View key={chat.id} style={styles.contactRow}><Avatar name={chat.name} color={chat.avatarColor} size={40} /><View style={styles.copy}><Text style={styles.rowTitle}>{chat.name}</Text><Text style={styles.detail}>{chat.macroId}</Text></View><Pressable accessibilityRole="button" style={styles.blockButton} onPress={() => runContactAction('Block contact', `Block ${chat.name}? They will not be able to message or call you.`, () => blockContact(chat.participantUserId!))}><Text style={styles.blockText}>Block</Text></Pressable></View>)}

      <Text style={styles.section}>BLOCKED CONTACTS</Text>
      {blockedContacts.length === 0 ? <Text style={styles.empty}>No blocked contacts.</Text> : blockedContacts.map((contact) => <View key={contact.id} style={styles.contactRow}><Avatar name={contact.displayName} color={contact.avatarColor} size={40} /><View style={styles.copy}><Text style={styles.rowTitle}>{contact.displayName}</Text><Text style={styles.detail}>{contact.macroId}</Text></View><Pressable accessibilityRole="button" style={styles.unblockButton} onPress={() => runContactAction('Unblock contact', `Unblock ${contact.displayName}? They will be able to contact you again.`, () => unblockContact(contact.id))}><Text style={styles.unblockText}>Unblock</Text></Pressable></View>)}

      <View style={styles.info}>
        <Ionicons name="shield-checkmark-outline" size={24} color={colors.neon} />
        <View style={styles.copy}><Text style={styles.infoTitle}>Private by identity</Text><Text style={styles.detail}>Your email and phone remain recovery credentials. Contacts only see your Macro ID.</Text></View>
      </View>

    </ScrollView>
  );

  if (Platform.OS === 'web' && width >= 820) return <WebSettingsShell activeId="privacy" title="Privacy" subtitle="Control what activity and calls other people can reach">{content}</WebSettingsShell>;
  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 27, fontWeight: '900' },
  section: { color: colors.blue, fontSize: 11, fontWeight: '900', marginTop: 20, marginBottom: 8 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 38, height: 38, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  notice: { borderWidth: 1, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { color: colors.white, fontSize: 12, lineHeight: 18, flex: 1 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timerOption: { minWidth: 88, height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  timerActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  timerText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  timerTextActive: { color: colors.navy950 },
  contactRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  blockButton: { height: 36, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  blockText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  unblockButton: { height: 36, paddingHorizontal: 13, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  unblockText: { color: colors.navy950, fontWeight: '900', fontSize: 12 },
  empty: { color: colors.muted, paddingVertical: 14, fontSize: 12 },
  info: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoTitle: { color: colors.neon, fontSize: 14, fontWeight: '900' },
});