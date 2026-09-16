import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  video: boolean;
};

// Native audio calls play automatically through the device's audio session once tracks are
// attached - no view is needed. Native video needs react-native-webrtc's RTCView (not wired here).
export function CallMedia({ localStream, remoteStream, video }: Props) {
  const remoteRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !remoteRef.current) return;
    const el = remoteRef.current as HTMLAudioElement | HTMLVideoElement;
    console.log('[CallMedia] Attaching remote stream:', { hasStream: !!remoteStream, tracks: remoteStream?.getTracks().length || 0, tagName: el.tagName });
    el.srcObject = remoteStream as any;
    el.autoplay = true;
    if ('playsInline' in el) el.playsInline = true;
    if (remoteStream && remoteStream.getTracks().length > 0) {
      console.log('[CallMedia] Remote stream attached, calling play()');
      void el.play().catch((error: any) => console.warn('Remote media play failed:', error?.message || error));
    } else {
      console.warn('[CallMedia] Remote stream missing or has no tracks!', { hasStream: !!remoteStream, tracks: remoteStream?.getTracks().length });
    }
  }, [remoteStream]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !localRef.current) return;
    const el = localRef.current as HTMLVideoElement;
    console.log('[CallMedia] Attaching local stream:', { hasStream: !!localStream, tracks: localStream?.getTracks().length || 0 });
    el.srcObject = localStream as any;
    el.autoplay = true;
    el.muted = true;
    el.playsInline = true;
    if (localStream && localStream.getTracks().length > 0) {
      console.log('[CallMedia] Local stream attached, calling play()');
      void el.play().catch((error: any) => console.warn('Local video play failed:', error?.message || error));
    } else {
      console.warn('[CallMedia] Local stream missing or has no tracks!', { hasStream: !!localStream, tracks: localStream?.getTracks().length });
    }
  }, [localStream]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={[styles.container, { pointerEvents: 'none' }]}>
      {video ? (
        <>
          <video ref={remoteRef as any} style={styles.remoteVideo as any} />
          <video ref={localRef} style={styles.localVideo as any} />
        </>
      ) : (
        <audio ref={remoteRef as any} autoPlay muted={false} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, width: '100%', height: '100%', overflow: 'hidden' },
  remoteVideo: { width: '100%', height: '100%', backgroundColor: '#000', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 10, display: 'block' } as any,
  localVideo: { width: 140, height: 180, borderRadius: 12, backgroundColor: '#000', position: 'absolute', bottom: 100, right: 20, objectFit: 'cover', zIndex: 20, border: '3px solid #55B9FF', display: 'block' } as any,
});
