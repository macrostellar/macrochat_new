import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/context/AppContext';
import {
  cancelApprovalRequestRemote,
  createApprovalGroupRemote,
  createApprovalRequestRemote,
  fetchApprovalSnapshot,
  submitApprovalDecisionRemote,
  toOptions,
  updateApprovalMembersRemote,
  updateApprovalRequestRemote,
} from '@/lib/approvals';
import { triggerNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { ApprovalDecision, ApprovalDecisionInput, ApprovalGroup, ApprovalMode, ApprovalRequest, ApprovalRole, ApprovalStatus, NewApprovalRequestInput } from '@/types';

type MemberChange = { add?: { userId: string; role: ApprovalRole }[]; setRole?: { userId: string; role: ApprovalRole }[]; remove?: string[] };

type ApprovalsContextValue = {
  groups: ApprovalGroup[];
  requests: ApprovalRequest[];
  loading: boolean;
  error: string | null;
  /** Open requests that are waiting on my decision. */
  pendingForMe: number;
  refreshApprovals: () => Promise<void>;
  createApprovalGroup: (input: { name: string; category: string; approvalMode: ApprovalMode; myRole: ApprovalRole; members: { userId: string; role: ApprovalRole }[] }) => Promise<string>;
  updateApprovalMembers: (groupId: string, changes: MemberChange) => Promise<void>;
  createApprovalRequest: (input: NewApprovalRequestInput) => Promise<string>;
  updateApprovalRequest: (requestId: string, input: NewApprovalRequestInput) => Promise<void>;
  submitApprovalDecision: (requestId: string, input: ApprovalDecisionInput) => Promise<ApprovalStatus>;
  cancelApprovalRequest: (requestId: string) => Promise<void>;
};

const ApprovalsContext = createContext<ApprovalsContextValue | null>(null);

function approvalClient() {
  if (!supabase) throw new Error('Approvals require a configured server and a signed-in account.');
  return supabase;
}

// A new decision or edit re-alerts the approvers still waiting on a request.
function approvalAlertKey(request: ApprovalRequest) {
  return `${request.id}:${request.decisions.length}:${request.editedAt ?? ''}`;
}

const DEMO_ME = 'me';
const demoPeople = {
  alex: { userId: 'alex', displayName: 'Alex Rivera', macroId: 'MC-ORBIT-2471', avatarColor: '#55B9FF' },
  maya: { userId: 'maya', displayName: 'Maya Chen', macroId: 'MC-LUNAR-8820', avatarColor: '#A78BFA' },
};

function demoSeed(myName: string, myColor: string): { groups: ApprovalGroup[]; requests: ApprovalRequest[] } {
  const group: ApprovalGroup = {
    id: 'demo-approvals',
    name: 'Marketing sign-off',
    category: 'Marketing',
    approvalMode: 'all',
    createdBy: 'alex',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    members: [
      { ...demoPeople.alex, role: 'approver' },
      { userId: DEMO_ME, displayName: myName, macroId: 'YOU', avatarColor: myColor, role: 'approver' },
      { ...demoPeople.maya, role: 'submitter' },
    ],
    myRole: 'approver',
    isOwner: false,
  };
  const request: ApprovalRequest = {
    id: 'demo-req-1',
    groupId: group.id,
    groupName: group.name,
    groupCategory: group.category,
    requesterId: 'maya',
    requesterName: 'Maya Chen',
    requesterAvatarColor: demoPeople.maya.avatarColor,
    title: 'Q4 launch email draft',
    contentKind: 'email',
    body: 'Subject: Introducing MacroChat Pro\n\nHi team,\n\nWe are excited to share the Q4 launch plan. Please review the attached pricing and let me know if the tone works for enterprise customers.\n\nBest,\nMaya',
    approveOptions: toOptions(['Send now', 'Send tomorrow morning', 'CC leadership']),
    approveMulti: true,
    rejectOptions: toOptions(['Wrong tone', 'Too long', 'Needs numbers', 'Not now']),
    rejectMulti: false,
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    decisions: [],
    approverIds: ['alex', DEMO_ME],
    mine: false,
    awaitingMe: true,
  };
  return { groups: [group], requests: [request] };
}

function recomputeDemoStatus(request: ApprovalRequest, mode: ApprovalMode): ApprovalStatus {
  if (request.status === 'cancelled') return 'cancelled';
  if (request.decisions.some((decision) => decision.decision === 'rejected')) return 'rejected';
  if (request.decisions.some((decision) => decision.decision === 'changes')) return 'changes';
  const approved = request.decisions.filter((decision) => decision.decision === 'approved').length;
  if (request.approverIds.length > 0 && ((mode === 'any' && approved >= 1) || (mode === 'all' && approved >= request.approverIds.length))) return 'approved';
  return 'pending';
}

export function ApprovalsProvider({ children }: PropsWithChildren) {
  const { profile, backendMode, refreshChats, notificationPrefs } = useApp();
  const [groups, setGroups] = useState<ApprovalGroup[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenAwaitingRef = useRef<{ owner: string; keys: Set<string> } | null>(null);
  const seenMineRef = useRef<{ owner: string; states: Map<string, { status: string; decisionCount: number }> } | null>(null);
  const notificationPrefsRef = useRef(notificationPrefs);
  useEffect(() => { notificationPrefsRef.current = notificationPrefs; }, [notificationPrefs]);

  const isDemo = backendMode === 'demo';

  // Reset (or seed, in demo mode) whenever the signed-in profile changes.
  const currentOwner = profile?.id ?? null;
  if (dataOwner !== currentOwner) {
    setDataOwner(currentOwner);
    setError(null);
    if (currentOwner && isDemo && profile) {
      const seed = demoSeed(profile.displayName, profile.avatarColor);
      setGroups(seed.groups);
      setRequests(seed.requests);
      setLoading(false);
    } else {
      setGroups([]);
      setRequests([]);
      setLoading(Boolean(currentOwner));
    }
  }

  const refreshApprovals = useCallback(async () => {
    if (!supabase || !profile || isDemo) return;
    try {
      const snapshot = await fetchApprovalSnapshot(supabase);
      // The first load is silent; later loads notify when a request I still need to decide on is new or changed.
      const awaiting = snapshot.requests.filter((request) => request.awaitingMe);
      const previous = seenAwaitingRef.current;
      seenAwaitingRef.current = { owner: profile.id, keys: new Set(awaiting.map(approvalAlertKey)) };
      if (previous?.owner === profile.id) {
        awaiting.filter((request) => !previous.keys.has(approvalAlertKey(request))).forEach((request) => {
          void triggerNotification('approvals', notificationPrefsRef.current, {
            title: `Approval needed · ${request.groupName}`,
            messagePreview: request.title,
          });
        });
      }

      // Requesters hear about decisions on their own requests; the first load is silent.
      const mine = snapshot.requests.filter((request) => request.mine);
      const previousMine = seenMineRef.current;
      seenMineRef.current = { owner: profile.id, states: new Map(mine.map((request) => [request.id, { status: request.status, decisionCount: request.decisions.length }])) };
      if (previousMine?.owner === profile.id) {
        mine.forEach((request) => {
          const before = previousMine.states.get(request.id);
          if (!before) return;
          const latest = request.decisions[request.decisions.length - 1];
          const statusChanged = request.status !== before.status && ['approved', 'rejected', 'changes'].includes(request.status);
          const newDecision = request.decisions.length > before.decisionCount && latest;
          if (statusChanged) {
            const label = request.status === 'changes' ? 'needs changes' : request.status;
            void triggerNotification('approvals', notificationPrefsRef.current, {
              title: `Request ${label} · ${request.groupName}`,
              messagePreview: request.title,
            });
          } else if (newDecision) {
            const verb = latest.decision === 'changes' ? 'requested changes on' : latest.decision;
            void triggerNotification('approvals', notificationPrefsRef.current, {
              title: `New decision · ${request.groupName}`,
              messagePreview: `${latest.approverName} ${verb} \u201C${request.title}\u201D`,
            });
          }
        });
      }
      setGroups(snapshot.groups);
      setRequests(snapshot.requests);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Approvals could not be loaded. Check your connection and server setup.');
      console.warn('Failed to load approvals:', error instanceof Error ? error.message : error);
    } finally {
      setLoading(false);
    }
  }, [profile, isDemo]);

  useEffect(() => {
    if (!supabase || !profile || isDemo) return;
    const client = supabase;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { void refreshApprovals(); }, 300);
    };
    const channel = client.channel(`macrochat-approvals-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_approval_requests' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_approval_decisions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_approval_members' }, scheduleRefresh)
      // Initial load happens here so data still arrives even when realtime is unavailable.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') void refreshApprovals();
      });
    const interval = setInterval(() => { void refreshApprovals(); }, 60000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void refreshApprovals(); });
    return () => {
      clearInterval(interval);
      appState.remove();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      client.removeChannel(channel);
    };
  }, [profile, isDemo, refreshApprovals]);

  const createApprovalGroup = useCallback<ApprovalsContextValue['createApprovalGroup']>(async (input) => {
    if (!profile) throw new Error('Sign in first.');
    if (isDemo) {
      const id = `demo-group-${Date.now()}`;
      const group: ApprovalGroup = {
        id,
        name: input.name.trim(),
        category: input.category.trim() || 'General',
        approvalMode: input.approvalMode,
        createdBy: DEMO_ME,
        createdAt: new Date().toISOString(),
        members: [
          { userId: DEMO_ME, displayName: profile.displayName, macroId: profile.macroId, avatarColor: profile.avatarColor, role: input.myRole },
          ...input.members.filter((member) => member.userId !== DEMO_ME).map((member) => {
            const known = demoPeople[member.userId as keyof typeof demoPeople];
            return { userId: member.userId, displayName: known?.displayName || member.userId, macroId: known?.macroId || '', avatarColor: known?.avatarColor || '#55B9FF', role: member.role };
          }),
        ],
        myRole: input.myRole,
        isOwner: true,
      };
      setGroups((current) => [group, ...current]);
      return id;
    }
    const id = await createApprovalGroupRemote(approvalClient(), input);
    await Promise.all([refreshApprovals(), refreshChats()]);
    return id;
  }, [profile, isDemo, refreshApprovals, refreshChats]);

  const updateApprovalMembers = useCallback<ApprovalsContextValue['updateApprovalMembers']>(async (groupId, changes) => {
    if (isDemo) {
      setGroups((current) => current.map((group) => {
        if (group.id !== groupId) return group;
        let members = group.members.filter((member) => !changes.remove?.includes(member.userId));
        members = members.map((member) => {
          const next = changes.setRole?.find((change) => change.userId === member.userId);
          return next ? { ...member, role: next.role } : member;
        });
        (changes.add ?? []).forEach((added) => {
          if (members.some((member) => member.userId === added.userId)) return;
          const known = demoPeople[added.userId as keyof typeof demoPeople];
          members.push({ userId: added.userId, displayName: known?.displayName || added.userId, macroId: known?.macroId || '', avatarColor: known?.avatarColor || '#55B9FF', role: added.role });
        });
        return { ...group, members };
      }));
      return;
    }
    await updateApprovalMembersRemote(approvalClient(), groupId, changes);
    await Promise.all([refreshApprovals(), refreshChats()]);
  }, [isDemo, refreshApprovals, refreshChats]);

  const createApprovalRequest = useCallback<ApprovalsContextValue['createApprovalRequest']>(async (input) => {
    if (!profile) throw new Error('Sign in first.');
    if (isDemo) {
      const group = groups.find((item) => item.id === input.groupId);
      if (!group) throw new Error('Pick an approval group.');
      const id = `demo-req-${Date.now()}`;
      const request: ApprovalRequest = {
        id,
        groupId: group.id,
        groupName: group.name,
        groupCategory: group.category,
        requesterId: DEMO_ME,
        requesterName: profile.displayName,
        requesterAvatarColor: profile.avatarColor,
        title: input.title.trim(),
        contentKind: input.contentKind,
        body: input.body?.trim() || undefined,
        mediaUrl: input.media?.uri,
        fileName: input.media?.fileName,
        mimeType: input.media?.mimeType,
        approveOptions: toOptions(input.approveOptions),
        approveMulti: input.approveMulti,
        rejectOptions: toOptions(input.rejectOptions),
        rejectMulti: input.rejectMulti,
        dueAt: input.dueAt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        decisions: [],
        approverIds: group.members.filter((member) => member.role === 'approver' && member.userId !== DEMO_ME).map((member) => member.userId),
        mine: true,
        awaitingMe: false,
      };
      setRequests((current) => [request, ...current]);
      return id;
    }
    const id = await createApprovalRequestRemote(approvalClient(), input);
    await Promise.all([refreshApprovals(), refreshChats()]);
    return id;
  }, [profile, isDemo, groups, refreshApprovals, refreshChats]);

  const updateApprovalRequest = useCallback<ApprovalsContextValue['updateApprovalRequest']>(async (requestId, input) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request || !profile) throw new Error('Request not found.');
    if (request.status !== 'pending') throw new Error('Only pending requests can be edited.');
    if (isDemo) {
      const now = new Date().toISOString();
      setRequests((current) => current.map((item) => (item.id === requestId ? {
        ...item,
        title: input.title.trim(),
        contentKind: input.contentKind,
        body: input.body?.trim() || undefined,
        mediaUrl: input.media?.uri ?? (input.removeMedia ? undefined : item.mediaUrl),
        fileName: input.media?.fileName ?? (input.removeMedia ? undefined : item.fileName),
        mimeType: input.media?.mimeType ?? (input.removeMedia ? undefined : item.mimeType),
        approveOptions: toOptions(input.approveOptions),
        approveMulti: input.approveMulti,
        rejectOptions: toOptions(input.rejectOptions),
        rejectMulti: input.rejectMulti,
        dueAt: input.dueAt,
        editedAt: now,
        decisions: [],
        myDecision: undefined,
      } : item)));
      return;
    }
    await updateApprovalRequestRemote(approvalClient(), request, input);
    await Promise.all([refreshApprovals(), refreshChats()]);
  }, [requests, profile, isDemo, refreshApprovals, refreshChats]);

  const submitApprovalDecision = useCallback<ApprovalsContextValue['submitApprovalDecision']>(async (requestId, input) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request || !profile) throw new Error('Request not found.');
    if (isDemo) {
      const group = groups.find((item) => item.id === request.groupId);
      const now = new Date().toISOString();
      const decision: ApprovalDecision = {
        id: `demo-dec-${Date.now()}`,
        requestId,
        approverId: DEMO_ME,
        approverName: profile.displayName,
        decision: input.decision,
        selectedOptions: input.selectedOptions,
        comment: input.comment?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      const decisions = [...request.decisions.filter((item) => item.approverId !== DEMO_ME), decision];
      const next: ApprovalRequest = { ...request, decisions, myDecision: decision, awaitingMe: false };
      next.status = recomputeDemoStatus(next, group?.approvalMode ?? 'all');
      next.resolvedAt = next.status === 'approved' || next.status === 'rejected' ? now : undefined;
      setRequests((current) => current.map((item) => (item.id === requestId ? next : item)));
      return next.status;
    }
    const status = await submitApprovalDecisionRemote(approvalClient(), request, input);
    await Promise.all([refreshApprovals(), refreshChats()]);
    return status;
  }, [requests, groups, profile, isDemo, refreshApprovals, refreshChats]);

  const cancelApprovalRequest = useCallback<ApprovalsContextValue['cancelApprovalRequest']>(async (requestId) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    if (isDemo) {
      setRequests((current) => current.map((item) => (item.id === requestId ? { ...item, status: 'cancelled', awaitingMe: false } : item)));
      return;
    }
    await cancelApprovalRequestRemote(approvalClient(), request);
    await Promise.all([refreshApprovals(), refreshChats()]);
  }, [requests, isDemo, refreshApprovals, refreshChats]);

  const pendingForMe = useMemo(() => requests.filter((request) => request.awaitingMe).length, [requests]);

  const value = useMemo<ApprovalsContextValue>(() => ({
    groups,
    requests,
    loading,
    error,
    pendingForMe,
    refreshApprovals,
    createApprovalGroup,
    updateApprovalMembers,
    createApprovalRequest,
    updateApprovalRequest,
    submitApprovalDecision,
    cancelApprovalRequest,
  }), [groups, requests, loading, error, pendingForMe, refreshApprovals, createApprovalGroup, updateApprovalMembers, createApprovalRequest, updateApprovalRequest, submitApprovalDecision, cancelApprovalRequest]);

  return <ApprovalsContext.Provider value={value}>{children}</ApprovalsContext.Provider>;
}

export function useApprovals() {
  const value = useContext(ApprovalsContext);
  if (!value) throw new Error('useApprovals must be used inside ApprovalsProvider');
  return value;
}
