import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { hasNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import { getRingtoneLabel } from '@/lib/ringtones';

type NotificationSetting = 'on' | 'mentions' | 'off';

function NotificationToggle({ label, detail, value, options, onChange }: { label: string; detail: string; value: NotificationSetting; options: NotificationSetting[]; onChange: (value: NotificationSetting) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.optionGroup}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            accessibilityRole="button"
            style={[styles.optionButton, value === opt && styles.optionActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optionText, value === opt && styles.optionTextActive]}>
              {opt === 'on' ? 'On' : opt === 'mentions' ? '@' : 'Off'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { notificationPrefs, updateNotificationPrefs } = useApp();
  const isWide = Platform.OS === 'web' && width >= 820;
  const [permissionGranted, setPermissionGranted] = useState(true);

  useEffect(() => {
    void hasNotificationPermission().then(setPermissionGranted);
  }, []);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
    Alert.alert(
      granted ? 'Notifications enabled' : 'Permission denied',
      granted
        ? 'MacroChat can now alert you about messages and calls.'
        : 'Enable notifications for MacroChat in your device settings to receive alerts.'
    );
  };

  const handleSettingChange = async (key: keyof typeof notificationPrefs, value: any) => {
    if (key === 'sound' || key === 'vibration' || key === 'preview' || key === 'badge' || key === 'backgroundSync') {
      if (typeof value === 'boolean') {
        await updateNotificationPrefs({ [key]: value });
      }
    } else {
      await updateNotificationPrefs({ [key]: value });
    }
  };

  const content = (
    <ScrollView contentContainerStyle={[styles.content, isWide && styles.webContent]}>
      {!isWide && (
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Notifications</Text>
        </View>
      )}

      <Text style={styles.section}>NOTIFICATION TYPES</Text>
      <Text style={styles.intro}>Choose which notifications you want to receive from each category.</Text>
      {!permissionGranted && (
        <Pressable style={styles.permissionButton} onPress={handleRequestPermission}>
          <Ionicons name="notifications-outline" size={18} color={colors.navy950} />
          <Text style={styles.permissionButtonText}>Enable notifications</Text>
        </Pressable>
      )}
      <NotificationToggle
        label="Direct messages"
        detail="Personal chats"
        value={notificationPrefs.messages}
        options={['on', 'mentions', 'off']}
        onChange={(value) => handleSettingChange('messages', value)}
      />
      <NotificationToggle
        label="Calls"
        detail="Incoming calls and ring"
        value={notificationPrefs.calls}
        options={['on', 'off']}
        onChange={(value) => handleSettingChange('calls', value)}
      />
      <NotificationToggle
        label="Status updates"
        detail="Contact status posts"
        value={notificationPrefs.status}
        options={['on', 'mentions', 'off']}
        onChange={(value) => handleSettingChange('status', value)}
      />
      <NotificationToggle
        label="App updates"
        detail="System notifications"
        value={notificationPrefs.updates}
        options={['on', 'off']}
        onChange={(value) => handleSettingChange('updates', value)}
      />

      <Text style={styles.section}>SOUNDS</Text>
      <Pressable style={styles.row} onPress={() => router.push('/security/ringtone?target=message')}>
        <View style={styles.icon}>
          <Ionicons name="musical-notes-outline" size={20} color={colors.blue} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Message tone</Text>
          <Text style={styles.detail}>{getRingtoneLabel(notificationPrefs.messageRingtone)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/security/ringtone?target=call')}>
        <View style={styles.icon}>
          <Ionicons name="call-outline" size={20} color={colors.blue} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Call ringtone</Text>
          <Text style={styles.detail}>{getRingtoneLabel(notificationPrefs.callRingtone)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      <Text style={styles.section}>NOTIFICATION BEHAVIOR</Text>
      <NotificationToggleSwitch
        icon="volume-mute-outline"
        title="Play sound"
        detail="Play your chosen tone when new messages or calls arrive."
        value={notificationPrefs.sound}
        onChange={(value) => handleSettingChange('sound', value)}
      />
      <NotificationToggleSwitch
        icon="phone-portrait-outline"
        title="Vibration"
        detail="Vibrate when new messages arrive."
        value={notificationPrefs.vibration}
        onChange={(value) => handleSettingChange('vibration', value)}
      />
      <NotificationToggleSwitch
        icon="eye-outline"
        title="Show preview"
        detail="Display message preview in notifications."
        value={notificationPrefs.preview}
        onChange={(value) => handleSettingChange('preview', value)}
      />
      <NotificationToggleSwitch
        icon="notifications-outline"
        title="Show badge"
        detail="Display unread count badge on app icon."
        value={notificationPrefs.badge}
        onChange={(value) => handleSettingChange('badge', value)}
      />

      <Text style={styles.section}>BACKGROUND & PERFORMANCE</Text>
      <NotificationToggleSwitch
        icon="sync-outline"
        title="Background sync"
        detail="Sync messages in background for faster loading. Uses more battery."
        value={notificationPrefs.backgroundSync}
        onChange={(value) => handleSettingChange('backgroundSync', value)}
      />

      <Text style={styles.section}>QUIET HOURS (Optional)</Text>
      <Text style={styles.intro}>Mute notifications during specific times. Calls may still ring.</Text>
      <View style={styles.notImplemented}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
        <View style={styles.copy}>
          <Text style={styles.notImplemented}>Coming soon</Text>
          <Text style={styles.detail}>Custom quiet hours feature will be available in next update.</Text>
        </View>
      </View>

      <View style={styles.info}>
        <Ionicons name="information-circle-outline" size={24} color={colors.neon} />
        <View style={styles.copy}>
          <Text style={styles.infoTitle}>Browser & System Settings</Text>
          <Text style={styles.detail}>To receive notifications, ensure you have enabled them in your browser and device settings.</Text>
        </View>
      </View>
    </ScrollView>
  );

  if (isWide) return <WebSettingsShell activeId="notifications" title="Notifications" subtitle="Control when and how you get notified">{content}</WebSettingsShell>;
  return <Screen>{content}</Screen>;
}

function NotificationToggleSwitch({ icon, title, detail, value, onChange }: { icon: any; title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!value)}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.blue} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 27, fontWeight: '900' },
  section: { color: colors.blue, fontSize: 11, fontWeight: '900', marginTop: 20, marginBottom: 8 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  permissionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.neon, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 20 },
  permissionButtonText: { color: colors.navy950, fontSize: 14, fontWeight: '900' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 8 },
  icon: { width: 38, height: 38, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  optionGroup: { flexDirection: 'row', gap: 6 },
  optionButton: { width: 40, height: 32, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  optionActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  optionText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  optionTextActive: { color: colors.navy950 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.navy800, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.neon },
  toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  toggleThumbActive: { alignSelf: 'flex-end', backgroundColor: colors.navy950 },
  notImplemented: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8 },
  infoTitle: { color: colors.neon, fontSize: 14, fontWeight: '900' },
});
