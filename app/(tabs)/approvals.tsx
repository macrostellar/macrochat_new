import { useState } from 'react';
import { Platform, Pressable, SectionList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { WebApprovals } from '@/components/WebSections';
import { ApprovalGroupRow, ApprovalRequestRow, ApprovalTabs, DecisionSheet, HistoryFilterBar, defaultHistoryFilters, useFilteredApprovals, type ApprovalTab, type HistoryFilters } from '@/components/ApprovalViews';
import { useApprovals } from '@/context/ApprovalsContext';
import { colors } from '@/theme/colors';
import type { ApprovalDecisionKind, ApprovalRequest } from '@/types';

export default function ApprovalsScreen() {
  const { width } = useWindowDimensions();
  const { requests, groups, loading, error, refreshApprovals } = useApprovals();
  const [tab, setTab] = useState<ApprovalTab>('inbox');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [quick, setQuick] = useState<{ request: ApprovalRequest; kind: ApprovalDecisionKind } | null>(null);
  const { sections, groups: filteredGroups } = useFilteredApprovals(tab, query, filters);

  if (Platform.OS === 'web' && width >= 820) return <WebApprovals />;

  const emptyCopy = tab === 'inbox'
    ? (groups.length === 0 ? 'Create an approval group to start receiving requests.' : 'Nothing waiting on you. Nice.')
    : tab === 'sent'
      ? 'Send a post, email draft, image, or file for sign-off.'
      : tab === 'history'
        ? 'Decided requests will be logged here, filterable by outcome and category.'
        : 'Create a group of 2+ people with at least one approver.';

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <View>
          <Text style={styles.eyebrow}>QUICK SIGN-OFF</Text>
          <Text style={styles.title}>Approvals</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="New approval group" style={styles.iconButton} onPress={() => router.push('/approvals/new-group')}><Ionicons name="people-outline" size={21} color={colors.white} /></Pressable>
          <Pressable accessibilityLabel="New approval request" style={[styles.iconButton, styles.newButton]} onPress={() => router.push('/approvals/new')}><Ionicons name="add" size={22} color={colors.black} /></Pressable>
        </View>
      </View>
      <Text style={styles.caption}>Tap once to approve or reject — no typing needed.</Text>
      {error && <Pressable onPress={() => void refreshApprovals()} accessibilityRole="button"><Text style={styles.empty}>Approvals could not be loaded: {error} Tap to retry.</Text></Pressable>}

      <ApprovalTabs tab={tab} onChange={setTab} />
      <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={tab === 'groups' ? 'Search groups' : tab === 'history' ? 'Search old approvals' : 'Search requests'} placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
      {tab === 'history' && <HistoryFilterBar filters={filters} onChange={setFilters} />}

      {tab === 'groups' ? (
        <SectionList
          sections={[{ title: 'GROUPS', data: filteredGroups }]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Loading…' : emptyCopy}</Text>}
          renderItem={({ item }) => <ApprovalGroupRow group={item} onPress={() => router.push({ pathname: '/approvals/group/[id]', params: { id: item.id } })} />}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Loading…' : emptyCopy}</Text>}
          renderSectionHeader={({ section }) => <Text style={styles.sectionLabel}>{section.title}</Text>}
          renderItem={({ item }) => (
            <ApprovalRequestRow
              request={item}
              onPress={() => router.push({ pathname: '/approvals/[id]', params: { id: item.id } })}
              onQuickDecide={(kind) => setQuick({ request: item, kind })}
            />
          )}
        />
      )}

      {requests.length === 0 && groups.length === 0 && !loading && !error && tab === 'inbox' && (
        <Pressable style={styles.cta} onPress={() => router.push('/approvals/new-group')}><Ionicons name="shield-checkmark" size={18} color={colors.navy950} /><Text style={styles.ctaText}>Create your first approval group</Text></Pressable>
      )}

      <DecisionSheet request={quick?.request ?? null} kind={quick?.kind ?? 'approved'} visible={quick !== null} onClose={() => setQuick(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  eyebrow: { color: colors.blue, fontWeight: '800', letterSpacing: 1.4, fontSize: 11 },
  title: { color: colors.white, fontSize: 34, fontWeight: '900', marginTop: 2 },
  caption: { color: colors.muted, fontSize: 12, paddingHorizontal: 20, marginBottom: 12 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  newButton: { backgroundColor: colors.neon, borderColor: colors.neon },
  search: { marginHorizontal: 16, marginBottom: 6, height: 44, borderRadius: 13, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { color: colors.white, flex: 1, fontSize: 14, outlineStyle: 'none' } as never,
  sectionLabel: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 16, marginTop: 14, marginBottom: 4 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 50, paddingHorizontal: 30, lineHeight: 20 },
  cta: { position: 'absolute', bottom: 24, alignSelf: 'center', height: 48, borderRadius: 24, paddingHorizontal: 18, backgroundColor: colors.neon, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { color: colors.navy950, fontWeight: '900' },
});
