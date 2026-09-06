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
    el.srcObject = remoteStream as any;
    el.autoplay = true;
    if ('playsInline' in el) el.playsInline = true;
    if (remoteStream) {
      console.log('[CallMedia] Remote stream attached, size:', remoteStream.getTracks().length);
      void el.play().catch((error: any) => console.warn('Remote media play failed:', error?.message || error));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !localRef.current) return;
    const el = localRef.current as HTMLVideoElement;
    el.srcObject = localStream as any;
    el.autoplay = true;
    el.muted = true;
    el.playsInline = true;
    if (localStream) {
      console.log('[CallMedia] Local stream attached, size:', localStream.getTracks().length);
      void el.play().catch((error: any) => console.warn('Local video play failed:', error?.message || error));
    }
  }, [localStream]);

  if (Platform.OS !== 'web') return null;

  return (
    <View pointerEvents="none" style={styles.container}>
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
