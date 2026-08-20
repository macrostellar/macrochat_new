import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { colors } from '@/theme/colors';

const updates = [
  { name: 'Alex Rivera', time: '8 minutes ago', color: '#55B9FF' },
  { name: 'Maya Chen', time: '42 minutes ago', color: '#A78BFA' },
  { name: 'Macro Team', time: 'Today, 9:20 AM', color: '#71F79F' },
];

export default function UpdatesScreen() {
  return <Screen><View style={styles.header}><Text style={styles.title}>Updates</Text><Pressable style={styles.icon}><Ionicons name="camera-outline" size={23} color={colors.white} /></Pressable></View><Text style={styles.caption}>Private moments disappear after 24 hours.</Text><View style={styles.mine}><View style={styles.add}><Ionicons name="add" color={colors.navy950} size={25} /></View><View><Text style={styles.name}>My update</Text><Text style={styles.time}>Tap to add an update</Text></View></View><Text style={styles.section}>RECENT UPDATES</Text><FlatList data={updates} keyExtractor={(item) => item.name} renderItem={({ item }) => <View style={styles.row}><View style={styles.ring}><Avatar name={item.name} color={item.color} size={50} /></View><View><Text style={styles.name}>{item.name}</Text><Text style={styles.time}>{item.time}</Text></View></View>} /></Screen>;
}
const styles = StyleSheet.create({ header: { padding: 20, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: colors.white, fontSize: 32, fontWeight: '900' }, icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' }, caption: { color: colors.muted, paddingHorizontal: 20, marginTop: -8 }, mine: { margin: 20, padding: 16, borderRadius: 18, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', gap: 14 }, add: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }, name: { color: colors.white, fontWeight: '800', fontSize: 15 }, time: { color: colors.muted, fontSize: 12, marginTop: 4 }, section: { color: colors.blue, fontWeight: '900', letterSpacing: 1.5, fontSize: 11, margin: 20, marginBottom: 7 }, row: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }, ring: { padding: 2, borderWidth: 2, borderColor: colors.neon, borderRadius: 30 } });
