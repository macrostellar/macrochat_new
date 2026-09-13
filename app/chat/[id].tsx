import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio, ResizeMode, Video } from 'expo-av';
import { Avatar } from '@/components/Avatar';
import { AmbientQuantumField } from '@/components/AmbientQuantumField';
import { MessageTimerBorder } from '@/components/MessageTimerBorder';
import { VideoThumbnail, clampVideoRatio } from '@/components/VideoThumbnail';
import { WebMessenger } from '@/components/WebMessenger';
import { STICKER_LIST, type Sticker } from '@/lib/stickers';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { Message } from '@/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function MessageTicks({ status }: { status: Message['status'] }) {
  if (status === 'sending') return <Text style={{ color: colors.muted, fontSize: 10 }}>◷</Text>;
  if (status === 'failed') return <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '900' }}>!</Text>;
  if (status === 'sent') return <Ionicons name="checkmark" size={15} color={colors.muted} />;
  return <Ionicons name="checkmark-done" size={16} color={colors.neon} />;
}

function deviceIcon(device?: 'mobile' | 'desktop' | 'web'): keyof typeof Ionicons.glyphMap {
  if (device === 'mobile') return 'phone-portrait-outline';
  if (device === 'desktop') return 'laptop-outline';
  return 'globe-outline';
}

function deviceLabel(device?: 'mobile' | 'desktop' | 'web') {
  if (device === 'mobile') return 'Mobile';
  if (device === 'desktop') return 'Desktop';
  return 'Web';
}

function CallMessageBubble({ item }: { item: Message }) {
  const isVideo = Boolean(item.callInfo?.video);
  const outcome = item.callInfo?.outcome || 'missed';
  const isMissed = outcome === 'missed';
  const isDeclined = outcome === 'rejected';

  let label = isVideo ? 'Video call' : 'Voice call';
  let detail = 'Accepted on another device';
  if (isMissed) detail = 'Missed';
  else if (isDeclined) detail = 'Declined';
  else if (item.callInfo?.durationSeconds) {
    const mins = Math.floor(item.callInfo.durationSeconds / 60);
    const secs = item.callInfo.durationSeconds % 60;
    detail = `${mins}:${String(secs).padStart(2, '0')}`;
  }

  return (
    <View style={{ alignSelf: 'center', marginVertical: 10, width: '100%', maxWidth: 360 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: isMissed ? 'rgba(255,107,107,0.3)' : colors.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isMissed ? colors.danger : colors.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isVideo ? 'videocam' : 'call'} size={18} color={isMissed ? colors.danger : colors.white} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: colors.white, fontSize: 13, fontWeight: '800' }}>{label}</Text>
          <Text style={{ color: isMissed ? colors.danger : colors.muted, fontSize: 11, marginTop: 2 }}>{detail}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 10, marginLeft: 8 }}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
const EMOJI_PANEL = ['😀', '😂', '😍', '😎', '🤔', '😢', '😡', '👍', '👎', '🙏', '👏', '🔥', '✨', '🎉', '🚀', '❤️', '💔', '💯', '👀', '🥳', '😴', '🤗', '😅', '🙌'];

function isVideoMessage(item: Message) {
  return item.kind === 'video' || Boolean(
    item.mediaUrl?.startsWith('data:video/') ||
    item.mimeType?.startsWith('video/') ||
    item.fileName?.match(/\.(mp4|mov|webm|m4v|mkv|avi)$/i)
  );
}

function expiryLabel(expiresAt: string) {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  if (remaining < 60 * 1000) return `${Math.ceil(remaining / 1000)}s`;
  if (remaining < 60 * 60 * 1000) return `${Math.ceil(remaining / 60000)}m`;
  if (remaining < 24 * 60 * 60 * 1000) return `${Math.ceil(remaining / 3600000)}h`;
  return `${Math.ceil(remaining / 86400000)}d`;
}

export default function ConversationScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const chatId = Array.isArray(id) ? id[0] : id;
  const { profile, loading, chats, activityByChat, sendMessage, sendMediaMessage, sendChatActivity, logChatSystemMessage, markRead, refreshChats, e2eeEnabled, e2eePro, signalingEnabled, signalingReady, activeCall, startAudioCall, startVideoCall, acceptIncomingCall, rejectIncomingCall, endActiveCall, pinChat, muteChat, clearChat, blockContact, deleteMessage, postMessageReaction, messageReactions, privacySettings, appearanceSettings } = useApp();
  const chat = chats.find((item) => item.id === chatId);
  const e2eeActive = e2eeEnabled || Boolean(e2eePro);
  const showDeviceStatus = Boolean(chat?.peerDevice && privacySettings.showDeviceStatus);

  const [text, setText] = useState('');
  const [reply, setReply] = useState<Message | null>(null);
  const [resolvingMissing, setResolvingMissing] = useState(false);
  const [autoResolveAttempted, setAutoResolveAttempted] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [attachmentPanelOpen, setAttachmentPanelOpen] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [webRecording, setWebRecording] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [activeVoiceProgress, setActiveVoiceProgress] = useState<{ position: number; duration: number }>({ position: 0, duration: 1 });
  const [profileViewer, setProfileViewer] = useState<{ name: string; macroId: string; avatarUrl?: string; avatarColor: string } | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; kind: 'image' | 'video'; fileName?: string; ratio?: number } | null>(null);
  const [videoRatios, setVideoRatios] = useState<Record<string, number>>({});
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const [replyJumpTargetId, setReplyJumpTargetId] = useState<string | null>(null);

  const list = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const swipeableRefs = useRef<Record<string, any>>({});
  const pendingSendScroll = useRef(false);
  const voiceSound = useRef<Audio.Sound | null>(null);
  const webRecorder = useRef<MediaRecorder | null>(null);
  const webRecorderChunks = useRef<Blob[]>([]);
  const webAudio = useRef<HTMLAudioElement | null>(null);

  const messages = useMemo(() => {
    if (!chat) return [];
    return [...chat.messages].reverse();
  }, [chat]);
  const remoteActivity = chat ? activityByChat[chat.id] : undefined;
  const [manualActivityState, setManualActivityState] = useState<'recording' | 'screenshot' | null>(null);
  const textSizeMap = { compact: 14, comfortable: 15, large: 16, xl: 17 } as const;
  const wallpaperMap = {
    midnight: { page: '#030B14', panel: '#0A192E', bubble: 'rgba(11, 23, 37, 0.90)', bubbleMine: 'rgba(22, 75, 109, 0.85)' },
    obsidian: { page: '#05070B', panel: '#0E131A', bubble: 'rgba(18, 24, 33, 0.92)', bubbleMine: 'rgba(18, 52, 76, 0.9)' },
    aurora: { page: '#040E16', panel: '#0B1B26', bubble: 'rgba(11, 31, 38, 0.9)', bubbleMine: 'rgba(10, 79, 84, 0.75)' },
    graphite: { page: '#0A0D12', panel: '#151A20', bubble: 'rgba(23, 28, 35, 0.92)', bubbleMine: 'rgba(32, 53, 72, 0.82)' },
  } as const;
  const wall = wallpaperMap[appearanceSettings.wallpaper];
  const messageFontSize = textSizeMap[appearanceSettings.textSize];
  const fontFamilyMap = {
    system: undefined,
    figtree: 'Figtree' as any,
    'space-grotesk': 'Space Grotesk' as any,
    'instrument-serif': 'Instrument Serif' as any,
    oswald: 'Oswald' as any,
    'dancing-script': 'Dancing Script' as any,
  } as const;
  const messageFontFamily = fontFamilyMap[appearanceSettings.fontFamily];

  console.log('💬 Chat screen rendered with appearance:', { textSize: appearanceSettings.textSize, wallpaper: appearanceSettings.wallpaper, fontSize: messageFontSize, pageColor: wall.page, fontFamily: appearanceSettings.fontFamily });

  const remoteActivityLabel = remoteActivity
    ? remoteActivity.state === 'recording'
      ? 'recording voice note...'
      : remoteActivity.state === 'screenshot'
        ? 'taking a screenshot...'
        : 'typing...'
    : null;

  useEffect(() => {
    if (!replyJumpTargetId) return;
    const timeout = setTimeout(() => setReplyJumpTargetId(null), 900);
    return () => clearTimeout(timeout);
  }, [replyJumpTargetId]);

  useEffect(() => {
    if (chatId) markRead(chatId);
  }, [chatId, markRead]);

  useEffect(() => {
    setAutoResolveAttempted(false);
  }, [chatId, profile?.id]);

  useEffect(() => {
    if (!chatId || loading || !profile || chat || resolvingMissing || autoResolveAttempted) return;
    let active = true;
    setAutoResolveAttempted(true);
    setResolvingMissing(true);
    Promise.race([
      refreshChats(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
      .catch((error) => console.warn('Failed to resolve missing conversation', error))
      .finally(() => {
        if (active) setResolvingMissing(false);
      });

    return () => {
      active = false;
    };
  }, [chatId, loading, profile, chat, resolvingMissing, autoResolveAttempted, refreshChats]);

  useEffect(() => {
    return () => {
      const sound = voiceSound.current;
      if (!sound) return;
      sound.stopAsync().catch(() => undefined);
      sound.unloadAsync().catch(() => undefined);
      if (webAudio.current) {
        webAudio.current.pause();
        webAudio.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chat) return;

    if (recording || webRecording) {
      sendChatActivity(chat.id, 'recording');
      return () => {
        sendChatActivity(chat.id, null);
      };
    }

    if (manualActivityState) {
      sendChatActivity(chat.id, manualActivityState);
      return () => {
        sendChatActivity(chat.id, null);
      };
    }

    if (!text.trim()) {
      sendChatActivity(chat.id, null);
      return;
    }

    sendChatActivity(chat.id, 'typing');
    const timeoutHandle = setTimeout(() => {
      sendChatActivity(chat.id, null);
    }, 1600);

    return () => {
      clearTimeout(timeoutHandle);
    };
  }, [chat, manualActivityState, recording, webRecording, text, sendChatActivity]);

  if (Platform.OS === 'web' && width >= 820) {
    return <WebMessenger initialChatId={chatId} />;
  }
  if (!chat && (loading || resolvingMissing)) {
    return <View style={styles.page}><Text style={styles.missing}>Loading conversation...</Text></View>;
  }

  if (!chat && !profile) {
    return (
      <View style={styles.page}>
        <Text style={styles.missing}>Sign in required to open this conversation.</Text>
        <Pressable onPress={() => router.replace('/')} style={styles.retry}>
          <Text style={styles.retryText}>Go to Home</Text>
        </Pressable>
      </View>
    );
  }

  if (!chat) {
    return (
      <View style={styles.page}>
        <Text style={styles.missing}>Conversation not found.</Text>
        <Pressable onPress={() => {
          setAutoResolveAttempted(false);
          refreshChats().catch((error) => console.warn('Retry failed', error));
        }} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const stopActiveVoice = async () => {
    if (!voiceSound.current) return;
    try {
      await voiceSound.current.stopAsync();
      await voiceSound.current.unloadAsync();
    } catch {
      // Ignore stop/unload errors.
    }
    voiceSound.current = null;
    setActiveVoiceId(null);
    setActiveVoiceProgress({ position: 0, duration: 1 });
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const sendAttachment = async (input: {
    kind: 'image' | 'video' | 'file' | 'voice';
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
  }) => {
    pendingSendScroll.current = true;
    const replyId = reply?.id;
    await sendMediaMessage(chat.id, {
      ...input,
      replyTo: replyId,
    });
    if (replyId) {
      swipeableRefs.current[replyId]?.close?.();
    }
    setReply(null);
    requestAnimationFrame(() => {
      list.current?.scrollToOffset({ offset: 0, animated: false });
    });
  };

  const attachFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow media library access to attach photos and videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: 300,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const isVideoAsset = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
    await sendAttachment({
      kind: isVideoAsset ? 'video' : 'image',
      uri: asset.uri,
      fileName: asset.fileName || (isVideoAsset ? 'video.mp4' : 'photo.jpg'),
      mimeType: asset.mimeType || (isVideoAsset ? 'video/mp4' : 'image/jpeg'),
    });
  };

  const attachFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to capture photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await sendAttachment({
      kind: 'image',
      uri: asset.uri,
      fileName: asset.fileName || 'camera-photo.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
    });
  };

  const attachDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'application/octet-stream';
    const name = asset.name || 'Attachment';
    const kind = mimeType.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(name)
      ? 'video'
      : mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
        ? 'image'
        : 'file';
    await sendAttachment({ kind, uri: asset.uri, fileName: name, mimeType });
  };

  const openAttachmentMenu = () => {
    setAttachmentPanelOpen((current) => !current);
  };

  const stopVoiceNote = async () => {
    if (Platform.OS === 'web') {
      if (!webRecorder.current) return;
      setWebRecording(false);
      webRecorder.current.stop();
      return;
    }

    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = recording.getURI();
      const duration = recordingSince ? Date.now() - recordingSince : 0;
      if (!uri) {
        Alert.alert('Voice note failed', 'No recorded audio file was found.');
      } else {
        await sendAttachment({
          kind: 'voice',
          uri,
          fileName: `voice-${Date.now()}.m4a`,
          mimeType: 'audio/m4a',
          durationMs: duration,
        });
      }
    } catch {
      Alert.alert('Voice note failed', 'Unable to stop recording. Please try again.');
    } finally {
      setRecording(null);
      setRecordingSince(null);
    }
  };

  const toggleVoicePlayback = async (messageId: string, payload: { uri: string; durationMs: number }) => {
    if (Platform.OS === 'web') {
      if (activeVoiceId === messageId && webAudio.current) {
        webAudio.current.pause();
        webAudio.current = null;
        setActiveVoiceId(null);
        setActiveVoiceProgress({ position: 0, duration: 1 });
        return;
      }

      if (webAudio.current) {
        webAudio.current.pause();
        webAudio.current = null;
      }

      const audio = new globalThis.Audio(payload.uri);
      audio.ontimeupdate = () => {
        setActiveVoiceProgress({ position: audio.currentTime * 1000, duration: (audio.duration || payload.durationMs / 1000 || 1) * 1000 });
      };
      audio.onended = () => {
        setActiveVoiceId(null);
        setActiveVoiceProgress({ position: 0, duration: 1 });
        webAudio.current = null;
      };
      await audio.play();
      webAudio.current = audio;
      setActiveVoiceId(messageId);
      return;
    }

    if (activeVoiceId === messageId && voiceSound.current) {
      await stopActiveVoice();
      return;
    }

    await stopActiveVoice();

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: payload.uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setActiveVoiceProgress({ position: status.positionMillis ?? 0, duration: status.durationMillis ?? payload.durationMs ?? 1 });
          if (status.didJustFinish) {
            stopActiveVoice().catch(() => undefined);
          }
        },
      );
      voiceSound.current = sound;
      setActiveVoiceId(messageId);
    } catch {
      Alert.alert('Voice note failed', 'Unable to play this voice note.');
    }
  };

  const startVoiceNote = async () => {
    if (Platform.OS === 'web') {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        Alert.alert('Voice note unavailable', 'This browser does not support microphone recording here.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        webRecorderChunks.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) webRecorderChunks.current.push(event.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(webRecorderChunks.current, { type: recorder.mimeType || 'audio/webm' });
          const duration = recordingSince ? Date.now() - recordingSince : 0;
          stream.getTracks().forEach((track) => track.stop());
          
          // Convert blob to data URL immediately to avoid ephemeral blob URL issues
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            sendAttachment({
              kind: 'voice',
              uri: dataUrl,
              fileName: `voice-${Date.now()}.webm`,
              mimeType: blob.type || 'audio/webm',
              durationMs: duration,
            }).catch(() => Alert.alert('Voice note failed', 'Unable to send recorded voice note.'));
            webRecorder.current = null;
            setWebRecording(false);
            setRecordingSince(null);
          };
          reader.onerror = () => {
            Alert.alert('Voice note failed', 'Could not process voice recording.');
            webRecorder.current = null;
            setWebRecording(false);
            setRecordingSince(null);
          };
          reader.readAsDataURL(blob);
        };
        recorder.start();
        webRecorder.current = recorder;
        setWebRecording(true);
        setRecordingSince(Date.now());
      } catch {
        Alert.alert('Permission needed', 'Allow microphone access to record voice notes in web.');
      }
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow microphone access to record voice notes.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const next = new Audio.Recording();
      await next.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await next.startAsync();
      setRecording(next);
      setRecordingSince(Date.now());
    } catch {
      Alert.alert('Voice note failed', 'Unable to start recording. Please try again.');
    }
  };

  const send = () => {
    const payload = text.trim();
    if (!payload) return;
    const replyId = reply?.id;
    pendingSendScroll.current = true;
    sendMessage(chat.id, payload, replyId);
    setText('');
    if (replyId) {
      swipeableRefs.current[replyId]?.close?.();
    }
    setReply(null);
    sendChatActivity(chat.id, null);

    requestAnimationFrame(() => {
      list.current?.scrollToOffset({ offset: 0, animated: false });
    });
    setAttachmentPanelOpen(false);

    if (Platform.OS !== 'web') {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const onPrimaryAction = () => {
    if (text.trim()) {
      send();
      return;
    }

    if (recording || webRecording) {
      stopVoiceNote().catch(() => Alert.alert('Voice note failed', 'Unable to stop recording.'));
      return;
    }

    startVoiceNote().catch(() => Alert.alert('Voice note failed', 'Unable to start recording.'));
  };

  const copyPlainText = (value: string) => {
    if (Platform.OS === 'web') {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).catch(() => undefined);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return;
    }
    require('react-native').Share.share({ message: value });
  };

  const jumpToMessage = (messageId?: string | null) => {
    if (!messageId) return;
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    setReplyJumpTargetId(messageId);
    requestAnimationFrame(() => {
      list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    });
  };

  const sendSticker = (sticker: Sticker) => {
    setEmojiOpen(false);
    sendMediaMessage(chat.id, {
      kind: 'image',
      uri: sticker.source.uri,
      fileName: `sticker-${sticker.label}.png`,
      mimeType: 'image/png',
    }).catch(() => Alert.alert('Sticker failed', 'Could not send that sticker.'));
  };

  const downloadPreview = async () => {
    if (!preview) return;
    const fileName = preview.fileName || `${preview.kind}-${Date.now()}.${preview.kind === 'video' ? 'mp4' : 'png'}`;
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(preview.uri);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(objectUrl);
        return;
      }
      const result = await FileSystem.downloadAsync(preview.uri, `${FileSystem.Paths.document.uri}${fileName}`);
      if (result.status >= 200 && result.status < 300) Alert.alert('Download complete', 'Media saved to your device.');
      else Alert.alert('Download failed', 'Unable to save this media.');
    } catch {
      Alert.alert('Download failed', 'Unable to save this media.');
    }
  };

  const startCall = async (video: boolean) => {
    if (!signalingEnabled) return Alert.alert('Call setup needed', 'Set EXPO_PUBLIC_SIGNALING_URL to use in-app calling.');
    if (!signalingReady) return Alert.alert('Connecting', 'Call signaling is not ready yet. Try again in a moment.');
    try {
      if (video) await startVideoCall(chat.id);
      else await startAudioCall(chat.id);
    } catch (error) {
      Alert.alert('Call failed', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: wall.page }]} edges={['top']}>
      <AmbientQuantumField />
    <KeyboardAvoidingView style={[styles.pageInner, { backgroundColor: wall.page }]} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <Pressable style={styles.back} hitSlop={10} accessibilityLabel="Go back" onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.white} /></Pressable>
        <Pressable onPress={() => setProfileViewer({ name: chat.name, macroId: chat.macroId, avatarUrl: chat.avatarUrl, avatarColor: chat.avatarColor })}>
          <Avatar name={chat.name} color={chat.avatarColor} size={38} online={chat.online} imageUrl={chat.avatarUrl} />
        </Pressable>
        <View style={styles.person}><Text style={styles.name} numberOfLines={1}>{chat.name}</Text><Text style={[styles.presence, chat.online && { color: colors.neon }, remoteActivity && styles.presenceActive]} numberOfLines={1}>{remoteActivityLabel ?? chat.lastSeen}</Text></View>
        <Pressable style={styles.action} hitSlop={6} onPress={() => {
          setManualActivityState((current) => {
            const next = current === 'screenshot' ? null : 'screenshot';
            if (next === 'screenshot') logChatSystemMessage(chat.id, 'Screenshot taken');
            return next;
          });
        }} accessibilityLabel="Share screenshot activity"><Ionicons name="camera-outline" size={20} color={manualActivityState === 'screenshot' ? colors.neon : colors.white} /></Pressable>
        <Pressable style={styles.action} hitSlop={6} onPress={() => startCall(true)}><Ionicons name="videocam-outline" size={21} color={colors.blue} /></Pressable>
        <Pressable style={styles.action} hitSlop={6} onPress={() => startCall(false)}><Ionicons name="call-outline" size={20} color={colors.blue} /></Pressable>
        <Pressable style={styles.action} hitSlop={6} accessibilityLabel="Chat options" onPress={() => setHeaderMenuOpen(true)}><Ionicons name="ellipsis-vertical" size={20} color={colors.white} /></Pressable>
      </View>
      {showDeviceStatus && chat?.peerDevice && (
        <View style={styles.encryption}>
          <Ionicons name={deviceIcon(chat.peerDevice)} size={11} color={colors.neon} />
          <Text style={styles.encryptionText}>Online from {deviceLabel(chat.peerDevice)}</Text>
        </View>
      )}
      {activeCall?.conversationId === chat.id && (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerText}>{activeCall.incoming ? 'Incoming call' : 'Call in progress'} · {activeCall.video ? 'Video' : 'Audio'} · {activeCall.status}</Text>
          <View style={styles.callBannerActions}>
            {activeCall.incoming && activeCall.status === 'ringing' ? (
              <>
                <Pressable style={styles.callAccept} onPress={acceptIncomingCall}><Text style={styles.callActionText}>Accept</Text></Pressable>
                <Pressable style={styles.callReject} onPress={rejectIncomingCall}><Text style={styles.callActionText}>Reject</Text></Pressable>
              </>
            ) : (
              <Pressable style={styles.callReject} onPress={endActiveCall}><Text style={styles.callActionText}>End</Text></Pressable>
            )}
          </View>
        </View>
      )}
      <FlatList
        ref={list}
        data={messages}
        inverted
        style={styles.messagesList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!pendingSendScroll.current) return;
          list.current?.scrollToOffset({ offset: 0, animated: false });
          pendingSendScroll.current = false;
        }}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={({ index }) => {
          list.current?.scrollToOffset({ offset: index * 90, animated: true });
        }}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        renderItem={({ item }) => {
          if (item.kind === 'call') {
            return <CallMessageBubble item={item} />;
          }

          if (item.kind === 'system') {
            return (
              <View style={styles.systemRow}>
                <View style={styles.systemBubble}>
                  <Text style={styles.systemText}>{item.text}</Text>
                </View>
                <Text style={styles.systemTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
            );
          }

          const mine = item.senderId === 'me';
          const replied = item.replyTo ? chat.messages.find((message) => message.id === item.replyTo) : null;
          const isVideo = isVideoMessage(item);
          const isImage = !isVideo && (item.kind === 'image' || Boolean(
            item.mediaUrl?.startsWith('data:image/') ||
            item.mimeType?.startsWith('image/') ||
            item.fileName?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)
          ));
          const voicePayload = item.kind === 'voice' && item.mediaUrl ? { uri: item.mediaUrl, durationMs: item.durationMs || 0 } : null;
          const imagePayload = isImage && item.mediaUrl ? { uri: item.mediaUrl, name: item.fileName || 'Image' } : null;
          const videoPayload = isVideo && item.mediaUrl ? { uri: item.mediaUrl, name: item.fileName || 'Video' } : null;
          const filePayload = !isImage && !isVideo && item.kind === 'file' ? { name: item.fileName || item.text } : null;
          const isPlaying = activeVoiceId === item.id;
          const playbackDuration = voicePayload ? Math.max(activeVoiceProgress.duration || voicePayload.durationMs || 1, 1) : 1;
          const playbackPosition = voicePayload && isPlaying ? activeVoiceProgress.position : 0;
          const playbackPct = voicePayload ? Math.max(0, Math.min(playbackPosition / playbackDuration, 1)) : 0;
          const voiceLabel = voicePayload ? formatDuration(voicePayload.durationMs) : '';

          return (
            <Swipeable
              ref={(ref) => {
                if (ref) {
                  swipeableRefs.current[item.id] = ref;
                } else {
                  delete swipeableRefs.current[item.id];
                }
              }}
              enabled
              renderLeftActions={() => <View style={styles.replySwipeAction} />}
              renderRightActions={() => <View style={styles.replySwipeAction} />}
              onSwipeableOpen={(direction) => {
                if (direction === 'left' || direction === 'right') {
                  setReply(item);
                }
              }}
            >
              <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
              <View style={[
                styles.bubble,
                mine ? { ...styles.mine, backgroundColor: wall.bubbleMine } : { ...styles.theirs, backgroundColor: wall.bubble },
                item.id === replyJumpTargetId && styles.replyJumpFlash,
              ]}>
                {item.expiresAt && <MessageTimerBorder expiresAt={item.expiresAt} createdAt={item.createdAt} radius={17} />}
                {replied && (
                  <Pressable style={styles.reply} onPress={() => jumpToMessage(replied.id)}>
                    <Text numberOfLines={1} style={styles.replyText}>{replied.text || replied.fileName || (replied.kind === 'voice' ? 'Voice note' : replied.kind === 'image' ? 'Photo' : 'Message')}</Text>
                  </Pressable>
                )}
                {voicePayload ? (
                  <View style={styles.voiceNoteWrap}>
                    <Pressable style={styles.voicePlayBtn} onPress={() => toggleVoicePlayback(item.id, voicePayload).catch(() => undefined)}>
                      <Ionicons name={isPlaying ? 'pause' : 'play'} color={colors.navy950} size={16} />
                    </Pressable>
                    <View style={styles.voiceTrack}>
                      <View style={[styles.voiceTrackFill, { width: `${playbackPct * 100}%` }]} />
                    </View>
                    <Text style={styles.voiceLabel}>{isPlaying ? formatDuration(playbackPosition) : voiceLabel}</Text>
                  </View>
                ) : imagePayload ? (
                  <Pressable style={styles.mediaFrame} onPress={() => setPreview({ uri: imagePayload.uri, kind: 'image', fileName: imagePayload.name })}>
                    <Image source={{ uri: imagePayload.uri }} style={styles.imageBubble} resizeMode="cover" />
                  </Pressable>
                ) : videoPayload ? (
                  <Pressable style={styles.mediaFrame} onPress={() => setPreview({ uri: videoPayload.uri, kind: 'video', fileName: videoPayload.name, ratio: videoRatios[item.id] })}>
                    <View style={[styles.videoThumb, { aspectRatio: clampVideoRatio(videoRatios[item.id]) }]}>
                      <VideoThumbnail
                        uri={videoPayload.uri}
                        onMeta={(meta) => {
                          if (meta.ratio) setVideoRatios((current) => (current[item.id] ? current : { ...current, [item.id]: meta.ratio! }));
                          if (meta.durationMs) setVideoDurations((current) => (current[item.id] ? current : { ...current, [item.id]: meta.durationMs! }));
                        }}
                      />
                      <View style={styles.videoScrim} />
                      <View style={styles.videoPlayBadge}><Ionicons name="play" size={24} color={colors.navy950} /></View>
                      <View style={styles.videoDurationPill}>
                        <Ionicons name="videocam" size={11} color={colors.white} />
                        <Text style={styles.videoDurationText}>{videoDurations[item.id] ? formatDuration(videoDurations[item.id]) : '0:00'}</Text>
                      </View>
                    </View>
                  </Pressable>
                ) : filePayload ? (
                  <View style={styles.attachWrap}>
                    <Ionicons name="document-outline" color={colors.blue} size={18} />
                    <Text style={styles.attachText} numberOfLines={1}>{filePayload.name}</Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.messageText,
                      { fontSize: messageFontSize, lineHeight: messageFontSize + 6 },
                      messageFontFamily ? { fontFamily: messageFontFamily } : null,
                      item.textColor ? { color: item.textColor } : null,
                      item.fontStyle ? { fontStyle: item.fontStyle } : null,
                      item.fontFamily ? { fontFamily: item.fontFamily as any } : null,
                    ]}
                  >
                    {item.text}
                  </Text>
                )}
                <View style={styles.meta}>
                  <Pressable style={styles.msgMenuBtn} hitSlop={10} accessibilityLabel="Message options" onPress={() => setMenuMessage(item)}>
                    <Ionicons name="chevron-down" size={15} color={colors.muted} />
                  </Pressable>
                  {item.expiresAt && <Text style={styles.expiry}>{expiryLabel(item.expiresAt)}</Text>}
                  <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                  {mine && <MessageTicks status={item.status} />}
                </View>
                {(messageReactions[item.id]?.length ?? 0) > 0 && (
                  <View style={styles.reactionRow}>
                    {messageReactions[item.id].map((entry) => (
                      <View key={entry.id} style={styles.reactionPill}><Text style={styles.reactionPillText}>{entry.emoji}</Text></View>
                    ))}
                  </View>
                )}
                {item.reaction && <View style={styles.reaction}><Text>{item.reaction}</Text></View>}
              </View>
              </View>
            </Swipeable>
          );
        }}
      />
      {attachmentPanelOpen && (
        <View style={styles.attachmentPanel}>
          <Pressable style={styles.attachmentAction} onPress={() => { setAttachmentPanelOpen(false); attachFromCamera().catch(() => Alert.alert('Unable to open camera', 'Please try again.')); }}>
            <Ionicons name="camera" size={18} color={colors.white} />
            <Text style={styles.attachmentActionText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.attachmentAction} onPress={() => { setAttachmentPanelOpen(false); attachFromLibrary().catch(() => Alert.alert('Unable to attach media', 'Please try again.')); }}>
            <Ionicons name="image" size={18} color={colors.white} />
            <Text style={styles.attachmentActionText}>Photo</Text>
          </Pressable>
          <Pressable style={styles.attachmentAction} onPress={() => { setAttachmentPanelOpen(false); attachDocument().catch(() => Alert.alert('Unable to attach file', 'Please try again.')); }}>
            <Ionicons name="document" size={18} color={colors.white} />
            <Text style={styles.attachmentActionText}>File</Text>
          </Pressable>
        </View>
      )}
      {reply && <View style={styles.replying}><View style={{ flex: 1 }}><Text style={styles.replyTitle}>Replying</Text><Text numberOfLines={1} style={styles.replyPreview}>{reply.text}</Text></View><Pressable onPress={() => setReply(null)}><Ionicons name="close" color={colors.muted} size={22} /></Pressable></View>}
      {(recording || webRecording) && (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording voice note...</Text>
          <Pressable onPress={() => stopVoiceNote().catch(() => Alert.alert('Voice note failed', 'Unable to stop recording.'))}>
            <Text style={styles.recordingStop}>Stop</Text>
          </Pressable>
        </View>
      )}
      {profileViewer && (
        <Pressable style={styles.profileModalBackdrop} onPress={() => setProfileViewer(null)}>
          <Pressable style={styles.profileModalCard} onPress={() => undefined}>
            <Pressable style={styles.profileModalClose} onPress={() => setProfileViewer(null)}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
            <Avatar name={profileViewer.name} color={profileViewer.avatarColor} size={120} imageUrl={profileViewer.avatarUrl} />
            <Text style={styles.profileModalName}>{profileViewer.name}</Text>
            <Text style={styles.profileModalMacro}>{profileViewer.macroId}</Text>
            <Text style={styles.profileModalMeta}>Contact profile</Text>
          </Pressable>
        </Pressable>
      )}
      {headerMenuOpen && (
        <Pressable style={styles.menuBackdrop} onPress={() => setHeaderMenuOpen(false)}>
          <Pressable style={styles.headerMenuCard} onPress={() => undefined}>
            <Pressable style={styles.menuItem} onPress={() => { pinChat(chat.id); setHeaderMenuOpen(false); }}>
              <Ionicons name={chat.pinned ? 'pin' : 'pin-outline'} size={18} color={colors.white} />
              <Text style={styles.menuItemText}>{chat.pinned ? 'Unpin chat' : 'Pin chat'}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { muteChat(chat.id); setHeaderMenuOpen(false); }}>
              <Ionicons name={chat.muted ? 'volume-high-outline' : 'volume-mute-outline'} size={18} color={colors.white} />
              <Text style={styles.menuItemText}>{chat.muted ? 'Unmute' : 'Mute notifications'}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setProfileViewer({ name: chat.name, macroId: chat.macroId, avatarUrl: chat.avatarUrl, avatarColor: chat.avatarColor }); setHeaderMenuOpen(false); }}>
              <Ionicons name="person-circle-outline" size={18} color={colors.white} />
              <Text style={styles.menuItemText}>View contact</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { clearChat(chat.id); setHeaderMenuOpen(false); }}>
              <Ionicons name="trash-outline" size={18} color={colors.white} />
              <Text style={styles.menuItemText}>Clear chat</Text>
            </Pressable>
            {chat.participantUserId && (
              <Pressable style={styles.menuItem} onPress={() => { void blockContact(chat.participantUserId!); setHeaderMenuOpen(false); }}>
                <Ionicons name="ban-outline" size={18} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Block contact</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      )}

      {menuMessage && (
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuMessage(null)}>
          <Pressable style={styles.sheetCard} onPress={() => undefined}>
            <View style={styles.sheetEmojiRow}>
              {QUICK_EMOJI.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.sheetEmojiBtn}
                  onPress={() => {
                    const target = menuMessage;
                    setMenuMessage(null);
                    if (target) postMessageReaction(target.id, emoji).catch(() => Alert.alert('Reaction failed', 'Could not add the reaction.'));
                  }}
                >
                  <Text style={styles.sheetEmojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.menuItem} onPress={() => { setReply(menuMessage); setMenuMessage(null); }}>
              <Ionicons name="return-down-forward-outline" size={18} color={colors.white} />
              <Text style={styles.menuItemText}>Reply</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const value = menuMessage?.text ?? '';
                setMenuMessage(null);
                if (value) copyPlainText(value);
              }}
            >
              <Ionicons name="copy-outline" size={18} color={colors.white} />
              <Text style={styles.menuItemText}>Copy text</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const target = menuMessage;
                setMenuMessage(null);
                if (target) deleteMessage(chat.id, target.id);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {preview && (
        <View style={styles.previewBackdrop}>
          <Pressable style={styles.previewClose} onPress={() => setPreview(null)}>
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <View style={styles.previewBody}>
            {preview.kind === 'video' ? (
              <Video source={{ uri: preview.uri }} style={[styles.previewMedia, { aspectRatio: preview.ratio || 16 / 9 }]} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />
            ) : (
              <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
            )}
          </View>
          <Pressable style={styles.previewDownload} onPress={downloadPreview}>
            <Ionicons name="download-outline" size={18} color={colors.white} />
            <Text style={styles.previewDownloadText}>Download</Text>
          </Pressable>
        </View>
      )}

      {emojiOpen && (
        <View style={styles.emojiPanel}>
          <ScrollView contentContainerStyle={styles.emojiPanelScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.emojiPanelTitle}>Emoji</Text>
            <View style={styles.emojiPanelInner}>
              {EMOJI_PANEL.map((emoji) => (
                <Pressable key={emoji} style={styles.emojiPanelBtn} onPress={() => setText((prev) => prev + emoji)}>
                  <Text style={styles.emojiPanelText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.emojiPanelTitle}>Stickers</Text>
            <View style={styles.emojiPanelInner}>
              {STICKER_LIST.map((sticker) => (
                <Pressable key={sticker.id} style={styles.stickerBtn} onPress={() => sendSticker(sticker)}>
                  <Image source={sticker.source} style={styles.stickerImage} resizeMode="contain" />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: wall.panel }]}>
        <Pressable style={styles.composeButton} onPress={openAttachmentMenu}><Ionicons name="add" size={24} color={colors.blue} /></Pressable>
        <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocus]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            style={[styles.input, Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null]}
            multiline
            maxLength={4000}
            onKeyPress={Platform.OS === 'web' ? (event: any) => {
              if (event?.nativeEvent?.key === 'Enter' && !event?.nativeEvent?.shiftKey) {
                event.preventDefault?.();
                send();
              }
            } : undefined}
          />
          <Pressable style={styles.emojiToggle} hitSlop={8} accessibilityLabel="Emoji" onPress={() => setEmojiOpen((open) => !open)}><Ionicons name="happy-outline" size={22} color={emojiOpen ? colors.neon : colors.muted} /></Pressable>
        </View>
        <Pressable style={[styles.send, recording && styles.sendRecording]} onPress={onPrimaryAction}><Ionicons name={text.trim() ? 'send' : (recording ? 'stop' : 'mic')} size={21} color={colors.navy950} /></Pressable>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#030B14', overflow: 'hidden' },
  pageInner: { flex: 1, zIndex: 1 },
  missing: { color: colors.white, margin: 30, textAlign: 'center' },
  retry: { alignSelf: 'center', marginTop: 8, borderRadius: 12, backgroundColor: colors.blue, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: colors.navy950, fontWeight: '800', fontSize: 13 },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 9, backgroundColor: colors.navy900, borderBottomWidth: 1, borderBottomColor: colors.border }, back: { padding: 5 }, person: { flex: 1 }, name: { color: colors.white, fontSize: 16, fontWeight: '800' }, presence: { color: colors.muted, fontSize: 11, marginTop: 2 }, presenceActive: { color: colors.neon }, action: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  encryption: { alignSelf: 'center', flexDirection: 'row', gap: 5, marginTop: 10, backgroundColor: colors.navy800, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }, encryptionText: { color: colors.muted, fontSize: 10 },
  callBanner: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, padding: 10 },
  callBannerText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  callBannerActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  systemRow: { alignSelf: 'center', alignItems: 'center', marginVertical: 6 },
  systemBubble: { backgroundColor: 'rgba(12, 19, 30, 0.9)', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  systemText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  systemTime: { color: colors.muted, fontSize: 10, marginTop: 4 },
  callAccept: { minWidth: 88, height: 32, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  callReject: { minWidth: 88, height: 32, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  callActionText: { color: colors.black, fontWeight: '800', fontSize: 12 },
  messagesList: { flex: 1 },
  messages: { padding: 14, paddingTop: 20, gap: 8 }, 
  bubble: { maxWidth: '100%', flexShrink: 1, minWidth: 0, borderRadius: 17, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6, boxShadow: '0 4px 8px rgba(0,0,0,0.15)', elevation: 5, borderWidth: 1 }, 
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '88%', minWidth: 0 },
  msgRowMine: { alignSelf: 'flex-end' },
  msgRowTheirs: { alignSelf: 'flex-start' },
  mine: { backgroundColor: 'rgba(22, 75, 109, 0.85)', borderColor: 'rgba(120, 204, 255, 0.25)', borderBottomRightRadius: 4 }, 
  theirs: { backgroundColor: 'rgba(11, 23, 37, 0.90)', borderColor: 'rgba(120, 204, 255, 0.15)', borderBottomLeftRadius: 4 }, messageText: { color: colors.white, fontSize: 15, lineHeight: 21, flexShrink: 1 }, meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: 2 }, time: { color: '#A9B9CB', fontSize: 11, fontWeight: '500' }, expiry: { color: colors.blue, fontSize: 11, fontWeight: '600' }, tick: { color: colors.muted, fontSize: 11, fontWeight: '800' }, reply: { borderLeftWidth: 3, borderLeftColor: colors.neon, paddingLeft: 8, paddingVertical: 5, marginBottom: 6, backgroundColor: colors.overlay, borderRadius: 5 }, replyText: { color: colors.muted, fontSize: 12 }, reaction: { position: 'absolute', bottom: -14, right: 8, backgroundColor: colors.navy700, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  replySwipeAction: { width: 26, backgroundColor: 'transparent' },
  encryptedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  encryptedText: { color: colors.neon, fontSize: 10, fontWeight: '800' },
  attachmentPanel: { marginHorizontal: 12, marginBottom: 8, borderRadius: 14, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, padding: 10, flexDirection: 'row', gap: 10 },
  attachmentAction: { flex: 1, minHeight: 64, borderRadius: 12, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center', gap: 6 },
  attachmentActionText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  voiceNoteWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 190 },
  voicePlayBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  voiceTrack: { flex: 1, height: 6, borderRadius: 6, backgroundColor: colors.navy700, overflow: 'hidden' },
  voiceTrackFill: { height: '100%', backgroundColor: colors.neon },
  voiceLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  imageBubble: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.navy700 },
  mediaFrame: { width: 244, maxWidth: '100%', marginHorizontal: -5, marginTop: 1, marginBottom: 2 },
  videoThumb: { width: '100%', maxHeight: 340, borderRadius: 12, overflow: 'hidden', backgroundColor: '#050D16', alignItems: 'center', justifyContent: 'center' },
  videoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 11, 20, 0.18)' },
  videoPlayBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(109, 245, 194, 0.95)', alignItems: 'center', justifyContent: 'center' },
  videoDurationPill: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(3, 11, 20, 0.66)' },
  videoDurationText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  replyJumpFlash: { borderColor: colors.neon, borderWidth: 2 },
  msgMenuBtn: { marginRight: 'auto', paddingRight: 8, paddingVertical: 2 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.navy700, borderWidth: 1, borderColor: colors.border },
  reactionPillText: { fontSize: 12 },
  menuBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(2, 6, 16, 0.6)', zIndex: 60 },
  headerMenuCard: { position: 'absolute', top: 58, right: 10, minWidth: 210, borderRadius: 16, backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, paddingVertical: 8 },
  sheetBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(2, 6, 16, 0.6)', justifyContent: 'flex-end', zIndex: 60 },
  sheetCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, paddingTop: 10, paddingBottom: 24 },
  sheetEmojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sheetEmojiBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy800 },
  sheetEmojiText: { fontSize: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  menuItemText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  previewBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', zIndex: 80 },
  previewClose: { position: 'absolute', top: 24, right: 20, zIndex: 5, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  previewBody: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 76, paddingBottom: 104, paddingHorizontal: 10, overflow: 'hidden' },
  previewMedia: { width: '100%', maxWidth: '100%', maxHeight: '100%' },
  previewImage: { width: '100%', height: '100%' },
  previewDownload: { position: 'absolute', bottom: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: 'rgba(13, 22, 35, 0.9)', borderWidth: 1, borderColor: colors.border },
  previewDownloadText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  emojiPanel: { marginHorizontal: 12, marginBottom: 8, maxHeight: 240, borderRadius: 14, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border },
  emojiPanelScroll: { padding: 12, gap: 8 },
  emojiPanelTitle: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  emojiPanelInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiPanelBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  emojiPanelText: { fontSize: 21 },
  stickerBtn: { width: 58, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stickerImage: { width: 54, height: 54 },
  attachWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 230 },
  attachText: { color: colors.white, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  replying: { marginHorizontal: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.blue, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center' }, replyTitle: { color: colors.blue, fontWeight: '800', fontSize: 11 }, replyPreview: { color: colors.muted, fontSize: 12, marginTop: 2 },
  recordingBanner: { marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, paddingHorizontal: 12, height: 38, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  recordingText: { color: colors.white, flex: 1, fontWeight: '700', fontSize: 12 },
  recordingStop: { color: colors.danger, fontWeight: '900', fontSize: 12 },
  profileModalBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(2, 6, 16, 0.74)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  profileModalCard: { width: '86%', maxWidth: 360, backgroundColor: colors.navy900, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingTop: 22, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center', position: 'relative' },
  profileModalClose: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  profileModalName: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 18 },
  profileModalMacro: { color: colors.blue, fontSize: 13, fontWeight: '800', marginTop: 6 },
  profileModalMeta: { color: colors.muted, fontSize: 11, marginTop: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: colors.navy900,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  composeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    gap: 6,
  },
  inputWrapFocus: { borderColor: colors.neon },
  input: { flex: 1, color: colors.white, fontSize: 15, lineHeight: 20, paddingVertical: 11, minHeight: 42 },
  emojiToggle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRecording: { backgroundColor: colors.danger },
});
