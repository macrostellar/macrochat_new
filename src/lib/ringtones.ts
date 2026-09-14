import { Platform } from 'react-native';
import { Audio } from 'expo-av';

const RINGTONE_BASE_URL =
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media';
export const CUSTOM_RINGTONE_PREFIX = 'custom:';

const BEEP_BASE_URL = 'https://reactsounds.sfo3.cdn.digitaloceanspaces.com/v1';

export type RingtoneOption = {
  id: string;
  label: string;
  /** File name inside the public `macrochat-media` bucket, or react-sounds identifier. */
  file: string;
  /** Whether this tone is from react-sounds library (web only). */
  isReactSound?: boolean;
};

/** Message notification tones (short beeps for incoming messages). */
export const MESSAGE_TONES: RingtoneOption[] = [
  { id: 'beep-high', label: 'Message', file: `${BEEP_BASE_URL}/notification/message.1eefe18.mp3` },
  { id: 'beep-low', label: 'Popup', file: `${BEEP_BASE_URL}/notification/popup.cf74b54.mp3` },
  { id: 'chime-short', label: 'Completed', file: `${BEEP_BASE_URL}/notification/completed.31e527e.mp3` },
  { id: 'ping-bright', label: 'Info', file: `${BEEP_BASE_URL}/notification/info.fc3baa4.mp3` },
  { id: 'ding-clear', label: 'Notification', file: `${BEEP_BASE_URL}/notification/notification.595d086.mp3` },
  { id: 'bell-soft', label: 'Reminder', file: `${BEEP_BASE_URL}/notification/reminder.6d68587.mp3` },
];

/** Call ringtones (all tones - longer, more prominent options for incoming calls). */
export const CALL_RINGTONES: RingtoneOption[] = [
  { id: 'copper-and-reed', label: 'Copper & Reed', file: 'Copper_and_Reed.mp3' },
  { id: 'saffron-and-birch', label: 'Saffron & Birch', file: 'Saffron_and_Birch.mp3' },
  { id: 'marble-wire', label: 'Marble Wire', file: 'Marble_Wire.mp3' },
  { id: 'verified-access', label: 'Verified Access', file: 'Verified_Access.mp3' },
  { id: 'private-latitude', label: 'Private Latitude', file: 'Private_Latitude.mp3' },
  { id: 'velvet-anchor', label: 'Velvet Anchor', file: 'Velvet_Anchor.mp3' },
  { id: 'midnight-watch', label: 'Midnight Watch', file: 'Midnight_Watch.mp3' },
  { id: 'obsidian-chamber', label: 'Obsidian Chamber', file: 'Obsidian_Chamber.mp3' },
  { id: 'velvet-threshold', label: 'Velvet Threshold', file: 'Velvet_Threshold.mp3' },
  { id: 'the-bamboo-key', label: 'The Bamboo Key', file: 'The_Bamboo_Key.mp3' },
  { id: 'beneath-the-frozen-peak', label: 'Beneath the Frozen Peak', file: 'Beneath_the_Frozen_Peak.mp3' },
];

/** Built-in tones served from the public `macrochat-media` bucket (all tones for custom picker). */
export const DEFAULT_RINGTONES: RingtoneOption[] = [
  ...MESSAGE_TONES,
  ...CALL_RINGTONES,
];

export function getRingtoneLabel(value: string): string {
  if (value.startsWith(CUSTOM_RINGTONE_PREFIX)) {
    const uri = value.slice(CUSTOM_RINGTONE_PREFIX.length);
    const name = decodeURIComponent(uri.split('/').pop() ?? 'Custom tone');
    return name.replace(/\.[^.]+$/, '');
  }
  return DEFAULT_RINGTONES.find((tone) => tone.id === value)?.label ?? 'Default';
}

function resolveRingtoneUri(value: string): string | null {
  if (value.startsWith(CUSTOM_RINGTONE_PREFIX)) {
    return value.slice(CUSTOM_RINGTONE_PREFIX.length) || null;
  }
  const tone = DEFAULT_RINGTONES.find((item) => item.id === value);
  return tone ? (tone.file.startsWith('https://') ? tone.file : `${RINGTONE_BASE_URL}/${tone.file}`) : null;
}

type Handle = { stop: () => Promise<void> };
type Playback = { generation: number; handle?: Handle; timer?: ReturnType<typeof setTimeout> };
const preview: Playback = { generation: 0 };
const call: Playback = { generation: 0 };
const message: Playback = { generation: 0 };

function stop(slot: Playback): Promise<void> {
  slot.generation++;
  clearTimeout(slot.timer);
  const handle = slot.handle;
  slot.handle = undefined;
  return handle?.stop().catch(() => undefined) ?? Promise.resolve();
}

async function play(slot: Playback, value: string, loop: boolean, limit?: number, onFinished?: () => void): Promise<void> {
  const stopped = stop(slot);
  const generation = slot.generation;
  const current = () => slot.generation === generation;
  const finish = () => {
    if (!current()) return;
    void stop(slot);
    onFinished?.();
  };
  const uri = resolveRingtoneUri(value);
  if (!uri) throw new Error('This sound is unavailable. Choose another tone.');
  try {
    if (Platform.OS === 'web') {
      const element = new globalThis.Audio(uri);
      element.volume = 0.8;
      element.loop = loop;
      element.onended = finish;
      slot.handle = { stop: async () => {
        element.onended = null;
        element.pause();
        element.removeAttribute('src');
        element.load();
      } };
      await element.play();
    } else {
      await stopped;
      if (!current()) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
      if (!current()) return;
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, isLooping: loop });
      if (!current()) { await sound.unloadAsync(); return; }
      slot.handle = { stop: async () => { sound.setOnPlaybackStatusUpdate(null); await sound.unloadAsync(); } };
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish && !loop) finish();
      });
      await sound.playAsync();
    }
    if (current() && limit) slot.timer = setTimeout(finish, limit);
  } catch (error) {
    if (!current()) return;
    finish();
    throw error;
  }
}

export function previewRingtone(value: string, onFinished?: () => void): Promise<void> {
  return play(preview, value, false, 8000, onFinished);
}

export function stopPreview(): Promise<void> { return stop(preview); }
export function playMessageTone(value: string): Promise<void> { return play(message, value, false, 4000); }
export function startCallRingtone(value: string): Promise<void> { return play(call, value, true); }
export function stopCallRingtone(): Promise<void> { return stop(call); }
