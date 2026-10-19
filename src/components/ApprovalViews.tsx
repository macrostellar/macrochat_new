import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { VideoPreviewPlayer } from '@/components/VideoThumbnail';
import { useApp } from '@/context/AppContext';
import { useApprovals } from '@/context/ApprovalsContext';
import { APPROVAL_CATEGORY_PRESETS, APPROVAL_COMMENT_MAX, APPROVAL_OPTION_MAX, DEFAULT_APPROVAL_CATEGORY, decisionLabel, statusLabel } from '@/lib/approvals';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';
import type { ApprovalContentKind, ApprovalDecisionInput, ApprovalDecisionKind, ApprovalGroup, ApprovalMode, ApprovalRequest, ApprovalRole, ApprovalStatus } from '@/types';

export type ApprovalTab = 'inbox' | 'sent' | 'history' | 'groups';
export type HistoryFilters = { status: ApprovalStatus | 'all'; category: string | 'all' };
export const defaultHistoryFilters: HistoryFilters = { status: 'all', category: 'all' };

export const statusColor: Record<ApprovalStatus, string> = {
  pending: colors.yellow,
  approved: colors.neon,
  rejected: colors.danger,
  changes: '#7AC7FF',
  cancelled: colors.muted,
};

const decisionColor: Record<ApprovalDecisionKind, string> = { approved: colors.neon, rejected: colors.danger, changes: '#7AC7FF' };
const decisionIcon: Record<ApprovalDecisionKind, keyof typeof Ionicons.glyphMap> = { approved: 'checkmark-circle', rejected: 'close-circle', changes: 'create' };

const contentKinds: { id: ApprovalContentKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'text', label: 'Text', icon: 'document-text-outline' },
  { id: 'email', label: 'Email', icon: 'mail-outline' },
  { id: 'image', label: 'Image', icon: 'image-outline' },
  { id: 'video', label: 'Video', icon: 'videocam-outline' },
  { id: 'file', label: 'File', icon: 'attach-outline' },
];

const approvePresets = ['Send now', 'Send tomorrow morning', 'Post today', 'CC leadership', 'Great work'];
const rejectPresets = ['Wrong tone', 'Too long', 'Needs numbers', 'Not now', 'Fix typos', 'Add visuals'];

export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDue(iso: string) {
  const date = new Date(iso);
  const overdue = date.getTime() < Date.now();
  const label = date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return { label: `${overdue ? 'Was due' : 'Due'} ${label}`, overdue };
}

export function useContactsForApprovals() {
  const { chats, backendMode } = useApp();
  return useMemo(() => chats
    .filter((chat) => !chat.isGroup)
    .map((chat) => ({
      userId: chat.participantUserId || (backendMode === 'demo' ? chat.id : ''),
      displayName: chat.name,
      macroId: chat.macroId,
      avatarColor: chat.avatarColor,
      avatarUrl: chat.avatarUrl,
    }))
    .filter((contact) => Boolean(contact.userId)), [chats, backendMode]);
}

export function StatusPill({ status, compact }: { status: ApprovalStatus; compact?: boolean }) {
  const color = statusColor[status];
  return (
    <View style={[styles.pill, { borderColor: color }, compact && styles.pillCompact]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }, compact && { fontSize: 10 }]}>{statusLabel[status]}</Text>
    </View>
  );
}

export function CategoryTag({ category }: { category: string }) {
  return <View style={styles.categoryTag}><Ionicons name="pricetag-outline" size={10} color={colors.blue} /><Text style={styles.categoryTagText}>{category}</Text></View>;
}

function approvalProgress(request: ApprovalRequest) {
  const approved = request.decisions.filter((decision) => decision.decision === 'approved' && request.approverIds.includes(decision.approverId)).length;
  return { approved, total: request.approverIds.length };
}

export function ApprovalRequestRow({ request, active, onPress, onQuickDecide }: {
  request: ApprovalRequest;
  active?: boolean;
  onPress: () => void;
  onQuickDecide?: (kind: ApprovalDecisionKind) => void;
}) {
  const progress = approvalProgress(request);
  const kindMeta = contentKinds.find((kind) => kind.id === request.contentKind) ?? contentKinds[0];
  const due = request.dueAt ? formatDue(request.dueAt) : null;
  return (
    <Pressable style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { backgroundColor: colors.navy800 }]} onPress={onPress}>
      <Avatar name={request.requesterName} color={request.requesterAvatarColor} size={42} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>{request.title}</Text>
          <Text style={styles.rowTime}>{timeAgo(request.createdAt)}</Text>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          <Ionicons name={kindMeta.icon} size={11} color={colors.muted} /> {request.mine ? 'You' : request.requesterName} · {request.groupName}
        </Text>
        <View style={styles.rowBottom}>
          <StatusPill status={request.status} compact />
          <CategoryTag category={request.groupCategory} />
          {request.status === 'pending' && progress.total > 1 && <Text style={styles.rowProgress}>{progress.approved}/{progress.total} approved</Text>}
          {request.editedAt && <Text style={styles.rowProgress}>edited</Text>}
          {due && <Text style={[styles.rowProgress, due.overdue && { color: colors.danger }]}>{due.label}</Text>}
        </View>
      </View>
      {request.awaitingMe && onQuickDecide && (
        <View style={styles.quickActions}>
          <Pressable accessibilityLabel="Approve" hitSlop={6} style={[styles.quickButton, { backgroundColor: 'rgba(57,255,20,0.14)' }]} onPress={() => onQuickDecide('approved')}>
            <Ionicons name="checkmark" size={18} color={colors.neon} />
          </Pressable>
          <Pressable accessibilityLabel="Reject" hitSlop={6} style={[styles.quickButton, { backgroundColor: 'rgba(255,102,133,0.14)' }]} onPress={() => onQuickDecide('rejected')}>
            <Ionicons name="close" size={18} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

export function ApprovalGroupRow({ group, active, onPress }: { group: ApprovalGroup; active?: boolean; onPress: () => void }) {
  const approvers = group.members.filter((member) => member.role === 'approver').length;
  return (
    <Pressable style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { backgroundColor: colors.navy800 }]} onPress={onPress}>
      <View style={styles.groupIcon}><Ionicons name="shield-checkmark" size={20} color={colors.neon} /></View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}><Text style={styles.rowTitle} numberOfLines={1}>{group.name}</Text><CategoryTag category={group.category} /></View>
        <Text style={styles.rowMeta}>{group.members.length} members · {approvers} approver{approvers === 1 ? '' : 's'} · {group.approvalMode === 'all' ? 'all must approve' : 'any one approves'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

export function ApprovalTabs({ tab, onChange }: { tab: ApprovalTab; onChange: (tab: ApprovalTab) => void }) {
  const { requests } = useApprovals();
  const pending = requests.filter((request) => request.awaitingMe).length;
  const items: { id: ApprovalTab; label: string; badge?: number }[] = [
    { id: 'inbox', label: 'Inbox', badge: pending },
    { id: 'sent', label: 'Sent' },
    { id: 'history', label: 'History' },
    { id: 'groups', label: 'Groups' },
  ];
  return (
    <View style={styles.tabs}>
      {items.map((item) => (
        <Pressable key={item.id} style={[styles.tab, tab === item.id && styles.tabActive]} onPress={() => onChange(item.id)}>
          <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>
          {Boolean(item.badge) && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{item.badge}</Text></View>}
        </Pressable>
      ))}
    </View>
  );
}

export function HistoryFilterBar({ filters, onChange }: { filters: HistoryFilters; onChange: (next: HistoryFilters) => void }) {
  const { groups, requests } = useApprovals();
  const categories = useMemo(() => [...new Set([...groups.map((group) => group.category), ...requests.map((request) => request.groupCategory)])].sort(), [groups, requests]);
  const statuses: (ApprovalStatus | 'all')[] = ['all', 'approved', 'rejected', 'changes', 'cancelled'];
  return (
    <View style={styles.filterBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {statuses.map((status) => {
          const on = filters.status === status;
          const color = status === 'all' ? colors.blue : statusColor[status];
          return (
            <Pressable key={status} style={[styles.filterChip, on && { borderColor: color, backgroundColor: `${color}22` }]} onPress={() => onChange({ ...filters, status })}>
              <Text style={[styles.filterChipText, on && { color: colors.white }]}>{status === 'all' ? 'All outcomes' : statusLabel[status]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', ...categories] as string[]).map((category) => {
            const on = filters.category === category;
            return (
              <Pressable key={category} style={[styles.filterChip, on && { borderColor: colors.blue, backgroundColor: `${colors.blue}22` }]} onPress={() => onChange({ ...filters, category })}>
                <Ionicons name="pricetag-outline" size={11} color={on ? colors.white : colors.muted} />
                <Text style={[styles.filterChipText, on && { color: colors.white }]}>{category === 'all' ? 'All categories' : category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'long', year: 'numeric' }).toUpperCase();
}

export function useFilteredApprovals(tab: ApprovalTab, query: string, filters: HistoryFilters = defaultHistoryFilters) {
  const { requests, groups } = useApprovals();
  const q = query.trim().toLowerCase();
  return useMemo(() => {
    const matches = (request: ApprovalRequest) => !q || `${request.title} ${request.requesterName} ${request.groupName} ${request.groupCategory} ${request.body ?? ''}`.toLowerCase().includes(q);
    if (tab === 'inbox') {
      const inbox = requests.filter((request) => !request.mine && request.status === 'pending' && matches(request));
      return {
        sections: [
          { title: 'NEEDS YOUR DECISION', data: inbox.filter((request) => request.awaitingMe) },
          { title: 'WAITING ON OTHERS', data: inbox.filter((request) => !request.awaitingMe) },
        ].filter((section) => section.data.length > 0),
        groups: [] as ApprovalGroup[],
      };
    }
    if (tab === 'sent') {
      const sent = requests.filter((request) => request.mine && request.status === 'pending' && matches(request));
      return { sections: sent.length > 0 ? [{ title: 'WAITING FOR DECISION', data: sent }] : [], groups: [] as ApprovalGroup[] };
    }
    if (tab === 'history') {
      const done = requests
        .filter((request) => request.status !== 'pending' && matches(request))
        .filter((request) => filters.status === 'all' || request.status === filters.status)
        .filter((request) => filters.category === 'all' || request.groupCategory === filters.category)
        .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));
      const byMonth = new Map<string, ApprovalRequest[]>();
      done.forEach((request) => {
        const key = monthLabel(request.resolvedAt ?? request.createdAt);
        byMonth.set(key, [...(byMonth.get(key) ?? []), request]);
      });
      return { sections: [...byMonth.entries()].map(([title, data]) => ({ title, data })), groups: [] as ApprovalGroup[] };
    }
    return { sections: [], groups: groups.filter((group) => !q || `${group.name} ${group.category}`.toLowerCase().includes(q)) };
  }, [tab, q, filters, requests, groups]);
}

// ---------------------------------------------------------------------------
// Decision sheet
// ---------------------------------------------------------------------------

export function DecisionSheet({ request, kind, visible, onClose, onSubmitted }: {
  request: ApprovalRequest | null;
  kind: ApprovalDecisionKind;
  visible: boolean;
  onClose: () => void;
  onSubmitted?: (status: ApprovalStatus) => void;
}) {
  const { submitApprovalDecision } = useApprovals();
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  if (!request) return null;
  const options = kind === 'approved' ? request.approveOptions : request.rejectOptions;
  const multi = kind === 'approved' ? request.approveMulti : request.rejectMulti;
  const color = decisionColor[kind];

  const toggle = (label: string) => {
    setSelected((current) => {
      if (multi) return current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
      return current[0] === label ? [] : [label];
    });
  };

  const reset = () => { setSelected([]); setComment(''); };

  const submit = async () => {
    setBusy(true);
    try {
      const input: ApprovalDecisionInput = { decision: kind, selectedOptions: selected, comment: comment.trim() || undefined };
      const status = await submitApprovalDecision(request.id, input);
      reset();
      onSubmitted?.(status);
      onClose();
    } catch (error) {
      Alert.alert('Could not send decision', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={styles.sheetBackdrop} onPress={() => { reset(); onClose(); }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Ionicons name={decisionIcon[kind]} size={26} color={color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color }]}>{decisionLabel[kind]}</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>{request.title}</Text>
            </View>
          </View>

          {options.length > 0 && (
            <>
              <Text style={styles.sheetLabel}>{multi ? 'PICK ANY THAT APPLY' : 'PICK ONE'} · OPTIONAL</Text>
              <View style={styles.chipWrap}>
                {options.map((option) => {
                  const on = selected.includes(option.label);
                  return (
                    <Pressable key={option.id} style={[styles.chip, on && { borderColor: color, backgroundColor: `${color}22` }]} onPress={() => toggle(option.label)}>
                      <Ionicons name={multi ? (on ? 'checkbox' : 'square-outline') : (on ? 'radio-button-on' : 'radio-button-off')} size={16} color={on ? color : colors.muted} />
                      <Text style={[styles.chipText, on && { color: colors.white }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.sheetLabel}>SHORT COMMENT · OPTIONAL</Text>
          <TextInput
            value={comment}
            onChangeText={(text) => setComment(text.slice(0, APPROVAL_COMMENT_MAX))}
            placeholder={kind === 'approved' ? 'e.g. Looks good, ship it' : 'e.g. Tighten the second paragraph'}
            placeholderTextColor={colors.muted}
            style={styles.sheetInput}
            multiline
            maxLength={APPROVAL_COMMENT_MAX}
          />
          <Text style={styles.counter}>{comment.length}/{APPROVAL_COMMENT_MAX}</Text>

          <Pressable style={[styles.confirm, { backgroundColor: color }, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color={colors.navy950} /> : <><Ionicons name="send" size={16} color={colors.navy950} /><Text style={styles.confirmText}>Confirm {decisionLabel[kind].toLowerCase()}</Text></>}
          </Pressable>
          <Pressable style={styles.cancelLink} onPress={() => { reset(); onClose(); }}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Request detail
// ---------------------------------------------------------------------------

function ContentPreview({ request }: { request: ApprovalRequest }) {
  const isImage = request.contentKind === 'image' || Boolean(request.mimeType?.startsWith('image/'));
  const isVideo = request.contentKind === 'video' || Boolean(request.mimeType?.startsWith('video/'));
  return (
    <View style={styles.contentCard}>
      {request.contentKind === 'email' && <Text style={styles.contentEyebrow}>EMAIL DRAFT</Text>}
      {request.body ? <Text style={[styles.contentBody, request.contentKind === 'email' && styles.contentMono]} selectable>{request.body}</Text> : null}
      {request.mediaUrl && isImage && <Image source={{ uri: request.mediaUrl }} style={styles.contentImage} resizeMode="contain" />}
      {request.mediaUrl && isVideo && <VideoPreviewPlayer uri={request.mediaUrl} style={styles.contentVideo} />}
      {request.mediaUrl && !isImage && !isVideo && (
        <Pressable style={styles.fileRow} onPress={() => { void Linking.openURL(request.mediaUrl!); }}>
          <Ionicons name="document-attach" size={22} color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>{request.fileName || 'Attachment'}</Text>
            <Text style={styles.fileMeta}>{request.mimeType || 'file'} · tap to open</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.muted} />
        </Pressable>
      )}
      {!request.body && !request.mediaUrl && <Text style={styles.fileMeta}>{request.mediaPath ? 'Attachment is loading…' : 'No content attached.'}</Text>}
    </View>
  );
}

export function ApprovalRequestDetail({ requestId, onBack, onOpenGroup, onEdit }: { requestId: string; onBack?: () => void; onOpenGroup?: (groupId: string) => void; onEdit?: (requestId: string) => void }) {
  const { requests, groups, cancelApprovalRequest } = useApprovals();
  const [sheetKind, setSheetKind] = useState<ApprovalDecisionKind | null>(null);
  const request = requests.find((item) => item.id === requestId);
  const group = request ? groups.find((item) => item.id === request.groupId) : undefined;

  if (!request) {
    return (
      <View style={styles.detailEmpty}>
        <Ionicons name="document-outline" size={40} color={colors.blue} />
        <Text style={styles.detailEmptyText}>This request is no longer available.</Text>
        {onBack && <Pressable style={styles.secondaryButton} onPress={onBack}><Text style={styles.secondaryButtonText}>Back</Text></Pressable>}
      </View>
    );
  }

  const progress = approvalProgress(request);
  const due = request.dueAt ? formatDue(request.dueAt) : null;
  const canDecide = !request.mine && (request.awaitingMe || Boolean(request.myDecision));
  const approvers = (group?.members ?? []).filter((member) => request.approverIds.includes(member.userId));

  const confirmCancel = () => {
    const run = () => { void cancelApprovalRequest(request.id).catch((error) => Alert.alert('Could not withdraw', error instanceof Error ? error.message : 'Try again.')); };
    if (Platform.OS === 'web') { if (window.confirm('Withdraw this request?')) run(); return; }
    Alert.alert('Withdraw request?', 'Approvers will see it as cancelled.', [{ text: 'Keep', style: 'cancel' }, { text: 'Withdraw', style: 'destructive', onPress: run }]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.detailScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.detailHeader}>
          {onBack && <Pressable accessibilityLabel="Back" style={styles.backButton} onPress={onBack}><Ionicons name="chevron-back" size={22} color={colors.white} /></Pressable>}
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{request.title}</Text>
            <Pressable onPress={() => onOpenGroup?.(request.groupId)}>
              <Text style={styles.detailMeta}>{request.groupName} · {request.mine ? 'sent by you' : `from ${request.requesterName}`} · {timeAgo(request.createdAt)}{request.editedAt ? ` · edited ${timeAgo(request.editedAt)}` : ''}</Text>
            </Pressable>
            <View style={{ marginTop: 6, flexDirection: 'row' }}><CategoryTag category={request.groupCategory} /></View>
          </View>
          <StatusPill status={request.status} />
        </View>

        {due && <View style={[styles.dueBanner, due.overdue && { borderColor: colors.danger }]}><Ionicons name="time-outline" size={15} color={due.overdue ? colors.danger : colors.yellow} /><Text style={[styles.dueText, due.overdue && { color: colors.danger }]}>{due.label}</Text></View>}

        <ContentPreview request={request} />

        <Text style={styles.sectionLabel}>APPROVERS · {progress.approved}/{progress.total} APPROVED{group?.approvalMode === 'any' ? ' · ANY ONE IS ENOUGH' : ''}</Text>
        <View style={styles.card}>
          {approvers.length === 0 && <Text style={styles.fileMeta}>No approvers yet. The group owner can add one.</Text>}
          {approvers.map((member) => {
            const decision = request.decisions.find((item) => item.approverId === member.userId);
            return (
              <View key={member.userId} style={styles.approverRow}>
                <Avatar name={member.displayName} color={member.avatarColor} size={34} imageUrl={member.avatarUrl} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.approverName}>{member.displayName}</Text>
                  {decision ? (
                    <Text style={styles.approverMeta} numberOfLines={3}>
                      {[...decision.selectedOptions, decision.comment ? `\u201C${decision.comment}\u201D` : ''].filter(Boolean).join(' · ') || decisionLabel[decision.decision]} · {timeAgo(decision.updatedAt)}
                    </Text>
                  ) : <Text style={styles.approverMeta}>Waiting…</Text>}
                </View>
                <Ionicons name={decision ? decisionIcon[decision.decision] : 'ellipse-outline'} size={22} color={decision ? decisionColor[decision.decision] : colors.muted} />
              </View>
            );
          })}
        </View>

        {(request.approveOptions.length > 0 || request.rejectOptions.length > 0) && (
          <>
            <Text style={styles.sectionLabel}>QUICK REPLIES OFFERED</Text>
            <View style={styles.card}>
              {request.approveOptions.length > 0 && <Text style={styles.optionsLine}><Text style={{ color: colors.neon }}>If approved: </Text>{request.approveOptions.map((option) => option.label).join(' · ')}</Text>}
              {request.rejectOptions.length > 0 && <Text style={styles.optionsLine}><Text style={{ color: colors.danger }}>If not: </Text>{request.rejectOptions.map((option) => option.label).join(' · ')}</Text>}
            </View>
          </>
        )}

        {request.mine && request.status === 'pending' && (
          <View style={styles.actionRow}>
            {onEdit && <Pressable style={styles.secondaryButton} onPress={() => onEdit(request.id)}><Ionicons name="create-outline" size={16} color={colors.blue} /><Text style={styles.secondaryButtonText}>Edit request</Text></Pressable>}
            <Pressable style={styles.withdraw} onPress={confirmCancel}><Ionicons name="arrow-undo-outline" size={16} color={colors.danger} /><Text style={styles.withdrawText}>Withdraw</Text></Pressable>
          </View>
        )}
        {request.mine && request.status === 'pending' && request.decisions.length > 0 && onEdit && (
          <Text style={styles.helper}>Editing resets the {request.decisions.length} decision{request.decisions.length === 1 ? '' : 's'} already made, so approvers review the new version.</Text>
        )}
      </ScrollView>

      {canDecide && request.status !== 'cancelled' && (
        <View style={styles.decisionBar}>
          {request.myDecision && <Text style={styles.decisionHint}>You chose “{decisionLabel[request.myDecision.decision]}”. Tap to change.</Text>}
          <View style={styles.decisionButtons}>
            <Pressable style={[styles.decisionButton, { backgroundColor: colors.danger }]} onPress={() => setSheetKind('rejected')}>
              <Ionicons name="close" size={20} color={colors.navy950} /><Text style={styles.decisionButtonText}>Reject</Text>
            </Pressable>
            <Pressable style={[styles.decisionButton, styles.decisionButtonGhost]} onPress={() => setSheetKind('changes')}>
              <Ionicons name="create-outline" size={18} color="#7AC7FF" /><Text style={[styles.decisionButtonText, { color: '#7AC7FF' }]}>Changes</Text>
            </Pressable>
            <Pressable style={[styles.decisionButton, { backgroundColor: colors.neon, flex: 1.4 }]} onPress={() => setSheetKind('approved')}>
              <Ionicons name="checkmark" size={20} color={colors.navy950} /><Text style={styles.decisionButtonText}>Approve</Text>
            </Pressable>
          </View>
        </View>
      )}

      <DecisionSheet request={request} kind={sheetKind ?? 'approved'} visible={sheetKind !== null} onClose={() => setSheetKind(null)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// New request form
// ---------------------------------------------------------------------------

function OptionEditor({ title, color, presets, options, onChange, multi, onMultiChange }: {
  title: string; color: string; presets: string[]; options: string[]; onChange: (next: string[]) => void; multi: boolean; onMultiChange: (next: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = (label: string) => {
    const clean = label.trim();
    if (!clean || options.includes(clean) || options.length >= APPROVAL_OPTION_MAX) return;
    onChange([...options, clean]);
    setDraft('');
  };
  return (
    <View style={styles.card}>
      <View style={styles.optionHeader}>
        <Text style={[styles.optionTitle, { color }]}>{title}</Text>
        <View style={styles.switchRow}><Text style={styles.switchLabel}>{multi ? 'Multi-select' : 'Single choice'}</Text><Switch value={multi} onValueChange={onMultiChange} trackColor={{ true: color, false: colors.border }} thumbColor={colors.white} /></View>
      </View>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Pressable key={option} style={[styles.chip, { borderColor: color, backgroundColor: `${color}22` }]} onPress={() => onChange(options.filter((item) => item !== option))}>
            <Text style={[styles.chipText, { color: colors.white }]}>{option}</Text><Ionicons name="close" size={14} color={colors.muted} />
          </Pressable>
        ))}
        {options.length === 0 && <Text style={styles.fileMeta}>No quick replies yet. Add up to {APPROVAL_OPTION_MAX}.</Text>}
      </View>
      {options.length < APPROVAL_OPTION_MAX && (
        <>
          <View style={styles.addRow}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Add your own…" placeholderTextColor={colors.muted} style={styles.addInput} maxLength={40} onSubmitEditing={() => add(draft)} returnKeyType="done" />
            <Pressable style={[styles.addButton, { backgroundColor: color }]} onPress={() => add(draft)}><Ionicons name="add" size={18} color={colors.navy950} /></Pressable>
          </View>
          <View style={styles.chipWrap}>
            {presets.filter((preset) => !options.includes(preset)).map((preset) => (
              <Pressable key={preset} style={styles.presetChip} onPress={() => add(preset)}><Text style={styles.presetText}>+ {preset}</Text></Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const duePresets: { id: string; label: string; compute: () => string | undefined }[] = [
  { id: 'none', label: 'No deadline', compute: () => undefined },
  { id: '1h', label: 'In 1 hour', compute: () => new Date(Date.now() + 3600000).toISOString() },
  { id: 'eod', label: 'Today 6 PM', compute: () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d.toISOString(); } },
  { id: 'tomorrow', label: 'Tomorrow 9 AM', compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
];

export function NewApprovalRequestForm({ initialGroupId, editRequest, onDone, onCreateGroup }: { initialGroupId?: string; editRequest?: ApprovalRequest; onDone: (requestId: string) => void; onCreateGroup?: () => void }) {
  const { groups, createApprovalRequest, updateApprovalRequest } = useApprovals();
  const submitGroups = useMemo(() => groups.filter((group) => group.myRole !== null), [groups]);
  const [groupId, setGroupId] = useState(editRequest?.groupId || initialGroupId || submitGroups[0]?.id || '');
  const [title, setTitle] = useState(editRequest?.title ?? '');
  const [kind, setKind] = useState<ApprovalContentKind>(editRequest?.contentKind ?? 'text');
  const [body, setBody] = useState(editRequest?.body ?? '');
  const [media, setMedia] = useState<{ uri: string; fileName?: string; mimeType?: string } | null>(null);
  const [keepExistingMedia, setKeepExistingMedia] = useState(Boolean(editRequest?.mediaUrl || editRequest?.mediaPath));
  const [approveOptions, setApproveOptions] = useState<string[]>(editRequest?.approveOptions.map((option) => option.label) ?? []);
  const [approveMulti, setApproveMulti] = useState(editRequest?.approveMulti ?? true);
  const [rejectOptions, setRejectOptions] = useState<string[]>(editRequest?.rejectOptions.map((option) => option.label) ?? ['Wrong tone', 'Needs changes', 'Not now']);
  const [rejectMulti, setRejectMulti] = useState(editRequest?.rejectMulti ?? false);
  const [dueId, setDueId] = useState(editRequest?.dueAt ? 'keep' : 'none');
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(editRequest);
  const needsMedia = kind === 'image' || kind === 'video' || kind === 'file';
  const hasMedia = Boolean(media) || (keepExistingMedia && Boolean(editRequest?.mediaUrl || editRequest?.mediaPath));
  const selectedGroup = submitGroups.find((group) => group.id === groupId);
  const duePresetsForForm = editRequest?.dueAt ? [{ id: 'keep', label: `Keep (${formatDue(editRequest.dueAt).label.replace(/^Was due |^Due /, '')})`, compute: () => editRequest.dueAt }, ...duePresets] : duePresets;

  const pickMedia = async () => {
    try {
      if (kind === 'file') {
        const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        setMedia({ uri: asset.uri, fileName: asset.name || 'Attachment', mimeType: asset.mimeType || 'application/octet-stream' });
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permission needed', 'Allow media library access to attach files.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === 'video' ? ['videos'] : ['images'], quality: 0.9, videoMaxDuration: 300 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
      setMedia({ uri: asset.uri, fileName: asset.fileName || (isVideo ? 'video.mp4' : 'photo.jpg'), mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg') });
    } catch (error) {
      Alert.alert('Could not pick file', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const submit = async () => {
    if (!groupId) return Alert.alert('Pick a group', 'Choose which approval group should review this.');
    if (title.trim().length < 2) return Alert.alert('Add a title', 'A short title helps approvers decide fast.');
    if (needsMedia && !hasMedia) return Alert.alert('Attach a file', `Pick the ${kind} you want approved.`);
    if (!needsMedia && body.trim().length === 0) return Alert.alert('Add content', 'Paste the text or email draft to be approved.');
    setBusy(true);
    try {
      const input = {
        groupId,
        title,
        contentKind: kind,
        body: body.trim() || undefined,
        media: media ?? undefined,
        removeMedia: isEdit && !media && !keepExistingMedia,
        approveOptions,
        approveMulti,
        rejectOptions,
        rejectMulti,
        dueAt: duePresetsForForm.find((preset) => preset.id === dueId)?.compute(),
      };
      if (editRequest) {
        await updateApprovalRequest(editRequest.id, input);
        onDone(editRequest.id);
      } else {
        onDone(await createApprovalRequest(input));
      }
    } catch (error) {
      Alert.alert(isEdit ? 'Could not save changes' : 'Could not submit', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (submitGroups.length === 0) {
    return (
      <View style={styles.detailEmpty}>
        <Ionicons name="people-outline" size={40} color={colors.blue} />
        <Text style={styles.detailEmptyTitle}>No approval group yet</Text>
        <Text style={styles.detailEmptyText}>Create a group with at least one approver, then send things for sign-off.</Text>
        {onCreateGroup && <Pressable style={styles.primaryButton} onPress={onCreateGroup}><Ionicons name="add" size={18} color={colors.navy950} /><Text style={styles.primaryButtonText}>Create approval group</Text></Pressable>}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.detailScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>APPROVAL GROUP</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
          {submitGroups.map((group) => (
            <Pressable key={group.id} disabled={isEdit} style={[styles.segment, groupId === group.id && styles.segmentActive, isEdit && groupId !== group.id && { opacity: 0.4 }]} onPress={() => setGroupId(group.id)}>
              <Ionicons name="shield-checkmark" size={14} color={groupId === group.id ? colors.neon : colors.muted} /><Text style={[styles.segmentText, groupId === group.id && styles.segmentTextActive]}>{group.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {selectedGroup && <Text style={styles.helper}>{selectedGroup.members.filter((member) => member.role === 'approver').length} approver(s) · {selectedGroup.approvalMode === 'all' ? 'everyone must approve' : 'any one can approve'}</Text>}

        <Text style={styles.sectionLabel}>TITLE</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Q4 launch email to clients" placeholderTextColor={colors.muted} style={styles.input} maxLength={120} />

        <Text style={styles.sectionLabel}>WHAT NEEDS APPROVAL</Text>
        <View style={styles.segmentRow}>
          {contentKinds.map((item) => (
            <Pressable key={item.id} style={[styles.segment, kind === item.id && styles.segmentActive]} onPress={() => { setKind(item.id); if (item.id === 'text' || item.id === 'email') setMedia(null); }}>
              <Ionicons name={item.icon} size={15} color={kind === item.id ? colors.neon : colors.muted} /><Text style={[styles.segmentText, kind === item.id && styles.segmentTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {needsMedia ? (
          <View style={styles.card}>
            {media ? (
              <View style={styles.fileRow}>
                {kind === 'image' ? <Image source={{ uri: media.uri }} style={styles.thumb} /> : <Ionicons name={kind === 'video' ? 'videocam' : 'document-attach'} size={26} color={colors.blue} />}
                <View style={{ flex: 1 }}><Text style={styles.fileName} numberOfLines={1}>{media.fileName}</Text><Text style={styles.fileMeta}>{media.mimeType}</Text></View>
                <Pressable hitSlop={8} onPress={() => setMedia(null)}><Ionicons name="close-circle" size={22} color={colors.muted} /></Pressable>
              </View>
            ) : keepExistingMedia && editRequest && (editRequest.mediaUrl || editRequest.mediaPath) ? (
              <View style={styles.fileRow}>
                {kind === 'image' && editRequest.mediaUrl ? <Image source={{ uri: editRequest.mediaUrl }} style={styles.thumb} /> : <Ionicons name={kind === 'video' ? 'videocam' : 'document-attach'} size={26} color={colors.blue} />}
                <View style={{ flex: 1 }}><Text style={styles.fileName} numberOfLines={1}>{editRequest.fileName || 'Current attachment'}</Text><Text style={styles.fileMeta}>Keeping existing file</Text></View>
                <Pressable style={styles.miniAdd} onPress={pickMedia}><Text style={styles.miniAddText}>Replace</Text></Pressable>
                <Pressable hitSlop={8} onPress={() => setKeepExistingMedia(false)}><Ionicons name="close-circle" size={22} color={colors.muted} /></Pressable>
              </View>
            ) : (
              <Pressable style={styles.pickButton} onPress={pickMedia}><Ionicons name="cloud-upload-outline" size={22} color={colors.neon} /><Text style={styles.pickText}>Choose {kind}</Text></Pressable>
            )}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>{needsMedia ? 'NOTE FOR APPROVERS · OPTIONAL' : kind === 'email' ? 'EMAIL DRAFT' : 'CONTENT'}</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={kind === 'email' ? 'Subject: …\n\nHi …' : needsMedia ? 'Any context the approver should know' : 'Paste the post, caption, or copy here'}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.textArea, kind === 'email' && styles.contentMono]}
          multiline
          maxLength={8000}
        />

        <Text style={styles.sectionLabel}>DEADLINE</Text>
        <View style={styles.segmentRow}>
          {duePresetsForForm.map((preset) => (
            <Pressable key={preset.id} style={[styles.segment, dueId === preset.id && styles.segmentActive]} onPress={() => setDueId(preset.id)}>
              <Text style={[styles.segmentText, dueId === preset.id && styles.segmentTextActive]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>QUICK REPLIES FOR THE APPROVER</Text>
        <Text style={styles.helper}>One tap for them, no typing. They can still add a short comment.</Text>
        <OptionEditor title="If approved" color={colors.neon} presets={approvePresets} options={approveOptions} onChange={setApproveOptions} multi={approveMulti} onMultiChange={setApproveMulti} />
        <OptionEditor title="If rejected / changes" color={colors.danger} presets={rejectPresets} options={rejectOptions} onChange={setRejectOptions} multi={rejectMulti} onMultiChange={setRejectMulti} />

        <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color={colors.navy950} /> : <><Ionicons name={isEdit ? 'save-outline' : 'paper-plane'} size={17} color={colors.navy950} /><Text style={styles.primaryButtonText}>{isEdit ? 'Save changes' : 'Send for approval'}</Text></>}
        </Pressable>
        {isEdit && (editRequest?.decisions.length ?? 0) > 0 && <Text style={styles.helper}>Saving resets the decisions already made so approvers review the new version.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// New group form + group detail
// ---------------------------------------------------------------------------

type PickedMember = { userId: string; displayName: string; macroId: string; avatarColor: string; avatarUrl?: string; role: ApprovalRole };

function RoleToggle({ role, onChange }: { role: ApprovalRole; onChange: (role: ApprovalRole) => void }) {
  return (
    <View style={styles.roleToggle}>
      {(['approver', 'submitter'] as ApprovalRole[]).map((item) => (
        <Pressable key={item} style={[styles.roleOption, role === item && styles.roleOptionActive]} onPress={() => onChange(item)}>
          <Text style={[styles.roleText, role === item && styles.roleTextActive]}>{item === 'approver' ? 'Approver' : 'Submitter'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MacroIdLookup({ onFound, exclude }: { onFound: (member: PickedMember) => void; exclude: string[] }) {
  const { backendMode } = useApp();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const client = supabase;
  if (backendMode === 'demo' || !client) return null;
  const lookup = async () => {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    try {
      const { data, error } = await client.rpc('macrochat_find_profile_by_macro_id', { target_macro_id: normalized });
      if (error) throw error;
      const found = Array.isArray(data) ? data[0] : data;
      if (!found) { Alert.alert('Not found', 'No one has that Macro ID.'); return; }
      if (exclude.includes(found.id)) { Alert.alert('Already added'); return; }
      onFound({ userId: found.id, displayName: found.display_name, macroId: found.macro_id, avatarColor: found.avatar_color, role: 'submitter' });
      setValue('');
    } catch (error) {
      Alert.alert('Lookup failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.addRow}>
      <TextInput value={value} onChangeText={setValue} placeholder="Add by Macro ID (MC-WORD-0000)" placeholderTextColor={colors.muted} autoCapitalize="characters" style={styles.addInput} onSubmitEditing={lookup} returnKeyType="search" />
      <Pressable style={[styles.addButton, { backgroundColor: colors.blue }]} onPress={lookup} disabled={busy}>{busy ? <ActivityIndicator color={colors.navy950} size="small" /> : <Ionicons name="search" size={16} color={colors.navy950} />}</Pressable>
    </View>
  );
}

export function NewApprovalGroupForm({ onDone }: { onDone: (groupId: string) => void }) {
  const { profile } = useApp();
  const { createApprovalGroup } = useApprovals();
  const contacts = useContactsForApprovals();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(DEFAULT_APPROVAL_CATEGORY);
  const [customCategory, setCustomCategory] = useState('');
  const [mode, setMode] = useState<ApprovalMode>('all');
  const [myRole, setMyRole] = useState<ApprovalRole>('submitter');
  const [members, setMembers] = useState<PickedMember[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleContact = (contact: typeof contacts[number]) => {
    setMembers((current) => current.some((member) => member.userId === contact.userId)
      ? current.filter((member) => member.userId !== contact.userId)
      : [...current, { ...contact, role: current.length === 0 && myRole === 'submitter' ? 'approver' : 'submitter' }]);
  };

  const approverCount = members.filter((member) => member.role === 'approver').length + (myRole === 'approver' ? 1 : 0);

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert('Name the group', 'e.g. “Marketing sign-off”.');
    if (members.length === 0) return Alert.alert('Add people', 'An approval group needs at least two people.');
    if (approverCount === 0) return Alert.alert('Pick an approver', 'Mark at least one person as Approver.');
    setBusy(true);
    try {
      const id = await createApprovalGroup({ name, category: (category === '__custom' ? customCategory : category).trim() || DEFAULT_APPROVAL_CATEGORY, approvalMode: mode, myRole, members: members.map((member) => ({ userId: member.userId, role: member.role })) });
      onDone(id);
    } catch (error) {
      Alert.alert('Could not create group', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.detailScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>GROUP NAME</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Marketing sign-off" placeholderTextColor={colors.muted} style={styles.input} maxLength={60} />

        <Text style={styles.sectionLabel}>CATEGORY</Text>
        <Text style={styles.helper}>Used to filter and find old approvals in History.</Text>
        <View style={[styles.segmentRow, { marginTop: 8 }]}>
          {APPROVAL_CATEGORY_PRESETS.map((preset) => (
            <Pressable key={preset} style={[styles.segment, category === preset && styles.segmentActive]} onPress={() => setCategory(preset)}>
              <Ionicons name="pricetag-outline" size={13} color={category === preset ? colors.neon : colors.muted} /><Text style={[styles.segmentText, category === preset && styles.segmentTextActive]}>{preset}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.segment, category === '__custom' && styles.segmentActive]} onPress={() => setCategory('__custom')}>
            <Ionicons name="add" size={13} color={category === '__custom' ? colors.neon : colors.muted} /><Text style={[styles.segmentText, category === '__custom' && styles.segmentTextActive]}>Custom</Text>
          </Pressable>
        </View>
        {category === '__custom' && <TextInput value={customCategory} onChangeText={setCustomCategory} placeholder="Category name" placeholderTextColor={colors.muted} style={[styles.input, { marginTop: 8 }]} maxLength={40} />}

        <Text style={styles.sectionLabel}>APPROVAL RULE</Text>
        <View style={styles.segmentRow}>
          {([['all', 'All approvers must approve'], ['any', 'Any one approver is enough']] as [ApprovalMode, string][]).map(([id, label]) => (
            <Pressable key={id} style={[styles.segment, mode === id && styles.segmentActive]} onPress={() => setMode(id)}>
              <Ionicons name={mode === id ? 'radio-button-on' : 'radio-button-off'} size={15} color={mode === id ? colors.neon : colors.muted} /><Text style={[styles.segmentText, mode === id && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helper}>A single rejection always closes the request. Approvers can change their decision until it is resolved.</Text>

        <Text style={styles.sectionLabel}>YOUR ROLE</Text>
        <View style={styles.card}>
          <View style={styles.memberRow}>
            <Avatar name={profile?.displayName || 'You'} color={profile?.avatarColor || colors.blue} size={36} imageUrl={profile?.avatarUrl} />
            <View style={{ flex: 1 }}><Text style={styles.approverName}>{profile?.displayName || 'You'}</Text><Text style={styles.approverMeta}>Owner</Text></View>
            <RoleToggle role={myRole} onChange={setMyRole} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>MEMBERS · {members.length} SELECTED · {approverCount} APPROVER{approverCount === 1 ? '' : 'S'}</Text>
        <View style={styles.card}>
          {members.map((member) => (
            <View key={member.userId} style={styles.memberRow}>
              <Avatar name={member.displayName} color={member.avatarColor} size={36} imageUrl={member.avatarUrl} />
              <View style={{ flex: 1 }}><Text style={styles.approverName}>{member.displayName}</Text><Text style={styles.approverMeta}>{member.macroId}</Text></View>
              <RoleToggle role={member.role} onChange={(role) => setMembers((current) => current.map((item) => (item.userId === member.userId ? { ...item, role } : item)))} />
              <Pressable hitSlop={8} onPress={() => setMembers((current) => current.filter((item) => item.userId !== member.userId))}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable>
            </View>
          ))}
          {members.length === 0 && <Text style={styles.fileMeta}>Pick people from your contacts below.</Text>}
        </View>

        <MacroIdLookup exclude={members.map((member) => member.userId)} onFound={(member) => setMembers((current) => [...current, member])} />

        <Text style={styles.sectionLabel}>YOUR CONTACTS</Text>
        <View style={styles.card}>
          {contacts.length === 0 && <Text style={styles.fileMeta}>Start a chat with someone first, or add them by Macro ID.</Text>}
          {contacts.map((contact) => {
            const on = members.some((member) => member.userId === contact.userId);
            return (
              <Pressable key={contact.userId} style={styles.memberRow} onPress={() => toggleContact(contact)}>
                <Avatar name={contact.displayName} color={contact.avatarColor} size={36} imageUrl={contact.avatarUrl} />
                <View style={{ flex: 1 }}><Text style={styles.approverName}>{contact.displayName}</Text><Text style={styles.approverMeta}>{contact.macroId}</Text></View>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.neon : colors.muted} />
              </Pressable>
            );
          })}
        </View>

        <Pressable style={[styles.primaryButton, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color={colors.navy950} /> : <><Ionicons name="shield-checkmark" size={17} color={colors.navy950} /><Text style={styles.primaryButtonText}>Create approval group</Text></>}
        </Pressable>
        <Text style={styles.helper}>A group chat with the same name is created too — decisions are posted there automatically.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function ApprovalGroupDetail({ groupId, onBack, onNewRequest, onOpenChat, onOpenRequest }: {
  groupId: string; onBack?: () => void; onNewRequest: () => void; onOpenChat: () => void; onOpenRequest: (id: string) => void;
}) {
  const { profile } = useApp();
  const { groups, requests, updateApprovalMembers } = useApprovals();
  const contacts = useContactsForApprovals();
  const [busy, setBusy] = useState(false);
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    return <View style={styles.detailEmpty}><Ionicons name="people-outline" size={40} color={colors.blue} /><Text style={styles.detailEmptyText}>Group not found.</Text></View>;
  }
  const groupRequests = requests.filter((request) => request.groupId === groupId).slice(0, 20);
  const memberIds = group.members.map((member) => member.userId);
  const addable = contacts.filter((contact) => !memberIds.includes(contact.userId));
  const isMe = (userId: string) => userId === profile?.id || userId === 'me';

  const run = async (changes: Parameters<typeof updateApprovalMembers>[1]) => {
    setBusy(true);
    try { await updateApprovalMembers(group.id, changes); } catch (error) { Alert.alert('Could not update members', error instanceof Error ? error.message : 'Try again.'); } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.detailScroll}>
      <View style={styles.detailHeader}>
        {onBack && <Pressable accessibilityLabel="Back" style={styles.backButton} onPress={onBack}><Ionicons name="chevron-back" size={22} color={colors.white} /></Pressable>}
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle}>{group.name}</Text>
          <Text style={styles.detailMeta}>{group.approvalMode === 'all' ? 'All approvers must approve' : 'Any one approver is enough'} · {group.isOwner ? 'you own this group' : `you are ${group.myRole === 'approver' ? 'an approver' : 'a submitter'}`}</Text>
          <View style={{ marginTop: 6, flexDirection: 'row' }}><CategoryTag category={group.category} /></View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.primaryButtonSm} onPress={onNewRequest}><Ionicons name="paper-plane" size={15} color={colors.navy950} /><Text style={styles.primaryButtonText}>New request</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={onOpenChat}><Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.blue} /><Text style={styles.secondaryButtonText}>Open chat</Text></Pressable>
      </View>

      <Text style={styles.sectionLabel}>MEMBERS</Text>
      <View style={styles.card}>
        {group.members.map((member) => (
          <View key={member.userId} style={styles.memberRow}>
            <Avatar name={member.displayName} color={member.avatarColor} size={36} imageUrl={member.avatarUrl} />
            <View style={{ flex: 1 }}><Text style={styles.approverName}>{member.displayName}{isMe(member.userId) ? ' (you)' : ''}</Text><Text style={styles.approverMeta}>{member.macroId}</Text></View>
            {group.isOwner ? (
              <>
                <RoleToggle role={member.role} onChange={(role) => { void run({ setRole: [{ userId: member.userId, role }] }); }} />
                {!isMe(member.userId) && <Pressable hitSlop={8} disabled={busy} onPress={() => { void run({ remove: [member.userId] }); }}><Ionicons name="remove-circle-outline" size={20} color={colors.danger} /></Pressable>}
              </>
            ) : (
              <Text style={[styles.roleBadge, member.role === 'approver' && { color: colors.neon, borderColor: colors.neon }]}>{member.role === 'approver' ? 'Approver' : 'Submitter'}</Text>
            )}
          </View>
        ))}
      </View>

      {group.isOwner && (
        <>
          <Text style={styles.sectionLabel}>ADD PEOPLE</Text>
          <MacroIdLookup exclude={memberIds} onFound={(member) => { void run({ add: [{ userId: member.userId, role: member.role }] }); }} />
          <View style={styles.card}>
            {addable.length === 0 && <Text style={styles.fileMeta}>All your contacts are already in this group.</Text>}
            {addable.map((contact) => (
              <View key={contact.userId} style={styles.memberRow}>
                <Avatar name={contact.displayName} color={contact.avatarColor} size={36} imageUrl={contact.avatarUrl} />
                <View style={{ flex: 1 }}><Text style={styles.approverName}>{contact.displayName}</Text><Text style={styles.approverMeta}>{contact.macroId}</Text></View>
                <Pressable style={styles.miniAdd} disabled={busy} onPress={() => { void run({ add: [{ userId: contact.userId, role: 'approver' }] }); }}><Text style={styles.miniAddText}>+ Approver</Text></Pressable>
                <Pressable style={styles.miniAdd} disabled={busy} onPress={() => { void run({ add: [{ userId: contact.userId, role: 'submitter' }] }); }}><Text style={styles.miniAddText}>+ Submitter</Text></Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>RECENT REQUESTS</Text>
      {groupRequests.length === 0 && <Text style={styles.fileMeta}>Nothing sent for approval yet.</Text>}
      {groupRequests.map((request) => <ApprovalRequestRow key={request.id} request={request} onPress={() => onOpenRequest(request.id)} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, height: 24 },
  pillCompact: { height: 20, paddingHorizontal: 6 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowActive: { backgroundColor: colors.navy800, borderLeftWidth: 3, borderLeftColor: colors.neon, paddingLeft: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { color: colors.white, fontSize: 15, fontWeight: '800', flex: 1 },
  rowTime: { color: colors.muted, fontSize: 11 },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  rowProgress: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  categoryTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 7, height: 20 },
  categoryTagText: { color: colors.blue, fontSize: 10, fontWeight: '800' },
  filterBar: { gap: 6, marginBottom: 6 },
  filterRow: { gap: 6, paddingHorizontal: 16 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 10, height: 30, backgroundColor: colors.navy900 },
  filterChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 6 },
  quickButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  groupIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.navy900, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  tabActive: { backgroundColor: colors.navy700 },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.white },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navy900, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, borderTopWidth: 1, borderColor: colors.border, maxWidth: 560, width: '100%', alignSelf: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '900' },
  sheetSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sheetLabel: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  sheetInput: { minHeight: 64, maxHeight: 120, backgroundColor: colors.navy800, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.white, padding: 12, fontSize: 14, textAlignVertical: 'top' },
  counter: { color: colors.muted, fontSize: 10, textAlign: 'right', marginTop: 4 },
  confirm: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  confirmText: { color: colors.navy950, fontWeight: '900', fontSize: 15 },
  cancelLink: { alignItems: 'center', paddingVertical: 12 },
  cancelLinkText: { color: colors.muted, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  presetChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10, borderStyle: 'dashed' },
  presetText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  detailScroll: { padding: 16, paddingBottom: 120, gap: 0 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  backButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  detailTitle: { color: colors.white, fontSize: 22, fontWeight: '900' },
  detailMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  detailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 },
  detailEmptyTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  detailEmptyText: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  dueBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.yellow, borderRadius: 10, paddingHorizontal: 12, height: 36, marginBottom: 12, alignSelf: 'flex-start' },
  dueText: { color: colors.yellow, fontWeight: '800', fontSize: 12 },
  contentCard: { backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 10 },
  contentEyebrow: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  contentBody: { color: colors.white, fontSize: 15, lineHeight: 22 },
  contentMono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13, lineHeight: 20 },
  contentImage: { width: '100%', height: 320, borderRadius: 12, backgroundColor: colors.black },
  contentVideo: { width: '100%', height: 320, borderRadius: 12, backgroundColor: colors.black },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy800, borderRadius: 12, padding: 12 },
  fileName: { color: colors.white, fontWeight: '800' },
  fileMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.black },
  sectionLabel: { color: colors.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 10 },
  approverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  approverName: { color: colors.white, fontWeight: '800', fontSize: 14 },
  approverMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  optionsLine: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  withdraw: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 12 },
  withdrawText: { color: colors.danger, fontWeight: '800' },
  decisionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, backgroundColor: colors.navy950, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  decisionHint: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  decisionButtons: { flexDirection: 'row', gap: 10 },
  decisionButton: { flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  decisionButtonGhost: { borderWidth: 1, borderColor: '#7AC7FF', backgroundColor: 'transparent' },
  decisionButtonText: { color: colors.navy950, fontWeight: '900', fontSize: 15 },
  secondaryButton: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryButtonText: { color: colors.blue, fontWeight: '800' },
  primaryButton: { height: 50, borderRadius: 14, backgroundColor: colors.neon, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  primaryButtonSm: { height: 42, borderRadius: 12, backgroundColor: colors.neon, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryButtonText: { color: colors.navy950, fontWeight: '900', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 4, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' },
  input: { backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.white, paddingHorizontal: 14, height: 48, fontSize: 15 },
  textArea: { height: undefined, minHeight: 140, paddingVertical: 12, textAlignVertical: 'top' },
  helper: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  hChips: { gap: 8, paddingRight: 8 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.navy900 },
  segmentActive: { borderColor: colors.neon, backgroundColor: colors.navy800 },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: colors.white },
  pickButton: { height: 72, borderRadius: 12, borderWidth: 1, borderColor: colors.neon, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  pickText: { color: colors.neon, fontWeight: '800' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  optionTitle: { fontWeight: '900', fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addInput: { flex: 1, height: 42, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.white, paddingHorizontal: 12, fontSize: 14 },
  addButton: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleToggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 9, overflow: 'hidden' },
  roleOption: { paddingHorizontal: 9, height: 30, alignItems: 'center', justifyContent: 'center' },
  roleOptionActive: { backgroundColor: colors.navy700 },
  roleText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  roleTextActive: { color: colors.neon },
  roleBadge: { color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 8, height: 26, lineHeight: 24, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  miniAdd: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 8, height: 30, alignItems: 'center', justifyContent: 'center' },
  miniAddText: { color: colors.blue, fontSize: 11, fontWeight: '800' },
});
