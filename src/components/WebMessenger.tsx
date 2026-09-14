import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Avatar } from '@/components/Avatar';
import { AmbientQuantumField } from '@/components/AmbientQuantumField';
import { MessageTimerBorder } from '@/components/MessageTimerBorder';
import { VideoThumbnail, clampVideoRatio } from '@/components/VideoThumbnail';
import { useApp } from '@/context/AppContext';
import { STICKER_LIST } from '@/lib/stickers';
import { colors } from '@/theme/colors';
import type { Chat, Message } from '@/types';

function TypingIndicator() {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDot((prev) => (prev + 1) % 3);
    }, 220);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.typingRow}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: index === activeDot ? 1 : 0.35,
              transform: [{ scale: index === activeDot ? 1 : 0.75 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function formatClipDuration(ms?: number) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function chatTime(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function MessageTicks({ status }: { status: Message['status'] }) {
  if (status === 'sending') return <Text style={{ color: colors.muted, fontSize: 10 }}>◷</Text>;
  if (status === 'failed') return <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '900' }}>!</Text>;
  if (status === 'read') return <Ionicons name="checkmark-done" size={16} color={colors.blue} />;
  if (status === 'delivered') return <Ionicons name="checkmark-done" size={16} color={colors.neon} />;
  if (status === 'sent') return <Ionicons name="checkmark" size={15} color={colors.muted} />;
  return <Ionicons name="checkmark" size={15} color={colors.muted} />;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '✨', '🎉', '🚀', '👋', '🙏', '💯', '💩', '📌', '⚡', '🌟', '🍕', '☕', '🎈'];

function deviceIcon(device?: 'mobile' | 'desktop' | 'web'): keyof typeof Ionicons.glyphMap {
  if (device === 'mobile') return 'phone-portrait-outline';
  if (device === 'desktop') return 'laptop-outline';
  return 'globe-outline';
}

function deviceLabel(device?: 'mobile' | 'desktop' | 'web') {
  if (device === 'mobile') return 'mobile';
  if (device === 'desktop') return 'desktop';
  return 'web';
}
const FONT_FAMILIES = [
  { label: 'Default', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Times', value: '"Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
];
const TEXT_COLORS = [colors.white, '#FF6B9D', '#C44569', '#F8B195', '#F67035', '#55B9FF', '#2ECC71', '#F1C40F'];

function expiryLabel(expiresAt: string) {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  if (remaining < 60 * 1000) return `${Math.ceil(remaining / 1000)}s`;
  if (remaining < 60 * 60 * 1000) return `${Math.ceil(remaining / 60000)}m`;
  if (remaining < 24 * 60 * 60 * 1000) return `${Math.ceil(remaining / 3600000)}h`;
  return `${Math.ceil(remaining / 86400000)}d`;
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
    <View style={styles.callMsgContainer}>
      <View style={[styles.callMsgBox, isMissed && styles.callMsgMissed]}>
        <View style={[styles.callMsgIconCircle, isMissed && styles.callMsgIconMissed]}>
          <Ionicons name={isVideo ? 'videocam' : 'call'} size={18} color={isMissed ? colors.danger : colors.white} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.callMsgTitle}>{label}</Text>
          <Text style={[styles.callMsgSub, isMissed && styles.callMsgSubMissed]}>{detail}</Text>
        </View>
        <Text style={styles.callMsgTime}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

function VoiceNoteBubble({ item }: { item: Message }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [progressPct, setProgressPct] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const durationSecs = Math.max(1, Math.round((item.durationMs || 5000) / 1000));

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        const url = item.mediaUrl || 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        const audio = new globalThis.Audio(url);
        audio.playbackRate = playbackSpeed;
        audio.ontimeupdate = () => {
          if (audio.duration && audio.duration > 0) {
            setProgressPct(audio.currentTime / audio.duration);
          }
        };
        audio.onended = () => {
          setIsPlaying(false);
          setProgressPct(0);
          audioRef.current = null;
        };
        audioRef.current = audio;
      }
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().catch(() => undefined);
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSeek = (e: any) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPct = Math.max(0, Math.min(clickX / rect.width, 1));
    audioRef.current.currentTime = newPct * audioRef.current.duration;
    setProgressPct(newPct);
  };

  const currentSecs = Math.round(progressPct * durationSecs);
  const mins = Math.floor(currentSecs / 60);
  const secs = currentSecs % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={styles.vnContainer}>
      <Pressable style={styles.vnPlayBtn} onPress={togglePlay}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={colors.navy950} />
      </Pressable>
      <View style={styles.vnTrackArea}>
        <Pressable style={styles.vnTrackBar} onPress={handleSeek}>
          <View style={[styles.vnTrackFill, { width: `${progressPct * 100}%` }]} />
          <View style={[styles.vnKnob, { left: `${progressPct * 100}%` }]} />
        </Pressable>
        <Text style={styles.vnTimeText}>
          {isPlaying ? timeStr : `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')}`}
        </Text>
      </View>
      <Pressable style={styles.vnSpeedPill} onPress={cycleSpeed}>
        <Text style={styles.vnSpeedText}>{playbackSpeed}x</Text>
      </Pressable>
    </View>
  );
}

function Conversation({ chat }: { chat: Chat }) {
  const [windowWidth, setWindowWidth] = useState(() => Dimensions.get('window').width);
  const isMobile = windowWidth < 820;

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(Dimensions.get('window').width);
    };
    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => subscription?.remove();
  }, []);
  const {
    chats,
    activityByChat,
    sendMessage,
    sendMediaMessage,
    sendChatActivity,
    markRead,
    signalingEnabled,
    signalingReady,
    startAudioCall,
    startVideoCall,
    pinChat,
    muteChat,
    clearChat,
    blockContact,
    deleteMessage,
    toggleMessagePin,
    toggleMessageStar,
    postMessageReaction,
    setChatDisappearingTimer,
    messageReactions,
    appearanceSettings,
  } = useApp();

  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState<string>(colors.white);
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [fontFamily, setFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [replyJumpTargetId, setReplyJumpTargetId] = useState<string | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewMedia, setPreviewMedia] = useState<{ uri: string; kind: 'image' | 'video'; fileName?: string; aspectRatio?: number } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left?: number; right?: number; mine: boolean } | null>(null);
  const textSizeMap = { compact: 13, comfortable: 14, large: 16, xl: 18 } as const;
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
    figtree: 'Figtree',
    'space-grotesk': 'Space Grotesk',
    'instrument-serif': 'Instrument Serif',
    oswald: 'Oswald',
    'dancing-script': 'Dancing Script',
  } as const;
  const messageFontFamily = fontFamilyMap[appearanceSettings.fontFamily];
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [profileViewer, setProfileViewer] = useState<{ name: string; macroId: string; avatarUrl?: string; avatarColor: string } | null>(null);
  const [videoRatios, setVideoRatios] = useState<Record<string, number>>({});
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const modalMaxWidth = Math.min(screenWidth * 0.9, 1200);
  const modalMaxHeight = Math.min(screenHeight * 0.9, 800);

  const list = useRef<FlatList<Message>>(null);
  const conversationRef = useRef<any>(null);
  const messageSearchRef = useRef<any>(null);
  const messageSearchAnim = useRef(new Animated.Value(0)).current;
  const swipeableRefs = useRef<Record<string, any>>({});
  const recordingTimerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<any>(null);
  const messages = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  const pinnedMessage = chat.messages.find((message) => message.pinned);
  const pinnedHeader = pinnedMessage ? (
    <Pressable
      style={styles.pinnedBanner}
      onPress={() => jumpToMessage(pinnedMessage.id || pinnedMessage.clientId)}
    >
      <Ionicons name="pin" size={13} color={colors.white} />
      <Text style={styles.pinnedBannerText} numberOfLines={1}>{pinnedMessage.text || 'Pinned message'}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.white} />
    </Pressable>
  ) : null;
  const searchMatches = useMemo(() => {
    const search = messageSearchQuery.trim().toLowerCase();
    if (!search) return [] as number[];
    return messages
      .map((message, index) => {
        const haystack = [
          message.text,
          message.fileName,
          message.kind,
          message.senderId === 'me' ? 'you' : chat.name,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search) ? index : -1;
      })
      .filter((index) => index >= 0);
  }, [chat.name, messageSearchQuery, messages]);

  const filteredMessages = useMemo(() => {
    if (!showMessageSearch || !messageSearchQuery.trim()) return messages;
    return messages.filter((_, index) => searchMatches.includes(index));
  }, [messageSearchQuery, messages, searchMatches, showMessageSearch]);
  const activity = activityByChat[chat.id];
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [manualActivityState, setManualActivityState] = useState<'recording' | 'screenshot' | null>(null);
  const activityLabel = activity
    ? activity.state === 'typing'
      ? 'typing...'
      : activity.state === 'recording'
        ? 'recording voice note...'
        : activity.state === 'screenshot'
          ? 'taking a screenshot...'
          : null
    : null;

  useEffect(() => {
    if (showMessageSearch) {
      Animated.timing(messageSearchAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }).start();
      requestAnimationFrame(() => messageSearchRef.current?.focus?.());
    } else {
      Animated.timing(messageSearchAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: false,
      }).start();
    }
  }, [messageSearchAnim, showMessageSearch]);

  useEffect(() => {
    setSearchMatchIndex(0);
  }, [messageSearchQuery, chat.id]);

  const jumpToSearchMatch = (direction: 1 | -1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchMatchIndex + direction + searchMatches.length) % searchMatches.length;
    setSearchMatchIndex(nextIndex);
    const messageIndex = searchMatches[nextIndex];
    if (messageIndex !== undefined) {
      requestAnimationFrame(() => {
        list.current?.scrollToIndex({ index: messageIndex, animated: true });
      });
    }
  };

  const jumpToMessage = (messageIdOrClientId?: string | null) => {
    if (!messageIdOrClientId) return;
    const index = messages.findIndex((message) => message.id === messageIdOrClientId || message.clientId === messageIdOrClientId);
    if (index < 0) return;

    setReplyJumpTargetId(messageIdOrClientId);
    requestAnimationFrame(() => {
      list.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    });
  };

  useEffect(() => {
    if (!replyJumpTargetId) return;
    const timeout = setTimeout(() => setReplyJumpTargetId(null), 900);
    return () => clearTimeout(timeout);
  }, [replyJumpTargetId]);

  useEffect(() => {
    markRead(chat.id);
  }, [chat.id, chat.messages.length, markRead]);

  useEffect(() => {
    inputRef.current?.focus?.();
  }, [chat.id]);

  useEffect(() => {
    if (manualActivityState) {
      sendChatActivity(chat.id, manualActivityState);
      return () => sendChatActivity(chat.id, null);
    }

    if (!text.trim()) {
      sendChatActivity(chat.id, null);
      return;
    }
    sendChatActivity(chat.id, 'typing');
    const timeout = setTimeout(() => sendChatActivity(chat.id, null), 1500);
    return () => clearTimeout(timeout);
  }, [chat.id, manualActivityState, sendChatActivity, text]);

  const closeAllPanels = () => {
    setShowEmojiPicker(false);
    setShowFormatPanel(false);
    setShowAttachmentMenu(false);
    setShowTopMenu(false);
    setActiveMessageMenu(null);
    setMenuAnchor(null);
    setForwardMessage(null);
  };

  const handleStickerPress = async (sticker: { id: string; label: string; source: any }) => {
    setShowEmojiPicker(false);
    try {
      const resolvedSource = typeof (Image as any).resolveAssetSource === 'function'
        ? (Image as any).resolveAssetSource(sticker.source)
        : sticker.source;
      const uri = typeof resolvedSource === 'string' ? resolvedSource : resolvedSource?.uri;

      if (!uri) {
        throw new Error('Sticker asset URI could not be resolved.');
      }

      await sendMediaMessage(chat.id, {
        kind: 'image',
        uri,
        fileName: `sticker-${sticker.label}.png`,
        mimeType: 'image/png',
      });
    } catch (error) {
      console.warn('Sticker send failed:', error);
    }
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    const replyId = replyTarget?.id;
    sendMessage(chat.id, value, replyId, { textColor, fontStyle, fontFamily });
    setText('');
    setTextColor(colors.white);
    setFontStyle('normal');
    setFontFamily(FONT_FAMILIES[0].value);
    if (replyId) {
      swipeableRefs.current[replyId]?.close?.();
    }
    setReplyTarget(null);
    setShowEmojiPicker(false);
    sendChatActivity(chat.id, null);
    requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
  };

  const startWebRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('Microphone is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone permission is required to record voice notes.');
    }
  };

  const stopWebRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    clearInterval(recordingTimerRef.current);

    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const durationSecs = Math.max(1, recordingSeconds);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        recorder.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setIsRecordingVoice(false);
        setRecordingSeconds(0);

        await sendMediaMessage(chat.id, {
          kind: 'voice',
          uri: dataUrl,
          fileName: `Voice note (${durationSecs}s)`,
          mimeType: blob.type || 'audio/webm',
          durationMs: durationSecs * 1000,
        });
        requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
      };
      reader.readAsDataURL(blob);
    };

    recorder.stop();
  };

  const toggleRecording = () => {
    if (isRecordingVoice) {
      stopWebRecording();
    } else {
      void startWebRecording();
    }
  };

  const handleDocumentPick = async () => {
    try {
      setShowAttachmentMenu(false);
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        const isImage = Boolean(
          file.mimeType?.startsWith('image/') ||
          file.name?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)
        );
        const isVideo = Boolean(
          file.mimeType?.startsWith('video/') ||
          file.name?.match(/\.(mp4|mov|webm|m4v|mkv|avi)$/i)
        );
        await sendMediaMessage(chat.id, {
          kind: isVideo ? 'video' : isImage ? 'image' : 'file',
          uri: file.uri,
          fileName: file.name,
          mimeType: file.mimeType || (isVideo ? 'video/mp4' : isImage ? 'image/png' : 'application/octet-stream'),
        });
        requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
      }
    } catch (err) {
      console.warn('File pick canceled or failed', err);
    }
  };

  const handleDroppedFiles = async (event: any) => {
    event?.preventDefault?.();
    const files = Array.from((event?.dataTransfer?.files ?? []) as File[]);
    if (!files.length) return;

    for (const file of files) {
      if (!file) continue;
      const resolvedFile = file as File;
      const isImage = resolvedFile.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(resolvedFile.name);
      const isVideo = resolvedFile.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(resolvedFile.name);
      if (!isImage && !isVideo) continue;

      const uri = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(resolvedFile as Blob) : resolvedFile.name;
      await sendMediaMessage(chat.id, {
        kind: isVideo ? 'video' : 'image',
        uri,
        fileName: resolvedFile.name,
        mimeType: resolvedFile.type || (isVideo ? 'video/mp4' : 'image/png'),
      });
    }

    requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
  };

  const handleDownloadMedia = async () => {
    if (!previewMedia) return;

    try {
      const fileName = previewMedia.fileName || `${previewMedia.kind}-${Date.now()}.${previewMedia.kind === 'video' ? 'mp4' : 'png'}`;

      if (Platform.OS === 'web') {
        const response = await fetch(previewMedia.uri);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const targetPath = `${FileSystem.Paths.document.uri}${fileName}`;
      const downloadRes = await FileSystem.downloadAsync(previewMedia.uri, targetPath);
      if (downloadRes.status >= 200 && downloadRes.status < 300) {
        Alert.alert('Download complete', 'Media saved to your device.');
      } else {
        Alert.alert('Download failed', 'Unable to save this media to your device.');
      }
    } catch (error) {
      console.warn('Media download failed:', error);
      Alert.alert('Download failed', 'Unable to save this media to your device.');
    }
  };

  const call = async (video: boolean) => {
    if (!signalingEnabled || !signalingReady) return;
    if (video) await startVideoCall(chat.id);
    else await startAudioCall(chat.id);
  };

  const timerOptions = [
    { label: 'Off', value: null },
    { label: '1 min', value: 60 },
    { label: '1 hour', value: 3600 },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
    { label: '30 days', value: 2592000 },
  ] as const;

  const handleMessageAction = async (messageKey: string, action: 'reply' | 'delete' | 'forward' | 'reaction' | 'pin' | 'star', emoji?: string) => {
    // Look up the message from current state by its stable clientId (falling back to id),
    // so the real server UUID is always available even right after the message syncs.
    const currentMessage = chat.messages.find((m) => m.clientId === messageKey || m.id === messageKey);
    const closeMenu = () => {
      setActiveMessageMenu(null);
      setMenuAnchor(null);
    };

    if (!currentMessage) {
      console.warn('[handleMessageAction] Message not found:', messageKey);
      closeMenu();
      return;
    }

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentMessage.id);

    if (action === 'reply') {
      if (!isValidUuid) {
        alert('Message is still sending. Please wait a moment before replying.');
        closeMenu();
        return;
      }
      setReplyTarget(currentMessage);
      closeMenu();
      return;
    }
    if (action === 'delete') {
      deleteMessage(chat.id, currentMessage.id);
      closeMenu();
      return;
    }
    if (action === 'pin') {
      toggleMessagePin(chat.id, currentMessage.id);
      closeMenu();
      return;
    }
    if (action === 'star') {
      toggleMessageStar(chat.id, currentMessage.id);
      closeMenu();
      return;
    }
    if (action === 'forward') {
      setForwardMessage(currentMessage);
      closeMenu();
      return;
    }
    if (action === 'reaction') {
      if (emoji) {
        if (!isValidUuid) {
          alert('Message is still sending. Please wait a moment before reacting.');
          closeMenu();
          return;
        }
        try {
          await postMessageReaction(currentMessage.id, emoji);
        } catch (error) {
          console.warn('Reaction error:', error);
        }
      }
      closeMenu();
    }
  };

  const replyTargetText = replyTarget ? (replyTarget.text || replyTarget.fileName || (replyTarget.kind === 'voice' ? 'Voice note' : replyTarget.kind === 'image' ? 'Photo' : 'Message')) : '';
  const activeMenuMessage = activeMessageMenu ? messages.find((message) => (message.clientId ?? message.id) === activeMessageMenu) : null;

  const openMessageMenu = (event: any, message: Message, mine: boolean) => {
    event.stopPropagation();
    event.preventDefault();
    const menuKey = message.clientId ?? message.id;
    if (activeMessageMenu === menuKey) {
      setActiveMessageMenu(null);
      setMenuAnchor(null);
      return;
    }
    const MENU_HEIGHT_ESTIMATE = 190;
    const btnRect = event.currentTarget?.getBoundingClientRect?.();
    const containerRect = conversationRef.current?.getBoundingClientRect?.();
    if (btnRect && containerRect) {
      const spaceBelow = containerRect.bottom - btnRect.bottom;
      const openUp = spaceBelow < MENU_HEIGHT_ESTIMATE;
      const top = openUp
        ? Math.max(8, btnRect.top - containerRect.top - MENU_HEIGHT_ESTIMATE)
        : btnRect.bottom - containerRect.top + 6;
      setMenuAnchor({
        top,
        left: mine ? undefined : Math.max(8, btnRect.left - containerRect.left - 10),
        right: mine ? Math.max(8, containerRect.right - btnRect.right - 10) : undefined,
        mine,
      });
    }
    setActiveMessageMenu(menuKey);
  };

  return (
    <View
      ref={conversationRef}
      style={[styles.conversation, { backgroundColor: wall.page }]}
      {...({
        onDragOver: (event: any) => {
          event.preventDefault?.();
          if (event?.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
          }
        },
        onDrop: (event: any) => {
          void handleDroppedFiles(event);
        },
      } as any)}
    >
      <AmbientQuantumField />

      {(showTopMenu || showAttachmentMenu || showEmojiPicker || showFormatPanel || activeMessageMenu) && (
        <Pressable style={styles.dismissOverlay} onPress={closeAllPanels} />
      )}

      {/* HEADER - MOBILE BACK BUTTON */}
      {isMobile && (
        <View style={[styles.chatHeader, styles.mobileHeader]}>
          <Pressable onPress={() => router.back()} style={styles.mobileBackButton}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </Pressable>
          <Pressable onPress={() => setProfileViewer({ name: chat.name, macroId: chat.macroId, avatarUrl: chat.avatarUrl, avatarColor: chat.avatarColor })}>
            <Avatar name={chat.name} color={chat.avatarColor} size={32} online={chat.online} imageUrl={chat.avatarUrl} />
          </Pressable>
          <View style={styles.mobilePersonInfo}>
            <Text style={styles.personName}>{chat.name}</Text>
            {activity ? (
              activity.state === 'typing' ? (
                <TypingIndicator />
              ) : (
                <Text style={[styles.presence, styles.presenceActive]}>{activity.state === 'recording' ? 'recording voice note...' : 'taking a screenshot...'}</Text>
              )
            ) : (() => {
              const statusColor = chat.status === 'busy'
                ? '#FFB84D'
                : chat.status === 'away'
                  ? '#7AC7FF'
                  : chat.status === 'offline'
                    ? '#9CB2CC'
                    : colors.neon;

              return chat.online ? (
                <Text style={[styles.presence, { color: statusColor }]}>{chat.lastSeen}</Text>
              ) : (
                <Text style={[styles.presence, { color: '#9CB2CC' }]}>{chat.lastSeen}</Text>
              );
            })()}
          </View>
          <Pressable
            accessibilityLabel="More tools"
            style={styles.mobileMenuButton}
            onPress={() => setShowTopMenu(!showTopMenu)}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
          </Pressable>

          {showTopMenu && (
            <View style={[styles.topPopMenu, styles.mobileTopMenu]}>
              <Pressable style={styles.popMenuItem} onPress={() => { pinChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name={chat.pinned ? 'pin' : 'pin-outline'} size={16} color={colors.white} />
                <Text style={styles.popMenuText}>{chat.pinned ? 'Unpin chat' : 'Pin chat'}</Text>
              </Pressable>
              <Pressable style={styles.popMenuItem} onPress={() => { muteChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name={chat.muted ? 'volume-high-outline' : 'volume-mute-outline'} size={16} color={colors.white} />
                <Text style={styles.popMenuText}>{chat.muted ? 'Unmute' : 'Mute notifications'}</Text>
              </Pressable>
              <View style={styles.timerSection}>
                <Text style={styles.timerTitle}>Disappearing messages</Text>
                <View style={styles.timerGrid}>
                  {timerOptions.map((option) => (
                    <Pressable
                      key={option.label}
                      style={[styles.timerChip, chat.disappearingSeconds === option.value && styles.timerChipActive]}
                      onPress={() => { setChatDisappearingTimer(chat.id, option.value); setShowTopMenu(false); }}
                    >
                      <Text style={[styles.timerChipText, chat.disappearingSeconds === option.value && styles.timerChipTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable style={styles.popMenuItem} onPress={() => { clearChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name="trash-outline" size={16} color={colors.white} />
                <Text style={styles.popMenuText}>Clear chat</Text>
              </Pressable>
              {chat.participantUserId && (
                <Pressable style={styles.popMenuItem} onPress={() => { void blockContact(chat.participantUserId!); setShowTopMenu(false); }}>
                  <Ionicons name="ban-outline" size={16} color={colors.danger} />
                  <Text style={[styles.popMenuText, { color: colors.danger }]}>Block contact</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* HEADER - DESKTOP */}
      {!isMobile && (
        <View style={styles.chatHeader}>
          <Pressable onPress={() => setProfileViewer({ name: chat.name, macroId: chat.macroId, avatarUrl: chat.avatarUrl, avatarColor: chat.avatarColor })}>
            <Avatar name={chat.name} color={chat.avatarColor} size={42} online={chat.online} imageUrl={chat.avatarUrl} />
          </Pressable>
          <View style={styles.person}>
            <Text style={styles.personName}>{chat.name}</Text>
            {activity ? (
              activity.state === 'typing' ? (
                <TypingIndicator />
              ) : (
                <Text style={[styles.presence, styles.presenceActive]}>
                  {activity.state === 'recording' ? 'recording voice note...' : 'taking a screenshot...'}
                </Text>
              )
            ) : (() => {
              const statusColor = chat.status === 'busy'
                ? '#FFB84D'
                : chat.status === 'away'
                  ? '#7AC7FF'
                  : chat.status === 'offline'
                    ? '#9CB2CC'
                    : colors.neon;

              return chat.online ? (
                <View style={styles.presenceRow}>
                  <View style={[styles.presenceDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.presence, { color: statusColor }]}>{chat.lastSeen}</Text>
                </View>
              ) : (
                <Text style={[styles.presence, { color: '#9CB2CC' }]}>{chat.lastSeen}</Text>
              );
            })()}
          </View>
          <Pressable
            accessibilityLabel="Screenshot activity"
            style={styles.headerAction}
            onPress={() => setManualActivityState((current) => current === 'screenshot' ? null : 'screenshot')}
          >
            <Ionicons name="camera-outline" size={18} color={manualActivityState === 'screenshot' ? colors.neon : colors.muted} />
          </Pressable>
          <Pressable
            accessibilityLabel="Search messages"
            style={styles.headerAction}
            onPress={() => {
              setShowMessageSearch((current) => !current);
              if (showMessageSearch) {
                setMessageSearchQuery('');
              }
            }}
          >
            <Ionicons name="search" size={20} color={showMessageSearch ? colors.neon : colors.muted} />
          </Pressable>
          <Pressable accessibilityLabel="Video call" style={styles.headerAction} onPress={() => call(true)}>
            <Ionicons name="videocam-outline" size={21} color={colors.blue} />
          </Pressable>
          <Pressable accessibilityLabel="Audio call" style={styles.headerAction} onPress={() => call(false)}>
            <Ionicons name="call-outline" size={20} color={colors.blue} />
          </Pressable>
          <Pressable accessibilityLabel="More tools" style={styles.headerAction} onPress={() => setShowTopMenu(!showTopMenu)}>
            <Ionicons name="ellipsis-vertical" size={19} color={colors.muted} />
          </Pressable>

          {showTopMenu && (
            <View style={styles.topPopMenu}>
              <Pressable style={styles.popMenuItem} onPress={() => { pinChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name={chat.pinned ? 'pin' : 'pin-outline'} size={16} color={colors.white} />
                <Text style={styles.popMenuText}>{chat.pinned ? 'Unpin chat' : 'Pin chat'}</Text>
              </Pressable>
              <Pressable style={styles.popMenuItem} onPress={() => { muteChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name={chat.muted ? 'volume-high-outline' : 'volume-mute-outline'} size={16} color={colors.white} />
                <Text style={styles.popMenuText}>{chat.muted ? 'Unmute' : 'Mute notifications'}</Text>
              </Pressable>
              <View style={styles.timerSection}>
                <Text style={styles.timerTitle}>Disappearing messages</Text>
                <View style={styles.timerGrid}>
                  {timerOptions.map((option) => (
                    <Pressable
                      key={option.label}
                      style={[styles.timerChip, chat.disappearingSeconds === option.value && styles.timerChipActive]}
                      onPress={() => { setChatDisappearingTimer(chat.id, option.value); setShowTopMenu(false); }}
                    >
                      <Text style={[styles.timerChipText, chat.disappearingSeconds === option.value && styles.timerChipTextActive]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable style={styles.popMenuItem} onPress={() => { clearChat(chat.id); setShowTopMenu(false); }}>
                <Ionicons name="trash-outline" size={16} color={colors.white} />
                <Text style={styles.popMenuText}>Clear chat</Text>
              </Pressable>
              {chat.participantUserId && (
                <Pressable style={styles.popMenuItem} onPress={() => { void blockContact(chat.participantUserId!); setShowTopMenu(false); }}>
                  <Ionicons name="ban-outline" size={16} color={colors.danger} />
                  <Text style={[styles.popMenuText, { color: colors.danger }]}>Block contact</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {chat.peerDevice && (
        <View style={styles.deviceFlag} pointerEvents="none">
          <View style={styles.deviceFlagRope} />
          <View style={styles.deviceFlagBody}>
            <Ionicons name={deviceIcon(chat.peerDevice)} size={13} color={colors.neon} />
            <Text style={styles.deviceFlagText}>{deviceLabel(chat.peerDevice)}</Text>
          </View>
        </View>
      )}

      <View style={styles.encryption}>
        <Ionicons name="lock-closed" size={10} color={colors.neon} />
        <Text style={styles.encryptionText}>Messages are end-to-end encrypted</Text>
      </View>

      {/* MESSAGE LIST */}
      <Animated.View
        pointerEvents={showMessageSearch ? 'auto' : 'none'}
        style={[
          styles.messageSearchBar,
          {
            opacity: messageSearchAnim,
            transform: [{ translateY: messageSearchAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            maxHeight: messageSearchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 78] }),
          },
        ]}
      >
        <View style={styles.messageSearchRow}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            ref={messageSearchRef}
            value={messageSearchQuery}
            onChangeText={setMessageSearchQuery}
            placeholder="Search this chat"
            placeholderTextColor={colors.muted}
            style={[styles.messageSearchInput, { outlineWidth: 0, outlineStyle: 'none' } as never]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchMatches.length > 0 && (
            <View style={styles.searchNavWrap}>
              <Pressable onPress={() => jumpToSearchMatch(-1)} style={styles.searchNavBtn}>
                <Ionicons name="chevron-up" size={13} color={colors.white} />
              </Pressable>
              <Pressable onPress={() => jumpToSearchMatch(1)} style={styles.searchNavBtn}>
                <Ionicons name="chevron-down" size={13} color={colors.white} />
              </Pressable>
            </View>
          )}
          {messageSearchQuery ? (
            <Pressable onPress={() => setMessageSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      {replyTarget && (
        <View style={styles.replyBanner}>
          <View style={styles.replyContext}>
            <Ionicons name="return-down-forward-outline" size={14} color={colors.neon} />
            <Text style={styles.replyText} numberOfLines={1}>Replying to: {replyTargetText}</Text>
          </View>
          <Pressable onPress={() => setReplyTarget(null)}><Ionicons name="close" size={16} color={colors.muted} /></Pressable>
        </View>
      )}

      <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={filteredMessages}
        inverted
        ListHeaderComponent={pinnedHeader}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => setAwayFromBottom(event.nativeEvent.contentOffset.y > 160)}
        renderItem={({ item, index }) => {
          if (item.kind === 'call') {
            return <CallMessageBubble item={item} />;
          }

          if (item.kind === 'system') {
            return (
              <View style={styles.systemRow}>
                <View style={styles.systemPill}>
                  <Text style={styles.systemText}>{item.text}</Text>
                </View>
                <Text style={styles.systemStamp}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
            );
          }

          const mine = item.senderId === 'me';
          const isSticker = Boolean(
            item.fileName?.toLowerCase().startsWith('sticker-') ||
            item.text?.toLowerCase().includes('sticker') ||
            item.mediaPath?.toLowerCase().includes('sticker') ||
            item.mediaUrl?.toLowerCase().includes('sticker')
          );
          const isImage = item.kind === 'image' || Boolean(
            item.mediaUrl?.startsWith('data:image/') ||
            item.mimeType?.startsWith('image/') ||
            item.fileName?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)
          );
          const isVideo = item.kind === 'video' || Boolean(
            item.mediaUrl?.startsWith('data:video/') ||
            item.mediaUrl?.includes('.mp4') ||
            item.mimeType?.startsWith('video/') ||
            item.fileName?.match(/\.(mp4|mov|webm|m4v|mkv|avi)$/i)
          );
          const isVoice = item.kind === 'voice';

          const isMenuOpen = activeMessageMenu === (item.clientId ?? item.id);
          const isReplyJumpTarget = item.id === replyJumpTargetId || item.clientId === replyJumpTargetId;

          const repliedMessage = item.replyTo ? chat.messages.find((message) => message.id === item.replyTo) : null;
          const reactionSummary = Array.from((messageReactions[item.id] ?? []).reduce((map, reaction) => {
            const count = map.get(reaction.emoji) ?? 0;
            map.set(reaction.emoji, count + 1);
            return map;
          }, new Map<string, number>())).map(([emoji, count]) => ({ emoji, count }));

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
                  setReplyTarget(item);
                }
              }}
            >
              <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
                <View style={[
                  styles.bubble,
                  mine ? styles.mine : styles.theirs,
                  { backgroundColor: mine ? wall.bubbleMine : wall.bubble },
                  isSticker && styles.stickerBubble,
                  isMenuOpen && styles.bubbleActive,
                  isReplyJumpTarget && styles.replyJumpFlash,
                ]}>
                  {item.expiresAt && <MessageTimerBorder expiresAt={item.expiresAt} createdAt={item.createdAt} radius={16} />}
                  {item.replyTo && repliedMessage && (
                    <Pressable onPress={() => jumpToMessage(repliedMessage.id || repliedMessage.clientId)} style={styles.replyPreview}>
                      <Text style={styles.replyPreviewText}>
                        {repliedMessage.senderId === 'me' ? 'You' : chat.name}: {repliedMessage.text || repliedMessage.fileName || (repliedMessage.kind === 'voice' ? 'Voice note' : repliedMessage.kind === 'image' ? 'Photo' : 'Message')}
                      </Text>
                    </Pressable>
                  )}
                  {isVoice ? (
                    <VoiceNoteBubble item={item} />
                  ) : isVideo && (item.mediaUrl || item.mediaPath) ? (
                    <Pressable onPress={() => setPreviewMedia({ uri: item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : '') || '', kind: 'video', fileName: item.fileName, aspectRatio: videoRatios[item.id] ?? 16 / 9 })}>
                      <View style={[styles.videoBubbleContainer, { aspectRatio: videoRatios[item.id] || 16 / 9, width: 280, maxWidth: '90%', height: 'auto', maxHeight: 380 }]}>
                        <VideoThumbnail
                          uri={item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : '') || ''}
                          onMeta={(meta) => {
                            if (meta.ratio) setVideoRatios((current) => (current[item.id] ? current : { ...current, [item.id]: meta.ratio! }));
                            if (meta.durationMs) setVideoDurations((current) => (current[item.id] ? current : { ...current, [item.id]: meta.durationMs! }));
                          }}
                        />
                        <View style={styles.videoScrim} />
                        <View style={styles.videoPlayBadge}><Ionicons name="play" size={22} color={colors.navy950} /></View>
                        <View style={styles.videoDurationPill}>
                          <Ionicons name="videocam" size={11} color={colors.white} />
                          <Text style={styles.videoDurationText}>{formatClipDuration(videoDurations[item.id])}</Text>
                        </View>
                      </View>
                    </Pressable>
                  ) : isImage && (item.mediaUrl || item.mediaPath) ? (
                    isSticker ? (
                      <Image source={{ uri: item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : undefined) }} style={styles.stickerImageOnly} resizeMode="contain" />
                    ) : (
                      <Pressable onPress={() => setPreviewMedia({ uri: item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : '') || '', kind: 'image', fileName: item.fileName })}>
                        <Image source={{ uri: item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : undefined) }} style={styles.photoThumbnail} resizeMode="cover" />
                        {item.fileName ? <Text style={styles.photoCaption} numberOfLines={1}>{item.fileName.replace(/^sticker-/, '')}</Text> : null}
                      </Pressable>
                    )
                  ) : item.kind && item.kind !== 'text' ? (
                    <View style={styles.attachment}>
                      <Ionicons name="document-outline" size={20} color={colors.blue} />
                      <Text style={styles.attachmentText}>{item.fileName || item.text || item.kind}</Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.messageText,
                        { fontSize: messageFontSize, lineHeight: messageFontSize + 6, fontFamily: messageFontFamily || 'system' },
                        item.textColor ? { color: item.textColor } : null,
                        item.fontStyle ? { fontStyle: item.fontStyle } : null,
                      ]}
                    >
                      {item.text}
                    </Text>
                  )}
                  {(item.pinned || item.starred) && (
                    <View style={styles.messageFlagRow}>
                      {item.pinned && <Ionicons name="pin" size={12} color={colors.neon} />}
                      {item.starred && <Ionicons name="star" size={12} color={colors.yellow} />}
                    </View>
                  )}
                  {reactionSummary.length > 0 && (
                    <View style={styles.reactionStrip}>
                      {reactionSummary.map((reaction) => (
                        <View key={reaction.emoji} style={styles.reactionPill}>
                          <Text style={styles.reactionText}>{reaction.emoji}</Text>
                          <Text style={styles.reactionCount}>{reaction.count}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.meta}>
                    {item.expiresAt && <Text style={styles.expiry}>{expiryLabel(item.expiresAt)}</Text>}
                    <Text style={styles.messageTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                    {mine && <MessageTicks status={item.status} />}
                  </View>
                </View>

                <Pressable
                  style={styles.messageMenuButton}
                  onPress={(event) => openMessageMenu(event, item, mine)}
                >
                  <Ionicons name="ellipsis-vertical" size={14} color={colors.muted} />
                </Pressable>
              </View>
            </Swipeable>
          );
        }}
      />

      {awayFromBottom && (
        <View style={{ position: 'absolute', bottom: 12, right: 18, alignItems: 'center' }}>
          {messages.filter((message) => message.senderId !== 'me' && message.createdAt > new Date(Date.now() - 60000).toISOString()).length > 0 && (
            <View style={{ position: 'absolute', right: -2, top: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, zIndex: 2 }}>
              <Text style={{ color: colors.navy950, fontSize: 10, fontWeight: '900' }}>{Math.min(9, messages.filter((message) => message.senderId !== 'me' && message.createdAt > new Date(Date.now() - 60000).toISOString()).length)}</Text>
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Scroll to latest message" style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border }} onPress={() => { setShowMessageSearch(false); setMessageSearchQuery(''); requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: true })); setAwayFromBottom(false); }}><Ionicons name="arrow-down" size={23} color={colors.white} /></Pressable>
        </View>
      )}
      </View>
      {activity && (activity.state === 'typing' || activity.state === 'recording' || activity.state === 'screenshot') && (
        <View style={{ paddingHorizontal: 20, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {activity.state === 'typing' ? (
            <TypingIndicator />
          ) : (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.neon, fontSize: 13 }}>{activityLabel}</Text>
          )}
        </View>
      )}

      {/* FLOATING MESSAGE ACTION MENU (rendered outside the inverted list so it can never be clipped by a row's own stacking context) */}
      {activeMenuMessage && menuAnchor && (
        <View
          style={[
            styles.messageActionMenu,
            { top: menuAnchor.top, pointerEvents: 'auto' },
            menuAnchor.mine ? { right: menuAnchor.right } : { left: menuAnchor.left },
          ]}
        >
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'reaction', '👍'); }}><Text style={styles.actionIcon}>👍</Text><Text style={styles.actionText}>React</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'reply'); }}><Ionicons name="return-down-forward-outline" size={14} color={colors.white} /><Text style={styles.actionText}>Reply</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'pin'); }}><Ionicons name="pin" size={14} color={colors.white} /><Text style={styles.actionText}>{activeMenuMessage?.pinned ? 'Unpin' : 'Pin'}</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'star'); }}><Ionicons name="star" size={14} color={colors.white} /><Text style={styles.actionText}>{activeMenuMessage?.starred ? 'Unstar' : 'Star'}</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'forward'); }}><Ionicons name="arrow-redo-outline" size={14} color={colors.white} /><Text style={styles.actionText}>Forward</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'delete'); }}><Ionicons name="trash-outline" size={14} color={colors.danger} /><Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text></Pressable>
        </View>
      )}

      {profileViewer && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setProfileViewer(null)}>
          <Pressable style={styles.profileModalBackdrop} onPress={() => setProfileViewer(null)}>
            <Pressable style={styles.profileModalCard} onPress={() => undefined}>
              <Pressable style={styles.profileModalClose} onPress={() => setProfileViewer(null)}>
                <Ionicons name="close" size={22} color={colors.white} />
              </Pressable>
              <Avatar name={profileViewer.name} color={profileViewer.avatarColor} size={120} imageUrl={profileViewer.avatarUrl} />
              <Text style={styles.profileModalName}>{profileViewer.name}</Text>
              <Text style={styles.profileModalMacro}>{profileViewer.macroId}</Text>
              <Text style={[styles.profileModalMeta, { color: chat.online ? colors.neon : colors.muted }]}>{chat.lastSeen}</Text>
              {chat.peerDevice && <View style={styles.presenceRow}><Ionicons name={deviceIcon(chat.peerDevice)} size={18} color={colors.blue} /><Text style={styles.profileModalMeta}>{deviceLabel(chat.peerDevice)}</Text></View>}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* MEDIA PREVIEW LIGHTBOX MODAL */}
      <Modal visible={Boolean(previewMedia)} transparent animationType="fade" onRequestClose={() => setPreviewMedia(null)}>
        <View style={styles.imageModalBackdrop}>
          <Pressable style={styles.imageModalClose} onPress={() => setPreviewMedia(null)}>
            <Ionicons name="close" size={28} color={colors.white} />
          </Pressable>

          {previewMedia && (
            <>
              <View style={[styles.mediaModalFrame, { maxWidth: modalMaxWidth, maxHeight: modalMaxHeight }]}>
                {previewMedia && previewMedia.kind === 'video' ? (
                  <Video
                    source={{ uri: previewMedia.uri }}
                    style={[styles.mediaModalContent, { width: '100%', height: '100%', aspectRatio: previewMedia.aspectRatio || 16 / 9 }]}
                    resizeMode={ResizeMode.CONTAIN}
                    useNativeControls
                    isLooping={false}
                  />
                ) : previewMedia && (
                  <Image source={{ uri: previewMedia.uri }} style={styles.mediaModalImage} resizeMode="contain" />
                )}
              </View>

              <View style={styles.previewActionsRow}>
                <Pressable style={styles.previewDownloadButton} onPress={handleDownloadMedia}>
                  <Ionicons name="download-outline" size={18} color={colors.white} />
                  <Text style={styles.previewDownloadText}>Download</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* EMOJI PICKER POPUP */}
      {showEmojiPicker && (
        <View style={[styles.emojiGrid, isMobile && styles.mobileEmojiGrid]}>
          <View style={styles.pickerSectionHeader}>
            <Text style={styles.pickerSectionTitle}>Emoji</Text>
          </View>
          <View style={[styles.emojiGridInner, isMobile && styles.mobileEmojiGridInner]}>
            {EMOJI_LIST.map((emoji) => (
              <Pressable
                key={emoji}
                style={[styles.emojiBtn, isMobile && styles.mobileEmojiBtn]}
                onPress={() => {
                  setText((prev) => prev + emoji);
                }}
              >
                <Text style={{ fontSize: isMobile ? 16 : 20 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.pickerSectionHeader}>
            <Text style={styles.pickerSectionTitle}>Stickers</Text>
          </View>
          <View style={[styles.stickerGrid, isMobile && styles.mobileStickerGrid]}>
            {STICKER_LIST.map((sticker) => (
              <Pressable
                key={sticker.id}
                style={[styles.stickerBtn, isMobile && styles.mobileStickerBtn]}
                onPress={() => void handleStickerPress(sticker)}
              >
                <Image source={sticker.source} style={[styles.stickerImage, isMobile && styles.mobileStickerImage]} resizeMode="contain" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ATTACHMENT POPUP */}
      {showAttachmentMenu && (
        <View style={styles.attachmentMenu}>
          <Pressable style={styles.attachOption} onPress={handleDocumentPick}>
            <Ionicons name="document-text-outline" size={20} color={colors.neon} />
            <Text style={styles.attachOptionText}>Document / File</Text>
          </Pressable>
          <Pressable style={styles.attachOption} onPress={handleDocumentPick}>
            <Ionicons name="image-outline" size={20} color={colors.blue} />
            <Text style={styles.attachOptionText}>Photo / Video</Text>
          </Pressable>
          <Pressable style={styles.attachOption} onPress={() => { setShowAttachmentMenu(false); router.push('/camera?intent=chat'); }}>
            <Ionicons name="camera-outline" size={20} color={colors.white} />
            <Text style={styles.attachOptionText}>Camera</Text>
          </Pressable>
        </View>
      )}

      {/* FORMATTING EXPANDABLE PANEL */}
      {showFormatPanel && (
        <View style={styles.expandedFormatPanel}>
          <View style={styles.formatSection}>
            <Text style={styles.formatLabel}>Text Color:</Text>
            <View style={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <Pressable
                  key={color}
                  style={[styles.colorChip, { backgroundColor: color }, textColor === color && styles.chipSelected]}
                  onPress={() => setTextColor(color)}
                />
              ))}
            </View>
          </View>

          <View style={styles.formatSection}>
            <Text style={styles.formatLabel}>Font Family:</Text>
            <View style={styles.fontRow}>
              {FONT_FAMILIES.map((font) => (
                <Pressable
                  key={font.label}
                  style={[styles.fontChip, fontFamily === font.value && styles.fontChipActive]}
                  onPress={() => setFontFamily(font.value)}
                >
                  <Text style={[styles.fontChipText, { fontFamily: font.value as any }]}>{font.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.formatSection}>
            <Text style={styles.formatLabel}>Font Style:</Text>
            <View style={styles.fontRow}>
              {['normal', 'italic'].map((st) => (
                <Pressable
                  key={st}
                  style={[styles.fontChip, fontStyle === st && styles.fontChipActive]}
                  onPress={() => setFontStyle(st as 'normal' | 'italic')}
                >
                  <Text style={[styles.fontChipText, { fontStyle: st as 'normal' | 'italic' }]}>
                    {st === 'normal' ? 'Normal' : 'Italic'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* COMPOSER */}
      <View style={[styles.composer, { backgroundColor: wall.panel }]}>
        <Pressable
          accessibilityLabel="Attach media"
          style={styles.composeAction}
          onPress={() => setShowAttachmentMenu(!showAttachmentMenu)}
        >
          <Ionicons name="add" size={26} color={showAttachmentMenu ? colors.neon : colors.blue} />
        </Pressable>

        <View style={styles.optionsContainer}>
          <View style={styles.inputShell}>
            <Pressable onPress={() => setShowEmojiPicker(false)} style={{ paddingRight: 6 }}>
              <Ionicons name="happy-outline" size={21} color={showEmojiPicker ? colors.neon : colors.blue} />
            </Pressable>

            <Pressable onPress={() => setShowFormatPanel(!showFormatPanel)} style={{ paddingRight: 6 }}>
              <Ionicons name="text-outline" size={20} color={showFormatPanel ? colors.neon : colors.muted} />
            </Pressable>

            {isRecordingVoice ? (
              <View style={styles.recordingPill}>
                <Ionicons name="radio-button-on" size={14} color={colors.danger} />
                <Text style={styles.recordingText}>Recording voice note: {recordingSeconds}s</Text>
              </View>
            ) : (
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                placeholder="Type a message"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={4000}
                style={[styles.input, { outlineStyle: 'none', color: textColor, fontStyle, fontFamily: fontFamily as any, verticalAlign: 'middle' } as never]}
                onKeyPress={(event: any) => {
                  if (event?.nativeEvent?.key === 'Enter' && !event?.nativeEvent?.shiftKey) {
                    event.preventDefault?.();
                    send();
                  }
                }}
              />
            )}
          </View>
        </View>

        <Pressable
          accessibilityLabel={text.trim() ? 'Send message' : 'Record voice note'}
          style={[styles.send, (!text.trim() || isRecordingVoice) && styles.voice]}
          onPress={text.trim() ? send : toggleRecording}
        >
          <Ionicons name={text.trim() ? 'send' : isRecordingVoice ? 'stop' : 'mic'} size={19} color={colors.navy950} />
        </Pressable>
      </View>

      {forwardMessage && (
        <>
          <Pressable style={styles.dismissOverlay} onPress={() => setForwardMessage(null)} />
          <View style={styles.forwardModalOverlay}>
            <View style={styles.forwardModal}>
              <View style={styles.forwardModalHeader}>
                <Text style={styles.forwardModalTitle}>Forward to:</Text>
                <Pressable onPress={() => setForwardMessage(null)}><Ionicons name="close" size={24} color={colors.white} /></Pressable>
              </View>
              <View style={styles.forwardChatList}>
                {chats.filter((c: Chat) => c.id !== chat.id).map((targetChat: Chat) => (
                  <Pressable
                    key={targetChat.id}
                    style={styles.forwardChatItem}
                    onPress={() => {
                      const forwardText = forwardMessage.text || forwardMessage.fileName || (forwardMessage.kind === 'voice' ? 'Voice note' : forwardMessage.kind === 'image' ? 'Photo' : 'Message');
                      sendMessage(targetChat.id, `Fwd: ${forwardText}`);
                      setForwardMessage(null);
                    }}
                  >
                    <Avatar name={targetChat.name} color={targetChat.avatarColor} size={40} imageUrl={targetChat.avatarUrl} />
                    <View style={styles.forwardChatInfo}>
                      <Text style={styles.forwardChatName}>{targetChat.name}</Text>
                      <Text style={styles.forwardChatPreview} numberOfLines={1}>{targetChat.macroId}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export function WebMessenger({ initialChatId }: { initialChatId?: string } = {}) {
  const [windowWidth, setWindowWidth] = useState(() => Dimensions.get('window').width);
  const isMobileView = windowWidth < 820;

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(Dimensions.get('window').width);
    };
    const subscription = Dimensions.addEventListener('change', handleResize);
    return () => subscription?.remove();
  }, []);

  const { chats, profile, pinChat, muteChat, markChatUnread, clearChat, blockContact, deleteChat, activityByChat } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialChatId ?? null);
  const [activeContextMenu, setActiveContextMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return chats
      .filter((chat) => {
        if (!`${chat.name} ${chat.macroId}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
        if (filter === 'unread') return chat.unread > 0;
        if (filter === 'groups') return Boolean(chat.isGroup);
        return true;
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [chats, filter, query]);

  const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0];

  useEffect(() => {
    if (!selectedId && chats[0]) setSelectedId(chats[0].id);
  }, [chats, selectedId]);

  useEffect(() => {
    if (initialChatId) setSelectedId(initialChatId);
  }, [initialChatId]);

  return isMobileView && selected ? (
    <Conversation chat={selected} />
  ) : (
    <View style={styles.desktop}>
      {activeContextMenu && <Pressable style={styles.sidebarDismissOverlay} onPress={() => setActiveContextMenu(null)} />}
      <View style={styles.rail}>
        <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
        <View style={styles.railNav}>
          <Pressable accessibilityLabel="Chats" style={[styles.railButton, styles.railActive]}><Ionicons name="chatbubble-ellipses" size={22} color={colors.neon} /></Pressable>
          <Pressable accessibilityLabel="Updates" style={styles.railButton} onPress={() => router.push('/updates')}><Ionicons name="radio-outline" size={22} color={colors.muted} /></Pressable>
          <Pressable accessibilityLabel="Calls" style={styles.railButton} onPress={() => router.push('/calls')}><Ionicons name="call-outline" size={21} color={colors.muted} /></Pressable>
          <Pressable accessibilityLabel="People" style={styles.railButton} onPress={() => router.push('/people')}><Ionicons name="people-outline" size={22} color={colors.muted} /></Pressable>
          <Pressable accessibilityLabel="Settings" style={styles.railButton} onPress={() => router.push('/(tabs)/settings')}><Ionicons name="settings-outline" size={22} color={colors.muted} /></Pressable>
        </View>
        <Pressable style={styles.profileAvatar} accessibilityLabel="Settings" onPress={() => router.push('/(tabs)/settings')}><Avatar name={profile?.displayName || 'Macro'} color={profile?.avatarColor || colors.blue} size={34} online imageUrl={profile?.avatarUrl} /></Pressable>
      </View>

      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <View><Text style={styles.brand}>MACROCHAT</Text><Text style={styles.sidebarTitle}>Chats</Text></View>
          <View style={styles.sidebarActions}>
            <Pressable accessibilityLabel="Scan contact" style={styles.smallAction} onPress={() => router.push('/scan-macro')}><Ionicons name="scan-outline" size={19} color={colors.muted} /></Pressable>
            <Pressable accessibilityLabel="New chat" style={[styles.smallAction, styles.newChat]} onPress={() => router.push('/new-chat')}><Ionicons name="create-outline" size={19} color={colors.navy950} /></Pressable>
          </View>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search or start a new chat" placeholderTextColor={colors.muted} style={[styles.searchInput, { outlineStyle: 'none' } as never]} />
        </View>

        <View style={styles.filters}>
          {(['all', 'unread', 'groups'] as const).map((item) => (
            <Pressable key={item} style={[styles.filter, filter === item && styles.filterActive]} onPress={() => setFilter(item)}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        {/* CHAT SIDEBAR LIST */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={styles.chatList}
          ListEmptyComponent={<Text style={styles.empty}>No conversations found</Text>}
          renderItem={({ item }) => {
            const last = item.messages[item.messages.length - 1];
            const isMenuOpen = activeContextMenu === item.id;
            const rowActivity = activityByChat[item.id];
            return (
              <Pressable
                style={[
                  styles.chatRow,
                  selected?.id === item.id && styles.chatRowActive,
                  isMenuOpen && styles.chatRowMenuOpen,
                ]}
                onPress={() => {
                  setActiveContextMenu(null);
                  setSelectedId(item.id);
                }}
              >
                <Avatar name={item.name} color={item.avatarColor} size={47} online={item.online} imageUrl={item.avatarUrl} />
                <View style={[styles.chatCopy, isMenuOpen && styles.chatCopyMenuOpen]}>
                  <View style={styles.chatLine}>
                    {item.pinned && (
                      <Ionicons name="pin" size={13} color={colors.neon} style={{ marginRight: 6 }} />
                    )}
                    <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
                    {item.muted && (
                      <Ionicons name="volume-mute" size={13} color={colors.muted} style={{ marginLeft: 4, marginRight: 4 }} />
                    )}
                    <Text style={[styles.chatTime, item.unread > 0 && styles.unreadColor]}>{last ? chatTime(last.createdAt) : 'New'}</Text>
                  </View>

                  <View style={styles.chatLine}>
                    {rowActivity ? (
                      rowActivity.state === 'typing' ? (
                        <TypingIndicator />
                      ) : (
                        <Text style={[styles.preview, styles.previewTyping]} numberOfLines={1}>
                          {rowActivity.state === 'recording' ? 'recording voice note...' : 'taking a screenshot...'}
                        </Text>
                      )
                    ) : (
                      <>
                        {last?.senderId === 'me' && (
                          <View style={styles.previewTick}>
                            <MessageTicks status={last.status} />
                          </View>
                        )}
                        <Text style={styles.preview} numberOfLines={1}>
                          {last?.text ?? 'Start a private conversation'}
                        </Text>
                      </>
                    )}
                    {item.unread > 0 && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text></View>
                    )}
                    <Pressable
                      style={styles.chatRowMenuBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setActiveContextMenu(isMenuOpen ? null : item.id);
                      }}
                    >
                      <Ionicons name="chevron-down" size={16} color={colors.muted} />
                    </Pressable>
                  </View>

                  {/* SIDEBAR ROW CONTEXT MENU */}
                  {isMenuOpen && (
                    <View style={[styles.rowContextMenu, { pointerEvents: 'auto' }]}>
                      <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); pinChat(item.id); setActiveContextMenu(null); }}>
                        <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={15} color={colors.neon} />
                        <Text style={styles.ctxText}>{item.pinned ? 'Unpin chat' : 'Pin chat'}</Text>
                      </Pressable>
                      <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); muteChat(item.id); setActiveContextMenu(null); }}>
                        <Ionicons name={item.muted ? 'volume-high-outline' : 'volume-mute-outline'} size={15} color={colors.white} />
                        <Text style={styles.ctxText}>{item.muted ? 'Unmute' : 'Mute notifications'}</Text>
                      </Pressable>
                      <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); markChatUnread(item.id); setActiveContextMenu(null); }}>
                        <Ionicons name="mail-unread-outline" size={15} color={colors.white} />
                        <Text style={styles.ctxText}>{item.unread > 0 ? 'Mark as read' : 'Mark as unread'}</Text>
                      </Pressable>
                      <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); clearChat(item.id); setActiveContextMenu(null); }}>
                        <Ionicons name="trash-outline" size={15} color={colors.white} />
                        <Text style={styles.ctxText}>Clear chat</Text>
                      </Pressable>
                      {item.participantUserId && (
                        <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); void blockContact(item.participantUserId!); setActiveContextMenu(null); }}>
                          <Ionicons name="ban-outline" size={15} color={colors.danger} />
                          <Text style={[styles.ctxText, { color: colors.danger }]}>Block</Text>
                        </Pressable>
                      )}
                      <Pressable style={styles.ctxItem} onPress={(e) => { e.stopPropagation(); deleteChat(item.id); setActiveContextMenu(null); }}>
                        <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                        <Text style={[styles.ctxText, { color: colors.danger }]}>Delete chat</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
        />

        <View style={styles.identity}>
          <View style={styles.onlineDot} />
          <Text style={styles.identityText}>{profile?.macroId}</Text>
          <Ionicons name="lock-closed" size={12} color={colors.neon} />
        </View>
      </View>

      {selected ? <Conversation chat={selected} /> : <View style={styles.blank}><View style={styles.blankIcon}><Ionicons name="chatbubbles-outline" size={43} color={colors.blue} /></View><Text style={styles.blankTitle}>MacroChat Web</Text><Text style={styles.blankText}>Select a conversation or start a new private chat.</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  desktop: { position: 'relative', flex: 1, flexDirection: 'row', minWidth: 820, backgroundColor: '#010A12', overflow: 'hidden' },
  sidebarDismissOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 25, backgroundColor: 'transparent', pointerEvents: 'auto' },
  rail: { width: 68, backgroundColor: colors.black, borderRightWidth: 1, borderRightColor: colors.border, alignItems: 'center', paddingVertical: 14 },
  logo: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.navy950, fontSize: 20, fontWeight: '900' },
  railNav: { flex: 1, paddingTop: 28, gap: 8 },
  railButton: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  railActive: { backgroundColor: colors.navy800, borderLeftWidth: 2, borderLeftColor: colors.neon },
  profileAvatar: { marginTop: 10 },
  sidebar: { width: 390, maxWidth: '34%', backgroundColor: colors.navy900, borderRightWidth: 1, borderRightColor: colors.border, zIndex: 30, overflow: 'visible' },
  sidebarHeader: { height: 82, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.blue, fontSize: 9, fontWeight: '900' },
  sidebarTitle: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 2 },
  sidebarActions: { flexDirection: 'row', gap: 7 },
  smallAction: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  newChat: { backgroundColor: colors.neon },
  search: { height: 42, marginHorizontal: 12, backgroundColor: colors.navy800, borderRadius: 7, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, color: colors.white, fontSize: 13 },
  filters: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  filter: { height: 30, borderRadius: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.navy700, borderColor: colors.blue },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: colors.blue },
  chatList: { flex: 1, zIndex: 1, overflow: 'visible' },
  chatRow: { position: 'relative', minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, zIndex: 1, overflow: 'visible', elevation: 1 },
  chatRowActive: { backgroundColor: colors.navy800, borderLeftWidth: 3, borderLeftColor: colors.neon, paddingLeft: 10, zIndex: 2, elevation: 2 },
  chatRowMenuOpen: { zIndex: 9999999, elevation: 9999999 },
  chatCopy: { flex: 1, minWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 14, position: 'relative', zIndex: 1 },
  chatCopyMenuOpen: { zIndex: 9999999, elevation: 9999999 },
  chatLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatName: { color: colors.white, fontWeight: '800', fontSize: 14, flex: 1 },
  chatTime: { color: colors.muted, fontSize: 10 },
  unreadColor: { color: colors.neon },
  preview: { color: colors.muted, fontSize: 12, flex: 1, marginTop: 5 },
  previewTyping: { color: colors.neon },
  previewTick: { marginTop: 5, marginRight: 4 },
  badge: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  badgeText: { color: colors.navy950, fontSize: 9, fontWeight: '900' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
  identity: { height: 44, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.neon },
  identityText: { color: colors.muted, fontSize: 11, flex: 1 },
  conversation: { position: 'relative', flex: 1, minWidth: 0, backgroundColor: '#040D16', overflow: 'visible' },
  dismissOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: 'transparent', pointerEvents: 'auto' },
  chatHeader: { position: 'relative', height: 68, backgroundColor: colors.navy900, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, zIndex: 20 },
  person: { flex: 1 },
  personName: { color: colors.white, fontWeight: '800', fontSize: 15 },
  presence: { color: colors.muted, fontSize: 10, marginTop: 2 },
  presenceActive: { color: colors.neon },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  presenceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.neon },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.neon },
  deviceFlag: { position: 'absolute', top: 68, right: 26, zIndex: 6, alignItems: 'center' },
  deviceFlagRope: { width: 1, height: 12, backgroundColor: 'rgba(120, 204, 255, 0.45)' },
  deviceFlagBody: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.navy800, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.32)' },
  deviceFlagText: { color: colors.neon, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  headerAction: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  encryption: { position: 'absolute', top: 80, zIndex: 2, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 25, borderRadius: 5, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border },
  encryptionText: { color: colors.muted, fontSize: 9 },
  pinnedBanner: { position: 'relative', zIndex: 25, marginHorizontal: 12, marginTop: 8, marginBottom: 0, borderRadius: 10, backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: 'rgba(0,0,0,0.2)', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  pinnedBannerText: { flex: 1, color: colors.white, fontSize: 12, fontWeight: '700' },
  messageList: { flex: 1, zIndex: 1 },
  messageSearchBar: { position: 'absolute', top: 68, left: 0, right: 0, zIndex: 40, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(10, 19, 30, 0.97)', borderBottomWidth: 1, borderBottomColor: colors.border, overflow: 'hidden' },
  messageSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageSearchInput: { flex: 1, color: colors.white, fontSize: 13, minHeight: 30, outlineWidth: 0, outlineStyle: 'none' } as any,
  searchNavWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchNavBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  messageContent: { paddingHorizontal: '4%', paddingTop: 22, paddingBottom: 6, gap: 6 },
  bubbleWrap: { maxWidth: '85%', position: 'relative', marginBottom: 0, zIndex: 12, elevation: 12, overflow: 'visible', flexDirection: 'row', alignItems: 'flex-end', gap: 4, minWidth: 0 },
  mineWrap: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  bubble: {
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 174, 205, 0.18)',
    backgroundColor: 'rgba(17, 34, 51, 0.72)',
    overflow: 'visible',
    shadowColor: 'rgba(0, 0, 0, 0.18)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bubbleActive: { borderColor: 'rgba(148, 174, 205, 0.26)', shadowOpacity: 0.18 },
  replyJumpFlash: { borderColor: 'rgba(120, 214, 255, 0.9)', shadowColor: 'rgba(120, 214, 255, 0.8)', shadowOpacity: 0.95, shadowRadius: 14, elevation: 8 },
  mine: { backgroundColor: 'rgba(26, 62, 87, 0.72)', borderColor: 'rgba(135, 170, 210, 0.2)', borderBottomRightRadius: 6 },
  theirs: { backgroundColor: 'rgba(14, 25, 36, 0.74)', borderColor: 'rgba(135, 170, 210, 0.14)', borderBottomLeftRadius: 6 },
  stickerBubble: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, borderRadius: 0, overflow: 'visible', shadowOpacity: 0, elevation: 0 },
  messageText: { color: colors.white, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  replyPreview: { paddingVertical: 4, marginBottom: 6, borderLeftWidth: 2, borderLeftColor: colors.neon, paddingLeft: 8, maxWidth: '100%' },
  replyPreviewText: { color: colors.neon, fontSize: 10, fontWeight: '700', flexShrink: 1, lineHeight: 14 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  attachmentText: { color: colors.white, fontSize: 13, flexShrink: 1 },
  messageFlagRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2, paddingHorizontal: 1 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 1, paddingHorizontal: 1 },
  messageTime: { color: '#A9B9CB', fontSize: 10, fontWeight: '500' },
  expiry: { color: colors.blue, fontSize: 10, fontWeight: '600' },
  tick: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  readTick: { color: colors.blue },
  failedTick: { color: colors.danger },
  composer: { position: 'relative', zIndex: 12, minHeight: 58, backgroundColor: 'rgba(9, 20, 31, 0.96)', borderTopWidth: 1, borderTopColor: 'rgba(120, 204, 255, 0.16)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 1, boxShadow: '0 -8px 18px rgba(103, 211, 255, 0.12)' },
  composeAction: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(120, 204, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.18)' },
  optionsContainer: { flex: 1, minWidth: 0 },
  inputShell: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 14, backgroundColor: 'rgba(18, 33, 48, 0.96)', borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.22)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 0, boxShadow: '0 0 12px rgba(104, 215, 255, 0.16)' },
  input: { flex: 1, color: colors.white, fontSize: 14, height: 40, lineHeight: Platform.OS === 'web' ? (20 as any) : undefined, paddingVertical: 10, margin: 0, textAlignVertical: 'center' },
  optionsPanel: { backgroundColor: colors.navy800, borderRadius: 8, padding: 10, marginTop: 8, gap: 8 },
  optionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  colorOptions: { flexDirection: 'row', gap: 6 },
  colorButton: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  colorButtonActive: { borderColor: colors.white },
  fontOptions: { flexDirection: 'row', gap: 6 },
  fontButton: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.navy700, alignItems: 'center' },
  fontButtonActive: { backgroundColor: colors.blue },
  fontButtonText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(109, 245, 194, 0.7)' },
  voice: { backgroundColor: colors.blue },
  blank: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5, borderBottomColor: colors.neon },
  blankIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  blankTitle: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 18 },
  blankText: { color: colors.muted, fontSize: 13, marginTop: 7 },
  // CALL BUBBLE & CONTEXT MENU & FORMAT STYLES
  callMsgContainer: { alignSelf: 'center', marginVertical: 10, width: '100%', maxWidth: 360 },
  callMsgBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navy800, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  callMsgMissed: { borderColor: 'rgba(255,107,107,0.3)', backgroundColor: 'rgba(255,107,107,0.08)' },
  callMsgIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  callMsgIconMissed: { backgroundColor: colors.danger },
  callMsgTitle: { color: colors.white, fontSize: 13, fontWeight: '800' },
  callMsgSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  callMsgSubMissed: { color: colors.danger },
  callMsgTime: { color: colors.muted, fontSize: 10, marginLeft: 8 },
  systemRow: { alignSelf: 'center', alignItems: 'center', marginVertical: 6 },
  systemPill: { backgroundColor: 'rgba(12, 19, 30, 0.9)', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  systemText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  systemStamp: { color: colors.muted, fontSize: 10, marginTop: 4 },
  topPopMenu: { position: 'absolute', top: 60, right: 16, zIndex: 999999, elevation: 999999, backgroundColor: 'rgba(16, 28, 40, 1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 210, boxShadow: '0 12px 28px rgba(103, 211, 255, 0.32)', overflow: 'visible', pointerEvents: 'auto' } as any,
  popMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  popMenuText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  timerSection: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  timerTitle: { color: colors.muted, fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.6 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timerChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  timerChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  timerChipText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  timerChipTextActive: { color: colors.navy950 },
  emojiGrid: { position: 'relative', zIndex: 30, gap: 8, padding: 12, backgroundColor: 'rgba(19, 34, 53, 1)', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', boxShadow: '0 10px 18px rgba(103, 211, 255, 0.2)' },
  emojiGridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerSectionHeader: { marginTop: 4 },
  pickerSectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  emojiBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy700 },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickerBtn: { width: 62, height: 62, borderRadius: 14, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  stickerImage: { width: 56, height: 56 },
  attachmentMenu: { position: 'relative', zIndex: 30, flexDirection: 'column', gap: 4, padding: 8, backgroundColor: 'rgba(19, 34, 53, 1)', borderRadius: 12, marginBottom: 8, minWidth: 180, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', boxShadow: '0 10px 18px rgba(103, 211, 255, 0.2)' },
  attachOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.navy700 },
  attachOptionText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  expandedFormatPanel: { position: 'relative', zIndex: 30, backgroundColor: 'rgba(19, 34, 53, 1)', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', boxShadow: '0 10px 18px rgba(103, 211, 255, 0.2)' },
  formatSection: { gap: 6 },
  formatLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  colorChip: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  chipSelected: { borderColor: colors.white },
  fontRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fontChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.navy700 },
  fontChipActive: { backgroundColor: colors.blue },
  fontChipText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  recordingPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  chatRowMenuBtn: { padding: 6, marginLeft: 4, borderRadius: 8, backgroundColor: 'rgba(120, 204, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.16)' },
  rowContextMenu: { position: 'absolute', top: 40, right: 12, zIndex: 9999999, elevation: 9999999, backgroundColor: 'rgba(16, 28, 40, 1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 170, boxShadow: '0 12px 28px rgba(103, 211, 255, 0.34)', pointerEvents: 'auto', overflow: 'visible' } as any,
  ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  ctxText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  mobileHeader: { height: 56, paddingHorizontal: 12, gap: 8, zIndex: 1000, elevation: 1000, borderBottomWidth: 1, borderBottomColor: colors.border },
  mobileBackButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  mobilePersonInfo: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  mobileMenuButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  mobileTopMenu: { top: 52, right: 8, minWidth: 180 },
  mobileEmojiGrid: { paddingVertical: 8, maxHeight: 300, overflow: 'scroll' },
  mobileEmojiGridInner: { gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  mobileEmojiBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  mobileStickerGrid: { gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  mobileStickerBtn: { width: 64, height: 64, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mobileStickerImage: { width: 50, height: 50 },
  messageMenuButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 4 },
  messageActionMenu: { position: 'absolute', zIndex: 9999999, elevation: 9999999, backgroundColor: 'rgba(16, 28, 40, 1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 154, boxShadow: '0 12px 28px rgba(103, 211, 255, 0.34)', overflow: 'visible', pointerEvents: 'auto' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  actionIcon: { fontSize: 14 },
  reactionStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6, marginBottom: 2 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(122, 209, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(122, 209, 255, 0.25)' },
  reactionText: { fontSize: 11 },
  replySwipeAction: { width: 26, backgroundColor: 'transparent' },
  reactionCount: { color: colors.white, fontSize: 10, fontWeight: '700' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.navy800, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  replyContext: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  // PHOTO & VOICE NOTE STYLES
  photoThumbnail: { width: 240, height: 180, borderRadius: 8, marginTop: 2, marginBottom: 4 },
  videoBubbleContainer: { width: 260, maxWidth: '100%', maxHeight: 340, marginTop: 2, marginBottom: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: '#050D16', alignItems: 'center', justifyContent: 'center' },
  videoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 11, 20, 0.18)' },
  videoPlayBadge: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(109, 245, 194, 0.95)', alignItems: 'center', justifyContent: 'center' },
  videoDurationPill: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(3, 11, 20, 0.66)' },
  videoDurationText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  stickerImageOnly: { width: 132, height: 132, borderRadius: 0, backgroundColor: 'transparent' },
  photoCaption: { color: colors.white, fontSize: 12, marginTop: 4 },
  vnContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 250, paddingVertical: 4, backgroundColor: 'rgba(118, 215, 255, 0.08)', borderRadius: 16, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(118, 215, 255, 0.24)', boxShadow: '0 0 10px rgba(103, 211, 255, 0.18)' },
  vnPlayBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px rgba(76, 227, 160, 0.7)' },
  vnTrackArea: { flex: 1, justifyContent: 'center' },
  vnTrackBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, position: 'relative', justifyContent: 'center', overflow: 'visible' },
  vnTrackFill: { height: '100%', backgroundColor: 'linear-gradient(90deg, #8CE7FF 0%, #60F0C5 100%)' as any, borderRadius: 999 },
  vnKnob: { position: 'absolute', top: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.neon, marginLeft: -7 },
  vnTimeText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  vnSpeedPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  vnSpeedText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  // IMAGE MODAL STYLES
  imageModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', paddingTop: 72, paddingBottom: 96, paddingHorizontal: 20 },
  imageModalClose: { position: 'absolute', top: 20, right: 20, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  mediaModalFrame: { flex: 1, width: '100%', maxWidth: 980, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 14, overflow: 'hidden' },
  mediaModalContent: { width: '100%', maxWidth: '100%', maxHeight: '100%' },
  mediaModalImage: { width: '100%', height: '100%' },
  previewActionsRow: { position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' },
  previewDownloadButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(13, 22, 35, 0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  previewDownloadText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  profileModalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 16, 0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  profileModalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.navy900, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingTop: 24, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center', position: 'relative', alignSelf: 'center' },
  profileModalClose: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  profileModalName: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 18 },
  profileModalMacro: { color: colors.blue, fontSize: 13, fontWeight: '800', marginTop: 6 },
  profileModalMeta: { color: colors.muted, fontSize: 11, marginTop: 10 },
  forwardModalOverlay: { position: 'absolute', top: '50%', left: '50%', marginTop: -200, marginLeft: -180, width: 360, maxHeight: 400, borderRadius: 16, backgroundColor: colors.navy800, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', boxShadow: '0 12px 28px rgba(103, 211, 255, 0.34)', zIndex: 400000, elevation: 400000, overflow: 'hidden' },
  forwardModal: { flex: 1, flexDirection: 'column' },
  forwardModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  forwardModalTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  forwardChatList: { flex: 1, overflow: 'hidden' },
  forwardChatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  forwardChatInfo: { flex: 1 },
  forwardChatName: { color: colors.white, fontSize: 14, fontWeight: '700' },
  forwardChatPreview: { color: colors.muted, fontSize: 11, marginTop: 2 },
});