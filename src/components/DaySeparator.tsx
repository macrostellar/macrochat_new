import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

export function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

/** Renders a day label above a message row when the message starts a new day. */
export function withDaySeparator(label: string | undefined, renderRow: () => ReactElement | null): ReactElement | null {
  const row = renderRow();
  if (!label) return row;
  return (
    <View>
      <DaySeparator label={label} />
      {row}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 10 },
  text: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: colors.navy800,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
