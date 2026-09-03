import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Avatar } from '@/components/Avatar';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { Chat, Message } from '@/types';

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
    postMessageReaction,
    setChatDisappearingTimer,
    messageReactions,
  } = useApp();

  const [text, setText] = useState('');
  const [textColor, setTextColor] = useState<string>(colors.white);
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [fontFamily, setFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left?: number; right?: number; mine: boolean } | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);

  const list = useRef<FlatList<Message>>(null);
  const conversationRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messages = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  const activity = activityByChat[chat.id];

  useEffect(() => {
    markRead(chat.id);
  }, [chat.id, chat.messages.length, markRead]);

  useEffect(() => {
    if (!text.trim()) {
      sendChatActivity(chat.id, null);
      return;
    }
    sendChatActivity(chat.id, 'typing');
    const timeout = setTimeout(() => sendChatActivity(chat.id, null), 1500);
    return () => clearTimeout(timeout);
  }, [chat.id, sendChatActivity, text]);

  const closeAllPanels = () => {
    setShowEmojiPicker(false);
    setShowFormatPanel(false);
    setShowAttachmentMenu(false);
    setShowTopMenu(false);
    setActiveMessageMenu(null);
    setMenuAnchor(null);
    setForwardMessage(null);
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    sendMessage(chat.id, value, replyTarget?.id, { textColor, fontStyle, fontFamily });
    setText('');
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
        await sendMediaMessage(chat.id, {
          kind: isImage ? 'image' : 'file',
          uri: file.uri,
          fileName: file.name,
          mimeType: file.mimeType || (isImage ? 'image/png' : 'application/octet-stream'),
        });
        requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: false }));
      }
    } catch (err) {
      console.warn('File pick canceled or failed', err);
    }
  };

  const call = async (video: boolean) => {
    if (!signalingEnabled || !signalingReady) return;
    if (video) await startVideoCall(chat.id);
    else await startAudioCall(chat.id);
  };

  const timerOptions = [
    { label: 'Off', value: null },
    { label: '1 hour', value: 3600 },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
    { label: '30 days', value: 2592000 },
  ] as const;

  const handleMessageAction = async (messageKey: string, action: 'reply' | 'delete' | 'forward' | 'reaction', emoji?: string) => {
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
    <View ref={conversationRef} style={styles.conversation}>
      {(showTopMenu || showAttachmentMenu || showEmojiPicker || showFormatPanel || activeMessageMenu) && (
        <Pressable style={styles.dismissOverlay} onPress={closeAllPanels} />
      )}

      {/* HEADER */}
      <View style={styles.chatHeader}>
        <Avatar name={chat.name} color={chat.avatarColor} size={42} online={chat.online} imageUrl={chat.avatarUrl} />
        <View style={styles.person}>
          <Text style={styles.personName}>{chat.name}</Text>
          <Text style={[styles.presence, activity && styles.presenceActive]}>{activity ? `${activity.state}...` : chat.lastSeen}</Text>
        </View>
        <Pressable accessibilityLabel="Search messages" style={styles.headerAction}>
          <Ionicons name="search" size={20} color={colors.muted} />
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

      <View style={styles.encryption}>
        <Ionicons name="lock-closed" size={10} color={colors.neon} />
        <Text style={styles.encryptionText}>Messages are end-to-end encrypted</Text>
      </View>

      {/* MESSAGE LIST */}
      {replyTarget && (
        <View style={styles.replyBanner}>
          <View style={styles.replyContext}>
            <Ionicons name="return-down-forward-outline" size={14} color={colors.neon} />
            <Text style={styles.replyText} numberOfLines={1}>Replying to: {replyTargetText}</Text>
          </View>
          <Pressable onPress={() => setReplyTarget(null)}><Ionicons name="close" size={16} color={colors.muted} /></Pressable>
        </View>
      )}

      <FlatList
        ref={list}
        data={messages}
        inverted
        keyExtractor={(item) => item.clientId ?? item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          if (item.kind === 'call') {
            return <CallMessageBubble item={item} />;
          }

          const mine = item.senderId === 'me';
          const isImage = item.kind === 'image' || Boolean(
            item.mediaUrl?.startsWith('data:image/') ||
            item.mimeType?.startsWith('image/') ||
            item.fileName?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)
          );
          const isVoice = item.kind === 'voice';

          const isMenuOpen = activeMessageMenu === (item.clientId ?? item.id);

          const repliedMessage = item.replyTo ? chat.messages.find((message) => message.id === item.replyTo) : null;
          const reactionSummary = Array.from((messageReactions[item.id] ?? []).reduce((map, reaction) => {
            const count = map.get(reaction.emoji) ?? 0;
            map.set(reaction.emoji, count + 1);
            return map;
          }, new Map<string, number>())).map(([emoji, count]) => ({ emoji, count }));

          return (
            <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs, isMenuOpen && styles.bubbleActive]}>
                {item.replyTo && repliedMessage && (
                  <View style={styles.replyPreview}>
                    <Text style={styles.replyPreviewText} numberOfLines={1}>
                      {repliedMessage.senderId === 'me' ? 'You' : chat.name}: {repliedMessage.text || repliedMessage.fileName || (repliedMessage.kind === 'voice' ? 'Voice note' : repliedMessage.kind === 'image' ? 'Photo' : 'Message')}
                    </Text>
                  </View>
                )}
                {isVoice ? (
                  <VoiceNoteBubble item={item} />
                ) : isImage && (item.mediaUrl || item.mediaPath) ? (
                  <Pressable onPress={() => setPreviewImage(item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : null))}>
                    <Image source={{ uri: item.mediaUrl || (item.mediaPath?.startsWith('data:') ? item.mediaPath : undefined) }} style={styles.photoThumbnail} resizeMode="cover" />
                    {item.fileName ? <Text style={styles.photoCaption} numberOfLines={1}>{item.fileName}</Text> : null}
                  </Pressable>
                ) : item.kind && item.kind !== 'text' ? (
                  <View style={styles.attachment}>
                    <Ionicons name="document-outline" size={20} color={colors.blue} />
                    <Text style={styles.attachmentText}>{item.fileName || item.text || item.kind}</Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.messageText,
                      item.textColor ? { color: item.textColor } : null,
                      item.fontStyle ? { fontStyle: item.fontStyle } : null,
                      item.fontFamily ? { fontFamily: item.fontFamily as any } : null,
                    ]}
                  >
                    {item.text}
                  </Text>
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
                  {item.expiresAt && <Text style={styles.expiry}>◷ {expiryLabel(item.expiresAt)}</Text>}
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
          );
        }}
      />

      {/* FLOATING MESSAGE ACTION MENU (rendered outside the inverted list so it can never be clipped by a row's own stacking context) */}
      {activeMenuMessage && menuAnchor && (
        <View
          style={[
            styles.messageActionMenu,
            { top: menuAnchor.top },
            menuAnchor.mine ? { right: menuAnchor.right } : { left: menuAnchor.left },
          ]}
          pointerEvents="auto"
        >
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'reaction', '👍'); }}><Text style={styles.actionIcon}>👍</Text><Text style={styles.actionText}>React</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'reply'); }}><Ionicons name="return-down-forward-outline" size={14} color={colors.white} /><Text style={styles.actionText}>Reply</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'forward'); }}><Ionicons name="arrow-redo-outline" size={14} color={colors.white} /><Text style={styles.actionText}>Forward</Text></Pressable>
          <Pressable style={styles.actionRow} onPress={() => { void handleMessageAction(activeMenuMessage!.clientId ?? activeMenuMessage!.id, 'delete'); }}><Ionicons name="trash-outline" size={14} color={colors.danger} /><Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text></Pressable>
        </View>
      )}

      {/* IMAGE PREVIEW LIGHTBOX MODAL */}
      <Modal visible={Boolean(previewImage)} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.imageModalBackdrop}>
          <Pressable style={styles.imageModalClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color={colors.white} />
          </Pressable>
          {previewImage && (
            <Image source={{ uri: previewImage }} style={styles.imageModalContent} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* EMOJI PICKER POPUP */}
      {showEmojiPicker && (
        <View style={styles.emojiGrid}>
          {EMOJI_LIST.map((emoji) => (
            <Pressable
              key={emoji}
              style={styles.emojiBtn}
              onPress={() => {
                setText((prev) => prev + emoji);
              }}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </Pressable>
          ))}
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
      <View style={styles.composer}>
        <Pressable
          accessibilityLabel="Attach media"
          style={styles.composeAction}
          onPress={() => setShowAttachmentMenu(!showAttachmentMenu)}
        >
          <Ionicons name="add" size={26} color={showAttachmentMenu ? colors.neon : colors.blue} />
        </Pressable>

        <View style={styles.optionsContainer}>
          <View style={styles.inputShell}>
            <Pressable onPress={() => setShowEmojiPicker(!showEmojiPicker)} style={{ paddingRight: 6 }}>
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
  const { chats, profile, pinChat, muteChat, markChatUnread, clearChat, blockContact, deleteChat } = useApp();
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

  return (
    <View style={styles.desktop}>
      {activeContextMenu && <Pressable style={styles.sidebarDismissOverlay} onPress={() => setActiveContextMenu(null)} />}
      <View style={styles.rail}>
        <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
        <View style={styles.railNav}>
          <Pressable accessibilityLabel="Chats" style={[styles.railButton, styles.railActive]}><Ionicons name="chatbubble-ellipses" size={22} color={colors.neon} /></Pressable>
          <Pressable accessibilityLabel="Updates" style={styles.railButton} onPress={() => router.push('/updates')}><Ionicons name="radio-outline" size={22} color={colors.muted} /></Pressable>
          <Pressable accessibilityLabel="Calls" style={styles.railButton} onPress={() => router.push('/calls')}><Ionicons name="call-outline" size={21} color={colors.muted} /></Pressable>
          <Pressable accessibilityLabel="People" style={styles.railButton} onPress={() => router.push('/people')}><Ionicons name="people-outline" size={22} color={colors.muted} /></Pressable>
        </View>
        <Pressable accessibilityLabel="Settings" style={styles.railButton} onPress={() => router.push('/settings')}><Ionicons name="settings-outline" size={22} color={colors.muted} /></Pressable>
        <View style={styles.profileAvatar}><Avatar name={profile?.displayName || 'Macro'} color={profile?.avatarColor || colors.blue} size={34} online imageUrl={profile?.avatarUrl} /></View>
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
                    <Text style={styles.preview} numberOfLines={1}>
                      {last?.senderId === 'me' ? 'You: ' : ''}{last?.text ?? 'Start a private conversation'}
                    </Text>
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
                    <View style={styles.rowContextMenu} pointerEvents="auto">
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
  desktop: { position: 'relative', flex: 1, flexDirection: 'row', minWidth: 820, backgroundColor: colors.navy950 },
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
  chatRowMenuOpen: { zIndex: 300000, elevation: 300000 },
  chatCopy: { flex: 1, minWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 14, position: 'relative', zIndex: 1 },
  chatCopyMenuOpen: { zIndex: 300000, elevation: 300000 },
  chatLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatName: { color: colors.white, fontWeight: '800', fontSize: 14, flex: 1 },
  chatTime: { color: colors.muted, fontSize: 10 },
  unreadColor: { color: colors.neon },
  preview: { color: colors.muted, fontSize: 12, flex: 1, marginTop: 5 },
  badge: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  badgeText: { color: colors.navy950, fontSize: 9, fontWeight: '900' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
  identity: { height: 44, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.neon },
  identityText: { color: colors.muted, fontSize: 11, flex: 1 },
  conversation: { position: 'relative', flex: 1, minWidth: 0, backgroundColor: colors.navy950, overflow: 'visible' },
  dismissOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: 'transparent', pointerEvents: 'auto' },
  chatHeader: { position: 'relative', height: 68, backgroundColor: colors.navy900, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, zIndex: 20 },
  person: { flex: 1 },
  personName: { color: colors.white, fontWeight: '800', fontSize: 15 },
  presence: { color: colors.muted, fontSize: 10, marginTop: 2 },
  presenceActive: { color: colors.neon },
  headerAction: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  encryption: { position: 'absolute', top: 80, zIndex: 2, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 25, borderRadius: 5, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border },
  encryptionText: { color: colors.muted, fontSize: 9 },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: '8%', paddingTop: 52, paddingBottom: 18, gap: 5 },
  bubbleWrap: { maxWidth: '78%', position: 'relative', marginBottom: 6, zIndex: 12, elevation: 12, overflow: 'visible' },
  mineWrap: { alignSelf: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: 11, paddingTop: 7, paddingBottom: 5, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(125, 220, 255, 0.22)', backgroundColor: 'rgba(16, 53, 79, 0.82)', shadowColor: '#79E6FF', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, backdropFilter: 'blur(12px)' },
  bubbleActive: { shadowColor: '#79E6FF', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  mine: { backgroundColor: 'rgba(18, 61, 92, 0.88)', borderBottomRightRadius: 6 },
  theirs: { backgroundColor: 'rgba(22, 39, 57, 0.88)', borderBottomLeftRadius: 6 },
  messageText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  replyPreview: { paddingVertical: 4, marginBottom: 6, borderLeftWidth: 2, borderLeftColor: colors.neon, paddingLeft: 8 },
  replyPreviewText: { color: colors.neon, fontSize: 10, fontWeight: '700' },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  attachmentText: { color: colors.white, fontSize: 13, flexShrink: 1 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 1, marginTop: 2, letterSpacing: -1 },
  messageTime: { color: '#A9B9CB', fontSize: 8 },
  expiry: { color: colors.blue, fontSize: 8 },
  tick: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  readTick: { color: colors.blue },
  failedTick: { color: colors.danger },
  composer: { position: 'relative', zIndex: 12, minHeight: 66, backgroundColor: 'rgba(9, 20, 31, 0.96)', borderTopWidth: 1, borderTopColor: 'rgba(120, 204, 255, 0.16)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 9, shadowColor: '#67d3ff', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -8 } },
  composeAction: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(120, 204, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.18)' },
  optionsContainer: { flex: 1, minWidth: 0 },
  inputShell: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 14, backgroundColor: 'rgba(18, 33, 48, 0.96)', borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.22)', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 0, shadowColor: '#68d7ff', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
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
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', shadowColor: '#6DF5C2', shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
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
  topPopMenu: { position: 'absolute', top: 60, right: 16, zIndex: 300000, elevation: 300000, backgroundColor: 'rgba(16, 28, 40, 0.92)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 210, shadowColor: '#67d3ff', shadowOpacity: 0.32, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, overflow: 'visible', pointerEvents: 'auto' } as any,
  popMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  popMenuText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  timerSection: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  timerTitle: { color: colors.muted, fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.6 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timerChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  timerChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  timerChipText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  timerChipTextActive: { color: colors.navy950 },
  emojiGrid: { position: 'relative', zIndex: 30, flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, backgroundColor: 'rgba(19, 34, 53, 0.98)', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', shadowColor: '#67d3ff', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  emojiBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy700 },
  attachmentMenu: { position: 'relative', zIndex: 30, flexDirection: 'column', gap: 4, padding: 8, backgroundColor: 'rgba(19, 34, 53, 0.98)', borderRadius: 12, marginBottom: 8, minWidth: 180, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', shadowColor: '#67d3ff', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  attachOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.navy700 },
  attachOptionText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  expandedFormatPanel: { position: 'relative', zIndex: 30, backgroundColor: 'rgba(19, 34, 53, 0.98)', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: 'rgba(120, 204, 255, 0.2)', shadowColor: '#67d3ff', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
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
  rowContextMenu: { position: 'absolute', top: 40, right: 12, zIndex: 300000, elevation: 300000, backgroundColor: 'rgba(16, 28, 40, 0.94)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 170, shadowColor: '#67d3ff', shadowOpacity: 0.34, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, pointerEvents: 'auto', overflow: 'visible' } as any,
  ctxItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  ctxText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  messageMenuButton: { position: 'absolute', top: 8, right: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(10,16,26,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  messageActionMenu: { position: 'absolute', zIndex: 300000, elevation: 300000, backgroundColor: 'rgba(16, 28, 40, 0.94)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', paddingVertical: 8, minWidth: 154, shadowColor: '#67d3ff', shadowOpacity: 0.34, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, overflow: 'visible', pointerEvents: 'auto' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  actionIcon: { fontSize: 14 },
  reactionStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6, marginBottom: 2 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(122, 209, 255, 0.16)', borderWidth: 1, borderColor: 'rgba(122, 209, 255, 0.25)' },
  reactionText: { fontSize: 11 },
  reactionCount: { color: colors.white, fontSize: 10, fontWeight: '700' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.navy800, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  replyContext: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  // PHOTO & VOICE NOTE STYLES
  photoThumbnail: { width: 240, height: 180, borderRadius: 8, marginTop: 2, marginBottom: 4 },
  photoCaption: { color: colors.white, fontSize: 12, marginTop: 4 },
  vnContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 250, paddingVertical: 4, backgroundColor: 'rgba(118, 215, 255, 0.08)', borderRadius: 16, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(118, 215, 255, 0.24)', shadowColor: '#67d3ff', shadowOpacity: 0.18, shadowRadius: 10 },
  vnPlayBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', shadowColor: '#4CE3A0', shadowOpacity: 0.7, shadowRadius: 8 },
  vnTrackArea: { flex: 1, justifyContent: 'center' },
  vnTrackBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, position: 'relative', justifyContent: 'center', overflow: 'visible' },
  vnTrackFill: { height: '100%', backgroundColor: 'linear-gradient(90deg, #8CE7FF 0%, #60F0C5 100%)' as any, borderRadius: 999 },
  vnKnob: { position: 'absolute', top: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.neon, marginLeft: -7 },
  vnTimeText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  vnSpeedPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  vnSpeedText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  // IMAGE MODAL STYLES
  imageModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  imageModalClose: { position: 'absolute', top: 20, right: 20, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  imageModalContent: { width: '100%', height: '100%', maxWidth: 900, maxHeight: 700 },
  forwardModalOverlay: { position: 'absolute', top: '50%', left: '50%', marginTop: -200, marginLeft: -180, width: 360, maxHeight: 400, borderRadius: 16, backgroundColor: colors.navy800, borderWidth: 1, borderColor: 'rgba(122, 224, 255, 0.34)', shadowColor: '#67d3ff', shadowOpacity: 0.34, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, zIndex: 400000, elevation: 400000, overflow: 'hidden' },
  forwardModal: { flex: 1, flexDirection: 'column' },
  forwardModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  forwardModalTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  forwardChatList: { flex: 1, overflow: 'hidden' },
  forwardChatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  forwardChatInfo: { flex: 1 },
  forwardChatName: { color: colors.white, fontSize: 14, fontWeight: '700' },
  forwardChatPreview: { color: colors.muted, fontSize: 11, marginTop: 2 },
});