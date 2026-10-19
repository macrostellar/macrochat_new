import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Meta = { ratio?: number; durationMs?: number };

// A paused video never decodes a frame, so seek once loaded to paint a real poster.
export function VideoThumbnail({ uri, onMeta }: { uri: string; onMeta: (meta: Meta) => void }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.muted = true;
    instance.pause();
  });

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'readyToPlay') return;
      if (player.duration) onMeta({ durationMs: player.duration * 1000 });
      player.currentTime = 0.12;
    });
    const sourceSub = player.addListener('sourceLoad', ({ videoSource }) => {
      const width = videoSource?.naturalSize?.width ?? 0;
      const height = videoSource?.naturalSize?.height ?? 0;
      if (width > 0 && height > 0) onMeta({ ratio: width / height });
    });
    return () => {
      statusSub.remove();
      sourceSub.remove();
    };
  }, [player, onMeta]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

/** Full-screen/preview playback surface with native transport controls. */
export function VideoPreviewPlayer({
  uri,
  style,
  autoPlay = false,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
}) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    if (autoPlay) instance.play();
  });

  return <VideoView player={player} style={style} contentFit="contain" nativeControls allowsFullscreen />;
}

// Return actual video ratio without clamping - show videos in their TRUE original aspect ratio
export function clampVideoRatio(ratio?: number) {
  if (!ratio || !Number.isFinite(ratio)) return 16 / 9;
  // No clamping - return actual ratio so portrait, landscape, and square videos display correctly
  return ratio;
}
