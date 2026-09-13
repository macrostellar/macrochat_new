import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

const STYLE_ID = 'macrochat-ambient-quantum';

// CSS keyframes run on the compositor, so the drift stays smooth without
// occupying the JS thread the way an Animated loop would.
const CSS = `
@keyframes mcQuantumA {
  0%   { transform: translate3d(-6%, -4%, 0) scale(1);    opacity: 0.22; }
  50%  { transform: translate3d(12%, 8%, 0) scale(1.2);  opacity: 0.45; }
  100% { transform: translate3d(-6%, -4%, 0) scale(1);    opacity: 0.22; }
}
@keyframes mcQuantumB {
  0%   { transform: translate3d(8%, 10%, 0) scale(1.15);  opacity: 0.18; }
  50%  { transform: translate3d(-12%, -8%, 0) scale(1);   opacity: 0.36; }
  100% { transform: translate3d(8%, 10%, 0) scale(1.15);  opacity: 0.18; }
}
@keyframes mcQuantumC {
  0%   { transform: translate3d(-4%, 12%, 0) scale(1.08); opacity: 0.14; }
  50%  { transform: translate3d(10%, -10%, 0) scale(1.3); opacity: 0.3; }
  100% { transform: translate3d(-4%, 12%, 0) scale(1.08); opacity: 0.14; }
}
@keyframes mcQuantumSweep {
  0%   { transform: rotate(0deg); opacity: 0.06; }
  50%  { opacity: 0.11; }
  100% { transform: rotate(360deg); opacity: 0.06; }
}
@keyframes mcStarDrift {
  0%   { transform: translate3d(0, 0, 0) scale(0.8); opacity: 0.15; }
  30%  { opacity: 0.9; }
  50%  { transform: translate3d(8px, -10px, 0) scale(1.2); opacity: 0.7; }
  100% { transform: translate3d(0, 0, 0) scale(0.8); opacity: 0.15; }
}
@media (prefers-reduced-motion: reduce) {
  .mc-quantum-layer, .mc-quantum-sweep, .mc-star-particle { animation: none !important; }
}
`;

const LAYERS: React.CSSProperties[] = [
  {
    top: '-22%',
    left: '-18%',
    width: '75%',
    height: '75%',
    background: 'radial-gradient(circle, rgba(74, 138, 255, 0.46) 0%, rgba(8, 14, 22, 0) 68%)',
    animation: 'mcQuantumA 16s ease-in-out infinite',
  },
  {
    top: '18%',
    right: '-24%',
    width: '80%',
    height: '80%',
    background: 'radial-gradient(circle, rgba(61, 92, 163, 0.4) 0%, rgba(8, 14, 22, 0) 68%)',
    animation: 'mcQuantumB 18s ease-in-out infinite',
  },
  {
    bottom: '-26%',
    left: '22%',
    width: '70%',
    height: '70%',
    background: 'radial-gradient(circle, rgba(120, 158, 255, 0.22) 0%, rgba(8, 14, 22, 0) 68%)',
    animation: 'mcQuantumC 24s ease-in-out infinite',
  },
];

const STARS: React.CSSProperties[] = [
  { top: '10%', left: '18%', width: 2, height: 2, animation: 'mcStarDrift 13s ease-in-out infinite' },
  { top: '20%', left: '71%', width: 3, height: 3, animation: 'mcStarDrift 16s ease-in-out infinite 1.2s' },
  { top: '32%', left: '44%', width: 2, height: 2, animation: 'mcStarDrift 14s ease-in-out infinite 2.4s' },
  { top: '48%', left: '84%', width: 2, height: 2, animation: 'mcStarDrift 18s ease-in-out infinite 0.8s' },
  { top: '62%', left: '28%', width: 3, height: 3, animation: 'mcStarDrift 17s ease-in-out infinite 2.9s' },
  { top: '76%', left: '58%', width: 2, height: 2, animation: 'mcStarDrift 12s ease-in-out infinite 3.4s' },
  { top: '84%', left: '84%', width: 2, height: 2, animation: 'mcStarDrift 15s ease-in-out infinite 1.6s' },
  { top: '14%', left: '54%', width: 1.5, height: 1.5, animation: 'mcStarDrift 20s ease-in-out infinite 2.7s' },
  { top: '42%', left: '12%', width: 2, height: 2, animation: 'mcStarDrift 19s ease-in-out infinite 0.5s' },
  { top: '68%', left: '76%', width: 1.5, height: 1.5, animation: 'mcStarDrift 21s ease-in-out infinite 1.1s' },
  { top: '90%', left: '42%', width: 2, height: 2, animation: 'mcStarDrift 11s ease-in-out infinite 2.2s' },
];

function WebField() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {LAYERS.map((layer, index) => (
        <div
          key={index}
          className="mc-quantum-layer"
          style={{
            position: 'absolute',
            borderRadius: '50%',
            filter: 'blur(80px)',
            willChange: 'transform, opacity',
            ...layer,
          }}
        />
      ))}
      {STARS.map((star, index) => (
        <div
          key={`star-${index}`}
          className="mc-star-particle"
          style={{
            position: 'absolute',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 8px rgba(255,255,255,0.45)',
            opacity: 0.6,
            ...star,
          }}
        />
      ))}
      <div
        className="mc-quantum-sweep"
        style={{
          position: 'absolute',
          top: '-60%',
          left: '-60%',
          width: '220%',
          height: '220%',
          opacity: 0.06,
          willChange: 'transform',
          background:
            'conic-gradient(from 0deg, rgba(98, 150, 255, 0) 0deg, rgba(120, 171, 255, 0.15) 90deg, rgba(32, 48, 88, 0) 200deg, rgba(255,255,255,0.08) 300deg, rgba(98, 150, 255, 0) 360deg)',
          animation: 'mcQuantumSweep 48s linear infinite',
        }}
      />
    </div>
  );
}

function NativeField() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const layer = (style: object, from: number[], to: number[]) => (
    <Animated.View
      style={[
        styles.blob,
        style,
        {
          opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] }),
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [from[0], to[0]] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [from[1], to[1]] }) },
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) },
          ],
        },
      ]}
    />
  );

  return (
    <View style={styles.nativeRoot}>
      {layer(styles.blobA, [-30, -20], [60, 50])}
      {layer(styles.blobB, [40, 30], [-50, -40])}
      {layer(styles.blobC, [-20, 40], [50, -50])}
    </View>
  );
}

/** Slow ambient gradient field rendered behind chat content. */
export function AmbientQuantumField() {
  return Platform.OS === 'web' ? <WebField /> : <NativeField />;
}

const styles = StyleSheet.create({
  nativeRoot: { ...StyleSheet.absoluteFillObject, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' },
  blob: { position: 'absolute', width: 420, height: 420, borderRadius: 210, filter: 'blur(60px)' },
  blobA: { top: -80, left: -90, backgroundColor: 'rgba(72, 122, 255, 0.22)' },
  blobB: { top: 200, right: -110, backgroundColor: 'rgba(44, 96, 178, 0.18)' },
  blobC: { bottom: -60, left: 90, backgroundColor: 'rgba(161, 184, 255, 0.12)' },
});
