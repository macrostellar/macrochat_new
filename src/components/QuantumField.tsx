import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';

const PARTICLES = [
  { x: 8, y: 12, size: 3, drift: 14, delay: 0 },
  { x: 18, y: 26, size: 2, drift: 18, delay: 200 },
  { x: 30, y: 14, size: 2, drift: 12, delay: 400 },
  { x: 42, y: 30, size: 3, drift: 20, delay: 600 },
  { x: 56, y: 18, size: 2, drift: 16, delay: 800 },
  { x: 68, y: 24, size: 4, drift: 14, delay: 1000 },
  { x: 80, y: 11, size: 2, drift: 13, delay: 1200 },
  { x: 90, y: 27, size: 3, drift: 19, delay: 1400 },
  { x: 14, y: 52, size: 3, drift: 17, delay: 320 },
  { x: 24, y: 66, size: 2, drift: 14, delay: 520 },
  { x: 38, y: 58, size: 2, drift: 21, delay: 720 },
  { x: 51, y: 72, size: 4, drift: 15, delay: 920 },
  { x: 64, y: 61, size: 3, drift: 18, delay: 1120 },
  { x: 76, y: 70, size: 2, drift: 13, delay: 1320 },
  { x: 86, y: 56, size: 3, drift: 16, delay: 1520 },
];

export function QuantumField() {
  const drift = useRef(new Animated.Value(0)).current;
  const particles = useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const driftLoop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));

    const particleLoops = particles.map((value, index) => Animated.loop(Animated.sequence([
      Animated.delay(PARTICLES[index].delay),
      Animated.timing(value, { toValue: 1, duration: 3800 + index * 70, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: 3800 + index * 70, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));

    driftLoop.start();
    particleLoops.forEach((loop) => loop.start());

    return () => {
      driftLoop.stop();
      particleLoops.forEach((loop) => loop.stop());
    };
  }, [drift, particles]);

  const driftStyle = {
    transform: [{
      translateY: drift.interpolate({
        inputRange: [0, 1],
        outputRange: [-12, 12],
      }),
    }],
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.baseGradient} />
      <Animated.View style={[styles.scanline, driftStyle]} />
      {particles.map((value, index) => {
        const particle = PARTICLES[index];
        return (
          <Animated.View
            key={`particle-${index}`}
            style={[
              styles.particle,
              {
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: particle.size,
                height: particle.size,
                borderRadius: particle.size / 2,
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
                transform: [
                  {
                    translateY: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -particle.drift],
                    }),
                  },
                  {
                    translateX: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, (index % 2 === 0 ? 6 : -6)],
                    }),
                  },
                  {
                    scale: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1.25],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
      <View style={styles.grid} />
    </View>
  );
}

const styles = StyleSheet.create({
  baseGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.navy950,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    borderTopWidth: 1,
    borderColor: colors.blue,
  },
  particle: {
    position: 'absolute',
    backgroundColor: colors.blue,
    shadowColor: colors.neon,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 58,
    backgroundColor: 'rgba(60, 142, 208, 0.05)',
    top: '40%',
  },
});
