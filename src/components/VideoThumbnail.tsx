import { useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

type Meta = { ratio?: number; durationMs?: number };

// A paused <video> never decodes a frame, so seek once loaded to paint a real poster.
export function VideoThumbnail({ uri, onMeta }: { uri: string; onMeta: (meta: Meta) => void }) {
  const videoRef = useRef<Video>(null);

  return (
    <Video
      ref={videoRef}
      source={{ uri: Platform.OS === 'web' ? `${uri}#t=0.1` : uri }}
      style={StyleSheet.absoluteFill}
      resizeMode={ResizeMode.CONTAIN}
      isMuted
      shouldPlay={false}
      onLoad={(status) => {
        if (status.isLoaded && status.durationMillis) onMeta({ durationMs: status.durationMillis });
        videoRef.current?.setPositionAsync(120).catch(() => undefined);
      }}
      onReadyForDisplay={(event) => {
        const width = event.naturalSize?.width || 0;
        const height = event.naturalSize?.height || 0;
        if (width > 0 && height > 0) onMeta({ ratio: width / height });
      }}
    />
  );
}

// Return actual video ratio without clamping - show videos in their TRUE original aspect ratio
export function clampVideoRatio(ratio?: number) {
  if (!ratio || !Number.isFinite(ratio)) return 16 / 9;
  // No clamping - return actual ratio so portrait, landscape, and square videos display correctly
  return ratio;
}
