import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '@/theme/colors';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

type Props = {
  expiresAt: string;
  createdAt: string;
  radius?: number;
  strokeWidth?: number;
};

/** Animated glowing line that travels around all four borders of a message bubble as its timer runs out. */
export function MessageTimerBorder({ expiresAt, createdAt, radius = 16, strokeWidth = 1.2 }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const progress = useRef(new Animated.Value(1)).current;
  const glowPulse = useRef(new Animated.Value(0.35)).current;

  const expiresMs = new Date(expiresAt).getTime();
  const createdMs = new Date(createdAt).getTime();
  const totalMs = Math.max(1000, expiresMs - createdMs);

  const { perimeter, rectWidth, rectHeight, cornerRadius, inset } = useMemo(() => {
    const insetPx = 2;
    const w = Math.max(0, size.width - insetPx);
    const h = Math.max(0, size.height - insetPx);
    const r = Math.min(radius, w / 2, h / 2);
    const straight = 2 * Math.max(0, w - 2 * r) + 2 * Math.max(0, h - 2 * r);
    return { perimeter: straight + 2 * Math.PI * r, rectWidth: w, rectHeight: h, cornerRadius: r, inset: insetPx };
  }, [size.width, size.height, radius, strokeWidth]);

  useEffect(() => {
    const remaining = expiresMs - Date.now();
    if (remaining <= 0) {
      progress.setValue(0);
      return;
    }
    progress.setValue(Math.min(1, remaining / totalMs));
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [expiresMs, totalMs, progress]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.75, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(glowPulse, { toValue: 0.3, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glowPulse]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  };

  const strokeDashoffset = progress.interpolate({ inputRange: [0, 1], outputRange: [perimeter, 0] });
  const stroke = progress.interpolate({
    inputRange: [0, 0.2, 0.55, 1],
    outputRange: [colors.danger, '#FFA85C', colors.blue, colors.neon],
  });

  return (
    <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none', overflow: 'hidden' }]} onLayout={onLayout}>
      {rectWidth > 0 && rectHeight > 0 && (
        <Svg width={size.width} height={size.height} style={{ overflow: 'visible' }}>
          <AnimatedRect
            x={inset / 2}
            y={inset / 2}
            width={rectWidth}
            height={rectHeight}
            rx={cornerRadius}
            ry={cornerRadius}
            fill="none"
            stroke={stroke as unknown as string}
            strokeWidth={Math.max(1.2, strokeWidth * 2.2)}
            strokeLinecap="round"
            strokeDasharray={`${perimeter}`}
            strokeDashoffset={strokeDashoffset as unknown as number}
            opacity={glowPulse as unknown as number}
          />
          <AnimatedRect
            x={inset / 2}
            y={inset / 2}
            width={rectWidth}
            height={rectHeight}
            rx={cornerRadius}
            ry={cornerRadius}
            fill="none"
            stroke={stroke as unknown as string}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${perimeter}`}
            strokeDashoffset={strokeDashoffset as unknown as number}
          />
        </Svg>
      )}
    </View>
  );
}
