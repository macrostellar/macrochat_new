import { Text, View } from 'react-native';
import { colors } from '@/theme/colors';

export function Avatar({ name, color, size = 48, online = false }: { name: string; color: string; size?: number; online?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.navy950, fontSize: size * 0.36, fontWeight: '800' }}>
          {name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>
      {online && <View style={{ position: 'absolute', right: 0, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.neon, borderWidth: 2, borderColor: colors.navy900 }} />}
    </View>
  );
}
