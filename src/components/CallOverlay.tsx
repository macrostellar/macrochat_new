import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { CallMedia } from '@/components/CallMedia';
import { useApp } from '@/context/AppContext';
import { startRingtone, stopRingtone } from '@/lib/sound';
import { colors } from '@/theme/colors';

function formatDuration(startedAt: number, now: number) {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Mounted once at the app root so an active call stays visible and audible on every screen.
export function CallOverlay() {
  const {
    chats,
    activeCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endActiveCall,
    localCallStream,
    remoteCallStream,
    callStartedAt,
    mediaConnected,
  } = useApp();

  const [now, setNow] = useState(() => Date.now());
  const [callMode, setCallMode] = useState<'fullscreen' | 'floating'>('fullscreen');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const isIncomingRinging = Boolean(activeCall?.incoming && activeCall.status === 'ringing');

  useEffect(() => {
    if (!callStartedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callStartedAt]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isIncomingRinging) startRingtone(); else stopRingtone();
    return () => stopRingtone();
  }, [isIncomingRinging]);

  if (!activeCall) return null;

  const contact = chats.find((chat) => chat.participantUserId === activeCall.peerUserId);
  const name = contact?.name || 'Contact';
  const avatarColor = contact?.avatarColor || colors.blue;

  const toggleMute = () => {
    if (localCallStream) {
      localCallStream.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localCallStream) {
      localCallStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const isConnected = activeCall.status === 'connected' || mediaConnected || Boolean(callStartedAt);

  const statusText = isIncomingRinging
    ? `Incoming ${activeCall.video ? 'video' : 'audio'} call...`
    : isConnected
      ? formatDuration(callStartedAt || now, now)
      : activeCall.incoming ? 'Connecting...' : activeCall.status === 'dialing' ? 'Calling...' : 'Ringing...';

  // FLOATING MODE
  if (callMode === 'floating') {
    return (
      <View style={styles.floatingContainer} pointerEvents="box-none">
        <View style={styles.floatingWindow}>
          <View style={styles.floatingHeader}>
            <Avatar name={name} color={avatarColor} size={32} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.floatingName} numberOfLines={1}>{name}</Text>
              <Text style={styles.floatingStatus}>{statusText}</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => setCallMode('fullscreen')}>
              <Ionicons name="expand-outline" size={18} color={colors.white} />
            </Pressable>
            <Pressable style={[styles.iconBtn, styles.dangerBg]} onPress={endActiveCall}>
              <Ionicons name="close" size={18} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.floatingVideoArea}>
            {activeCall.video && !isVideoOff ? (
              <CallMedia localStream={localCallStream} remoteStream={remoteCallStream} video={true} />
            ) : (
              <View style={styles.floatingAvatarArea}>
                <Avatar name={name} color={avatarColor} size={64} />
              </View>
            )}
          </View>

          <View style={styles.floatingControls}>
            {isIncomingRinging && (
              <Pressable style={[styles.controlBtnSmall, styles.successBg]} onPress={acceptIncomingCall}>
                <Ionicons name="call" size={18} color={colors.black} />
              </Pressable>
            )}
            <Pressable style={[styles.controlBtnSmall, isMuted && styles.activeMuteBg]} onPress={toggleMute}>
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={18} color={colors.white} />
            </Pressable>
            {activeCall.video && (
              <Pressable style={[styles.controlBtnSmall, isVideoOff && styles.activeMuteBg]} onPress={toggleVideo}>
                <Ionicons name={isVideoOff ? 'videocam-off' : 'videocam'} size={18} color={colors.white} />
              </Pressable>
            )}
            <Pressable style={[styles.controlBtnSmall, styles.dangerBg]} onPress={isIncomingRinging ? rejectIncomingCall : endActiveCall}>
              <Ionicons name="call" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // FULLSCREEN WHATSAPP CALL MODE
  return (
    <View style={styles.fullscreenOverlay}>
      {/* Video / Audio Stage */}
      {activeCall.video && !isVideoOff ? (
        <View style={styles.videoStage}>
          <CallMedia localStream={localCallStream} remoteStream={remoteCallStream} video={true} />
        </View>
      ) : (
        <View style={styles.audioStage}>
          <View style={styles.avatarGlowContainer}>
            <Avatar name={name} color={avatarColor} size={110} />
          </View>
          <Text style={styles.audioName}>{name}</Text>
          <Text style={styles.audioStatus}>{statusText}</Text>
        </View>
      )}

      {/* Top Header Overlay */}
      <View style={styles.headerOverlay} pointerEvents="box-none">
        <View style={styles.headerContent}>
          <Avatar name={name} color={avatarColor} size={42} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerName}>{name}</Text>
            <Text style={styles.headerStatus}>{activeCall.video ? '📹 Video call' : '📞 Audio call'} · {statusText}</Text>
          </View>
          <Pressable style={styles.iconBtnLarge} onPress={() => setCallMode('floating')}>
            <Ionicons name="contract-outline" size={22} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {/* Bottom Controls Overlay */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.controlsBar}>
          {isIncomingRinging && (
            <Pressable style={[styles.controlBtnLarge, styles.successBg]} onPress={acceptIncomingCall}>
              <Ionicons name="call" size={26} color={colors.black} />
            </Pressable>
          )}

          <Pressable style={[styles.controlBtnLarge, isMuted ? styles.dangerBg : styles.translucentBg]} onPress={toggleMute}>
            <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color={colors.white} />
          </Pressable>

          {activeCall.video && (
            <Pressable style={[styles.controlBtnLarge, isVideoOff ? styles.dangerBg : styles.translucentBg]} onPress={toggleVideo}>
              <Ionicons name={isVideoOff ? 'videocam-off' : 'videocam'} size={24} color={colors.white} />
            </Pressable>
          )}

          <Pressable style={[styles.controlBtnLarge, styles.translucentBg]}>
            <Ionicons name="volume-high" size={24} color={colors.white} />
          </Pressable>

          <Pressable style={[styles.controlBtnLarge, styles.dangerBg]} onPress={isIncomingRinging ? rejectIncomingCall : endActiveCall}>
            <Ionicons name="call" size={26} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    backgroundColor: '#0B141A',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  videoStage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  audioStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B141A',
  },
  avatarGlowContainer: {
    padding: 16,
    borderRadius: 80,
    backgroundColor: 'rgba(85,185,255,0.1)',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(85,185,255,0.3)',
  },
  audioName: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 10,
  },
  audioStatus: {
    color: colors.neon,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 20, 26, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerName: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  headerStatus: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  iconBtnLarge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(11, 20, 26, 0.85)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  controlBtnLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translucentBg: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dangerBg: {
    backgroundColor: colors.danger,
  },
  successBg: {
    backgroundColor: colors.neon,
  },
  activeMuteBg: {
    backgroundColor: colors.danger,
  },
  // Floating Styles
  floatingContainer: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    bottom: 24,
    right: 24,
    zIndex: 99999,
  },
  floatingWindow: {
    width: 280,
    height: 420,
    borderRadius: 16,
    backgroundColor: '#0B141A',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.navy800,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  floatingName: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  floatingStatus: {
    color: colors.muted,
    fontSize: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  floatingVideoArea: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  floatingAvatarArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B141A',
  },
  floatingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    backgroundColor: colors.navy800,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  controlBtnSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
