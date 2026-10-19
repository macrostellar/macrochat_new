import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import type {
  ApprovalContentKind,
  ApprovalDecision,
  ApprovalDecisionInput,
  ApprovalDecisionKind,
  ApprovalGroup,
  ApprovalMember,
  ApprovalMode,
  ApprovalOption,
  ApprovalRequest,
  ApprovalRole,
  ApprovalStatus,
  NewApprovalRequestInput,
} from '@/types';

type Client = NonNullable<typeof supabase>;

type GroupRow = { conversation_id: string; name: string; category: string | null; approval_mode: ApprovalMode; created_by: string; created_at: string };
type MemberRow = {
  conversation_id: string;
  user_id: string;
  role: ApprovalRole;
  macrochat_profiles: { id: string; macro_id: string; display_name: string; avatar_color: string; avatar_url: string | null } | null;
};
type RequestRow = {
  id: string;
  conversation_id: string;
  requester_id: string;
  title: string;
  content_kind: ApprovalContentKind;
  body: string | null;
  media_path: string | null;
  media_name: string | null;
  media_mime: string | null;
  approve_options: unknown;
  approve_multi: boolean;
  reject_options: unknown;
  reject_multi: boolean;
  due_at: string | null;
  status: ApprovalStatus;
  created_at: string;
  edited_at: string | null;
  resolved_at: string | null;
};
type DecisionRow = {
  id: string;
  request_id: string;
  approver_id: string;
  decision: ApprovalDecisionKind;
  selected_options: unknown;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export const MEDIA_BUCKET = 'macrochat-media';
export const APPROVAL_COMMENT_MAX = 280;
export const APPROVAL_OPTION_MAX = 4;
export const DEFAULT_APPROVAL_CATEGORY = 'General';
export const APPROVAL_CATEGORY_PRESETS = ['General', 'Marketing', 'Sales', 'Finance', 'HR', 'Legal', 'Design', 'Content', 'Operations', 'Product'];

export const decisionLabel: Record<ApprovalDecisionKind, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  changes: 'Changes needed',
};

export const statusLabel: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  changes: 'Changes needed',
  cancelled: 'Cancelled',
};

export const decisionEmoji: Record<ApprovalDecisionKind, string> = { approved: '\u2705', rejected: '\u274C', changes: '\u270F\uFE0F' };

export function toOptions(labels: string[]): ApprovalOption[] {
  return labels
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, APPROVAL_OPTION_MAX)
    .map((label, index) => ({ id: `o${index + 1}-${Math.random().toString(36).slice(2, 6)}`, label }));
}

function parseOptions(value: unknown): ApprovalOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { id?: unknown; label?: unknown } => typeof item === 'object' && item !== null)
    .map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `o${index}`, label: typeof item.label === 'string' ? item.label : '' }))
    .filter((item) => item.label);
}

function parseStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function buildDecisionSummary(actorName: string, request: Pick<ApprovalRequest, 'title'>, input: ApprovalDecisionInput, finalStatus?: ApprovalStatus) {
  const parts = [`${decisionEmoji[input.decision]} ${actorName} ${input.decision === 'changes' ? 'requested changes on' : input.decision} \u201C${request.title}\u201D`];
  if (input.selectedOptions.length > 0) parts.push(input.selectedOptions.join(', '));
  if (input.comment?.trim()) parts.push(`\u201C${input.comment.trim()}\u201D`);
  const line = parts.join(' \u00B7 ');
  if (finalStatus === 'approved' && input.decision === 'approved') return `${line}\nAll approvals in \u2014 request approved.`;
  return line;
}

export function buildRequestSummary(actorName: string, title: string, contentKind: ApprovalContentKind) {
  const kindLabel: Record<ApprovalContentKind, string> = { text: 'a post', email: 'an email draft', image: 'an image', video: 'a video', file: 'a file' };
  return `\uD83D\uDCCB ${actorName} sent ${kindLabel[contentKind]} for approval: \u201C${title}\u201D`;
}

async function currentUserId(client: Client) {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Your session is no longer valid. Please sign in again.');
  return id;
}

function inferExtension(fileName?: string, mimeType?: string) {
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf',
  };
  return (mimeType && byMime[mimeType]) || 'bin';
}

async function readUploadBody(uri: string): Promise<Blob | Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function postApprovalSystemMessage(client: Client, conversationId: string, senderId: string, text: string) {
  const clientId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await client.from('macrochat_messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: text.slice(0, 4000),
    kind: 'system',
    client_id: clientId,
  });
  if (error) console.warn('Failed to post approval event to chat:', error.message);
}

export type ApprovalSnapshot = { groups: ApprovalGroup[]; requests: ApprovalRequest[] };

export async function fetchApprovalSnapshot(client: Client): Promise<ApprovalSnapshot> {
  const me = await currentUserId(client);

  const myMemberships = await client.from('macrochat_approval_members').select('conversation_id,role').eq('user_id', me);
  if (myMemberships.error) throw myMemberships.error;
  const groupIds = (myMemberships.data ?? []).map((row) => row.conversation_id as string);
  if (groupIds.length === 0) return { groups: [], requests: [] };
  const myRoleByGroup = new Map((myMemberships.data ?? []).map((row) => [row.conversation_id as string, row.role as ApprovalRole]));

  const [groupsRes, membersRes, requestsRes] = await Promise.all([
    client.from('macrochat_approval_groups').select('conversation_id,name,category,approval_mode,created_by,created_at').in('conversation_id', groupIds),
    client.from('macrochat_approval_members').select('conversation_id,user_id,role,macrochat_profiles(id,macro_id,display_name,avatar_color,avatar_url)').in('conversation_id', groupIds),
    client.from('macrochat_approval_requests').select('*').in('conversation_id', groupIds).order('created_at', { ascending: false }).limit(300),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (requestsRes.error) throw requestsRes.error;

  const memberRows = (membersRes.data ?? []) as unknown as MemberRow[];
  const members: ApprovalMember[] = memberRows.map((row) => ({
    userId: row.user_id,
    displayName: row.macrochat_profiles?.display_name || row.macrochat_profiles?.macro_id || 'Member',
    macroId: row.macrochat_profiles?.macro_id || '',
    avatarColor: row.macrochat_profiles?.avatar_color || '#55B9FF',
    avatarUrl: row.macrochat_profiles?.avatar_url || undefined,
    role: row.role,
  }));
  const membersByGroup = new Map<string, ApprovalMember[]>();
  memberRows.forEach((row, index) => {
    const list = membersByGroup.get(row.conversation_id) ?? [];
    list.push(members[index]);
    membersByGroup.set(row.conversation_id, list);
  });
  const profileById = new Map(members.map((member) => [member.userId, member]));

  const groups: ApprovalGroup[] = ((groupsRes.data ?? []) as GroupRow[]).map((row) => ({
    id: row.conversation_id,
    name: row.name,
    category: row.category || DEFAULT_APPROVAL_CATEGORY,
    approvalMode: row.approval_mode,
    createdBy: row.created_by,
    createdAt: row.created_at,
    members: (membersByGroup.get(row.conversation_id) ?? []).sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'approver' ? -1 : 1)),
    myRole: myRoleByGroup.get(row.conversation_id) ?? null,
    isOwner: row.created_by === me,
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const requestRows = (requestsRes.data ?? []) as RequestRow[];
  const requestIds = requestRows.map((row) => row.id);
  const decisionsRes = requestIds.length > 0
    ? await client.from('macrochat_approval_decisions').select('*').in('request_id', requestIds)
    : { data: [] as DecisionRow[], error: null };
  if (decisionsRes.error) throw decisionsRes.error;
  const decisionsByRequest = new Map<string, ApprovalDecision[]>();
  ((decisionsRes.data ?? []) as DecisionRow[]).forEach((row) => {
    const list = decisionsByRequest.get(row.request_id) ?? [];
    list.push({
      id: row.id,
      requestId: row.request_id,
      approverId: row.approver_id,
      approverName: profileById.get(row.approver_id)?.displayName || 'Approver',
      decision: row.decision,
      selectedOptions: parseStringList(row.selected_options),
      comment: row.comment || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    decisionsByRequest.set(row.request_id, list);
  });

  const mediaPaths = [...new Set(requestRows.map((row) => row.media_path).filter((path): path is string => Boolean(path) && !path!.startsWith('data:')))];
  const signedByPath = new Map<string, string>();
  if (mediaPaths.length > 0) {
    const signed = await client.storage.from(MEDIA_BUCKET).createSignedUrls(mediaPaths, 60 * 60);
    if (!signed.error && signed.data) {
      mediaPaths.forEach((path, index) => {
        const url = signed.data?.[index]?.signedUrl;
        if (url) signedByPath.set(path, url);
      });
    }
  }

  const requests: ApprovalRequest[] = requestRows.map((row) => {
    const group = groupById.get(row.conversation_id);
    const requester = profileById.get(row.requester_id);
    const approverIds = (group?.members ?? []).filter((member) => member.role === 'approver' && member.userId !== row.requester_id).map((member) => member.userId);
    const decisions = (decisionsByRequest.get(row.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const myDecision = decisions.find((decision) => decision.approverId === me);
    const mine = row.requester_id === me;
    return {
      id: row.id,
      groupId: row.conversation_id,
      groupName: group?.name || 'Approval group',
      groupCategory: group?.category || DEFAULT_APPROVAL_CATEGORY,
      requesterId: row.requester_id,
      requesterName: requester?.displayName || 'Member',
      requesterAvatarColor: requester?.avatarColor || '#55B9FF',
      title: row.title,
      contentKind: row.content_kind,
      body: row.body || undefined,
      mediaPath: row.media_path || undefined,
      mediaUrl: row.media_path ? (row.media_path.startsWith('data:') ? row.media_path : signedByPath.get(row.media_path)) : undefined,
      fileName: row.media_name || undefined,
      mimeType: row.media_mime || undefined,
      approveOptions: parseOptions(row.approve_options),
      approveMulti: row.approve_multi,
      rejectOptions: parseOptions(row.reject_options),
      rejectMulti: row.reject_multi,
      dueAt: row.due_at || undefined,
      status: row.status,
      createdAt: row.created_at,
      editedAt: row.edited_at || undefined,
      resolvedAt: row.resolved_at || undefined,
      decisions,
      approverIds,
      mine,
      myDecision,
      awaitingMe: !mine && row.status === 'pending' && approverIds.includes(me) && !myDecision,
    };
  });

  return { groups, requests };
}

export async function createApprovalGroupRemote(client: Client, input: { name: string; category: string; approvalMode: ApprovalMode; myRole: ApprovalRole; members: { userId: string; role: ApprovalRole }[] }) {
  const me = await currentUserId(client);
  const name = input.name.trim();
  const others = input.members.filter((member) => member.userId !== me);

  // Probe first so a missing migration doesn't leave behind an orphaned group chat.
  const probe = await client.from('macrochat_approval_groups').select('conversation_id').limit(0);
  if (probe.error) {
    throw new Error(probe.error.code === 'PGRST205'
      ? 'Approvals are not set up on the server yet. Run supabase/approvals-migration.sql in the Supabase SQL editor.'
      : probe.error.message);
  }

  const conversation = await client.from('macrochat_conversations').insert({ created_by: me, is_group: true, title: name }).select('id').single();
  if (conversation.error) throw conversation.error;
  const conversationId = conversation.data.id as string;

  const memberInsert = await client.from('macrochat_conversation_members').insert([
    { conversation_id: conversationId, user_id: me, role: 'admin' },
    ...others.map((member) => ({ conversation_id: conversationId, user_id: member.userId, role: 'member' })),
  ]);
  if (memberInsert.error) throw memberInsert.error;

  const groupInsert = await client.from('macrochat_approval_groups').insert({ conversation_id: conversationId, name, category: input.category.trim() || DEFAULT_APPROVAL_CATEGORY, approval_mode: input.approvalMode, created_by: me });
  if (groupInsert.error) throw groupInsert.error;

  const rolesInsert = await client.from('macrochat_approval_members').insert([
    { conversation_id: conversationId, user_id: me, role: input.myRole },
    ...others.map((member) => ({ conversation_id: conversationId, user_id: member.userId, role: member.role })),
  ]);
  if (rolesInsert.error) throw rolesInsert.error;

  await postApprovalSystemMessage(client, conversationId, me, `\uD83D\uDEE1\uFE0F Approval group \u201C${name}\u201D created \u00B7 ${input.approvalMode === 'all' ? 'all approvers must approve' : 'any one approver can approve'}`);
  return conversationId;
}

export async function updateApprovalMembersRemote(client: Client, groupId: string, changes: { add?: { userId: string; role: ApprovalRole }[]; setRole?: { userId: string; role: ApprovalRole }[]; remove?: string[] }) {
  if (changes.add?.length) {
    const convMembers = await client.from('macrochat_conversation_members').upsert(
      changes.add.map((member) => ({ conversation_id: groupId, user_id: member.userId, role: 'member' })),
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
    );
    if (convMembers.error) throw convMembers.error;
    const roles = await client.from('macrochat_approval_members').upsert(
      changes.add.map((member) => ({ conversation_id: groupId, user_id: member.userId, role: member.role })),
      { onConflict: 'conversation_id,user_id' },
    );
    if (roles.error) throw roles.error;
  }
  for (const change of changes.setRole ?? []) {
    const res = await client.from('macrochat_approval_members').update({ role: change.role }).eq('conversation_id', groupId).eq('user_id', change.userId);
    if (res.error) throw res.error;
  }
  if (changes.remove?.length) {
    const res = await client.from('macrochat_approval_members').delete().eq('conversation_id', groupId).in('user_id', changes.remove);
    if (res.error) throw res.error;
  }
}

async function uploadApprovalMedia(client: Client, groupId: string, me: string, media: NonNullable<NewApprovalRequestInput['media']>) {
  const mime = media.mimeType || 'application/octet-stream';
  const path = `${groupId}/${me}/approval-${Date.now()}.${inferExtension(media.fileName, mime)}`;
  const body = await readUploadBody(media.uri);
  const upload = await client.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);
  return { media_path: path, media_name: media.fileName || null, media_mime: mime };
}

export async function createApprovalRequestRemote(client: Client, actorName: string, input: NewApprovalRequestInput) {
  const me = await currentUserId(client);
  const media = input.media ? await uploadApprovalMedia(client, input.groupId, me, input.media) : { media_path: null, media_name: null, media_mime: null };

  const insert = await client.from('macrochat_approval_requests').insert({
    conversation_id: input.groupId,
    requester_id: me,
    title: input.title.trim(),
    content_kind: input.contentKind,
    body: input.body?.trim() || null,
    ...media,
    approve_options: toOptions(input.approveOptions),
    approve_multi: input.approveMulti,
    reject_options: toOptions(input.rejectOptions),
    reject_multi: input.rejectMulti,
    due_at: input.dueAt || null,
  }).select('id').single();
  if (insert.error) throw insert.error;

  await postApprovalSystemMessage(client, input.groupId, me, buildRequestSummary(actorName, input.title.trim(), input.contentKind));
  return insert.data.id as string;
}

export async function updateApprovalRequestRemote(client: Client, actorName: string, request: ApprovalRequest, input: NewApprovalRequestInput) {
  const me = await currentUserId(client);
  const media = input.media
    ? await uploadApprovalMedia(client, request.groupId, me, input.media)
    : input.removeMedia ? { media_path: null, media_name: null, media_mime: null } : {};

  const res = await client.from('macrochat_approval_requests').update({
    title: input.title.trim(),
    content_kind: input.contentKind,
    body: input.body?.trim() || null,
    ...media,
    approve_options: toOptions(input.approveOptions),
    approve_multi: input.approveMulti,
    reject_options: toOptions(input.rejectOptions),
    reject_multi: input.rejectMulti,
    due_at: input.dueAt || null,
  }).eq('id', request.id).eq('requester_id', me);
  if (res.error) throw res.error;

  const hadDecisions = request.decisions.length > 0;
  await postApprovalSystemMessage(client, request.groupId, me, `\u270F\uFE0F ${actorName} edited \u201C${input.title.trim()}\u201D${hadDecisions ? ' \u00B7 earlier decisions were reset, please review again' : ''}`);
}

export async function submitApprovalDecisionRemote(client: Client, actorName: string, request: ApprovalRequest, input: ApprovalDecisionInput) {
  const me = await currentUserId(client);
  const upsert = await client.from('macrochat_approval_decisions').upsert({
    request_id: request.id,
    approver_id: me,
    decision: input.decision,
    selected_options: input.selectedOptions,
    comment: input.comment?.trim() || null,
  }, { onConflict: 'request_id,approver_id' });
  if (upsert.error) throw upsert.error;

  const refreshed = await client.from('macrochat_approval_requests').select('status').eq('id', request.id).maybeSingle();
  const finalStatus = (refreshed.data?.status as ApprovalStatus | undefined) ?? request.status;
  await postApprovalSystemMessage(client, request.groupId, me, buildDecisionSummary(actorName, request, input, finalStatus));
  return finalStatus;
}

export async function cancelApprovalRequestRemote(client: Client, actorName: string, request: ApprovalRequest) {
  const me = await currentUserId(client);
  const res = await client.from('macrochat_approval_requests').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', request.id).eq('requester_id', me);
  if (res.error) throw res.error;
  await postApprovalSystemMessage(client, request.groupId, me, `\uD83D\uDEAB ${actorName} withdrew \u201C${request.title}\u201D`);
}
