import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { Avatar } from '@/components/Avatar';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { Message } from '@/types';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function ticks(message: Message) {
  if (message.status === 'sending') return '◷';
  if (message.status === 'failed') return '!';
  if (message.status === 'sent') return '✓';
  return '✓✓';
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const chatId = Array.isArray(id) ? id[0] : id;
  const { profile, loading, chats, activityByChat, sendMessage, sendMediaMessage, sendChatActivity, markRead, refreshChats, signalingEnabled, signalingReady, activeCall, startAudioCall, startVideoCall, acceptIncomingCall, rejectIncomingCall, endActiveCall } = useApp();
  const chat = chats.find((item) => item.id === chatId);

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

  const list = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
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
  }, [chat, recording, webRecording, text, sendChatActivity]);

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
    kind: 'image' | 'file' | 'voice';
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
  }) => {
    pendingSendScroll.current = true;
    await sendMediaMessage(chat.id, {
      ...input,
      replyTo: reply?.id,
    });
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
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.type === 'video') {
      Alert.alert('Video upload', 'Video upload UI is next. For now, use image or document.');
      return;
    }
    await sendAttachment({
      kind: 'image',
      uri: asset.uri,
      fileName: asset.fileName || 'photo.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
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
    await sendAttachment({
      kind: 'file',
      uri: asset.uri,
      fileName: asset.name || 'Attachment',
      mimeType: asset.mimeType || 'application/octet-stream',
    });
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
          const uri = URL.createObjectURL(blob);
          const duration = recordingSince ? Date.now() - recordingSince : 0;
          stream.getTracks().forEach((track) => track.stop());
          sendAttachment({
            kind: 'voice',
            uri,
            fileName: `voice-${Date.now()}.webm`,
            mimeType: blob.type || 'audio/webm',
            durationMs: duration,
          }).catch(() => Alert.alert('Voice note failed', 'Unable to send recorded voice note.'));
          webRecorder.current = null;
          setWebRecording(false);
          setRecordingSince(null);
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
    pendingSendScroll.current = true;
    sendMessage(chat.id, payload, reply?.id);
    setText('');
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
    <SafeAreaView style={styles.page} edges={['top']}>
    <KeyboardAvoidingView style={styles.pageInner} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={27} color={colors.white} /></Pressable>
        <Avatar name={chat.name} color={chat.avatarColor} size={40} online={chat.online} />
        <View style={styles.person}><Text style={styles.name}>{chat.name}</Text><Text style={[styles.presence, chat.online && { color: colors.neon }, remoteActivity && styles.presenceActive]}>{remoteActivity ? (remoteActivity.state === 'recording' ? 'recording voice note...' : 'typing...') : chat.lastSeen}</Text></View>
        <Pressable style={styles.action} onPress={() => router.push('/camera')}><Ionicons name="camera-outline" size={22} color={colors.blue} /></Pressable>
        <Pressable style={styles.action} onPress={() => startCall(true)}><Ionicons name="videocam-outline" size={22} color={colors.blue} /></Pressable>
        <Pressable style={styles.action} onPress={() => startCall(false)}><Ionicons name="call-outline" size={21} color={colors.blue} /></Pressable>
      </View>
      <View style={styles.encryption}><Ionicons name="lock-closed" size={11} color={colors.neon} /><Text style={styles.encryptionText}>Messages are designed for end-to-end encryption</Text></View>
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
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        renderItem={({ item }) => {
          const mine = item.senderId === 'me';
          const replied = item.replyTo ? chat.messages.find((message) => message.id === item.replyTo) : null;
          const voicePayload = item.kind === 'voice' && item.mediaUrl ? { uri: item.mediaUrl, durationMs: item.durationMs || 0 } : null;
          const imagePayload = item.kind === 'image' && item.mediaUrl ? { uri: item.mediaUrl, name: item.fileName || 'Image' } : null;
          const filePayload = item.kind === 'file' ? { name: item.fileName || item.text } : null;
          const isPlaying = activeVoiceId === item.id;
          const playbackDuration = voicePayload ? Math.max(activeVoiceProgress.duration || voicePayload.durationMs || 1, 1) : 1;
          const playbackPosition = voicePayload && isPlaying ? activeVoiceProgress.position : 0;
          const playbackPct = voicePayload ? Math.max(0, Math.min(playbackPosition / playbackDuration, 1)) : 0;
          const voiceLabel = voicePayload ? formatDuration(voicePayload.durationMs) : '';

          return (
            <Pressable onLongPress={() => setReply(item)} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {replied && <View style={styles.reply}><Text numberOfLines={1} style={styles.replyText}>{replied.text}</Text></View>}
              {item.encrypted && <View style={styles.encryptedTag}><Ionicons name="lock-closed" color={colors.neon} size={10} /><Text style={styles.encryptedText}>Encrypted</Text></View>}
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
                <View>
                  <Image source={{ uri: imagePayload.uri }} style={styles.imageBubble} resizeMode="cover" />
                  <Text style={styles.imageCaption} numberOfLines={1}>{imagePayload.name}</Text>
                </View>
              ) : filePayload ? (
                <View style={styles.attachWrap}>
                  <Ionicons name="document-outline" color={colors.blue} size={18} />
                  <Text style={styles.attachText} numberOfLines={1}>{filePayload.name}</Text>
                </View>
              ) : (
                <Text style={styles.messageText}>{item.text}</Text>
              )}
              <View style={styles.meta}><Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>{mine && <Text style={[styles.tick, item.status === 'read' && { color: colors.blue }, item.status === 'failed' && { color: colors.danger }]}>{ticks(item)}</Text>}</View>
              {item.reaction && <View style={styles.reaction}><Text>{item.reaction}</Text></View>}
            </Pressable>
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
      <View style={[styles.composer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 0 }]}>
        <Pressable style={styles.composeButton} onPress={openAttachmentMenu}><Ionicons name="add" size={26} color={colors.blue} /></Pressable>
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
          <Pressable><Ionicons name="happy-outline" size={23} color={colors.muted} /></Pressable>
        </View>
        <Pressable style={[styles.send, recording && styles.sendRecording]} onPress={onPrimaryAction}><Ionicons name={text.trim() ? 'send' : (recording ? 'stop' : 'mic')} size={21} color={colors.navy950} /></Pressable>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy950 },
  pageInner: { flex: 1 },
  missing: { color: colors.white, margin: 30, textAlign: 'center' },
  retry: { alignSelf: 'center', marginTop: 8, borderRadius: 12, backgroundColor: colors.blue, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: colors.navy950, fontWeight: '800', fontSize: 13 },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 9, backgroundColor: colors.navy900, borderBottomWidth: 1, borderBottomColor: colors.border }, back: { padding: 5 }, person: { flex: 1 }, name: { color: colors.white, fontSize: 16, fontWeight: '800' }, presence: { color: colors.muted, fontSize: 11, marginTop: 2 }, presenceActive: { color: colors.neon }, action: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  encryption: { alignSelf: 'center', flexDirection: 'row', gap: 5, marginTop: 10, backgroundColor: colors.navy800, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }, encryptionText: { color: colors.muted, fontSize: 10 },
  callBanner: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, padding: 10 },
  callBannerText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  callBannerActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  callAccept: { minWidth: 88, height: 32, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  callReject: { minWidth: 88, height: 32, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  callActionText: { color: colors.black, fontWeight: '800', fontSize: 12 },
  messagesList: { flex: 1 },
  messages: { padding: 14, paddingTop: 20, gap: 8 }, bubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6 }, mine: { alignSelf: 'flex-end', backgroundColor: '#164B6D', borderBottomRightRadius: 4 }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.navy800, borderBottomLeftRadius: 4 }, messageText: { color: colors.white, fontSize: 15, lineHeight: 21 }, meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }, time: { color: '#A9B9CB', fontSize: 9 }, tick: { color: colors.muted, fontSize: 11, fontWeight: '800' }, reply: { borderLeftWidth: 3, borderLeftColor: colors.neon, paddingLeft: 8, paddingVertical: 5, marginBottom: 6, backgroundColor: colors.overlay, borderRadius: 5 }, replyText: { color: colors.muted, fontSize: 12 }, reaction: { position: 'absolute', bottom: -14, right: 8, backgroundColor: colors.navy700, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
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
  imageBubble: { width: 220, height: 150, borderRadius: 12, backgroundColor: colors.navy700 },
  imageCaption: { color: colors.muted, fontSize: 11, marginTop: 5 },
  attachWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 230 },
  attachText: { color: colors.white, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  replying: { marginHorizontal: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.blue, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center' }, replyTitle: { color: colors.blue, fontWeight: '800', fontSize: 11 }, replyPreview: { color: colors.muted, fontSize: 12, marginTop: 2 },
  recordingBanner: { marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, paddingHorizontal: 12, height: 38, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  recordingText: { color: colors.white, flex: 1, fontWeight: '700', fontSize: 12 },
  recordingStop: { color: colors.danger, fontWeight: '900', fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 10, paddingHorizontal: 10, gap: 8, backgroundColor: colors.navy900 }, composeButton: { width: 38, height: 48, alignItems: 'center', justifyContent: 'center' }, inputWrap: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 24, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 8 }, inputWrapFocus: { borderColor: colors.neon }, input: { flex: 1, color: colors.white, fontSize: 15, paddingVertical: 12 }, send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }, sendRecording: { backgroundColor: colors.danger },
});
