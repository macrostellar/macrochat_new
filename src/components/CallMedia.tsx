import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

// react-native-web passes unrecognized lowercase tags straight through to ReactDOM.
const VideoTag: any = 'video';
const AudioTag: any = 'audio';

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  video: boolean;
};

// Native audio calls play automatically through the device's audio session once tracks are
// attached - no view is needed. Native video needs react-native-webrtc's RTCView (not wired here).
export function CallMedia({ localStream, remoteStream, video }: Props) {
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !remoteRef.current) return;
    const el = remoteRef.current as any;
    el.srcObject = remoteStream;
    el.autoplay = true;
    el.playsinline = true;
    if (remoteStream) {
      console.log('[CallMedia] Remote stream attached, size:', remoteStream.getTracks().length);
      el.play().catch((error: any) => console.warn('Remote video play failed:', error.message));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !localRef.current) return;
    const el = localRef.current as any;
    el.srcObject = localStream;
    el.autoplay = true;
    el.muted = true;
    el.playsinline = true;
    if (localStream) {
      console.log('[CallMedia] Local stream attached, size:', localStream.getTracks().length);
      el.play().catch((error: any) => console.warn('Local video play failed:', error.message));
    }
  }, [localStream]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.container}>
      {video ? (
        <>
          <video ref={remoteRef} style={styles.remoteVideo as any} />
          <video ref={localRef} style={styles.localVideo as any} />
        </>
      ) : (
        <audio ref={remoteRef} autoPlay playsInline />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, width: '100%', height: '100%', overflow: 'hidden' },
  remoteVideo: { width: '100%', height: '100%', backgroundColor: '#000', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 10, display: 'block' } as any,
  localVideo: { width: 140, height: 180, borderRadius: 12, backgroundColor: '#000', position: 'absolute', bottom: 100, right: 20, objectFit: 'cover', zIndex: 20, border: '3px solid #55B9FF', display: 'block' } as any,
});
