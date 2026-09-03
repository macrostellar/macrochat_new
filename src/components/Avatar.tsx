import { Image, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

export const DEFAULT_PROFILE_AVATARS = [
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user1.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user2.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user3.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user4.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user5.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user6.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user7.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user8.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user9.jpg',
  'https://pofbkteiymgiwciamyll.supabase.co/storage/v1/object/public/macrochat-media/user10.jpg',
];

export function Avatar({ name, color, size = 48, online = false, imageUrl }: { name: string; color: string; size?: number; online?: boolean; imageUrl?: string }) {
  const initials = name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'M';

  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
        ) : (
          <Text style={{ color: colors.navy950, fontSize: size * 0.36, fontWeight: '800' }}>{initials}</Text>
        )}
      </View>
      {online && <View style={{ position: 'absolute', right: 0, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.neon, borderWidth: 2, borderColor: colors.navy900 }} />}
    </View>
  );
}
