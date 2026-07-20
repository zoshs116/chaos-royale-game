import type { RealtimeChannel } from '@supabase/supabase-js';
import { saveProfile } from './profileRepository';
import { disabledResult, supabase, toSupabaseError, type SupabaseResult } from './supabaseClient';
import type { ClanInvite, ClanMember, ClanMessage, ClanRoom, FriendlyRoom, PlayerProfile, Team } from './types';

type ClanRow = {
    id: string;
    name: string;
    owner_id: string;
    invite_code: string;
    created_at: string;
};

type ClanMemberRow = {
    clan_id: string;
    profile_id: string;
    nickname?: string;
    level?: number;
    trophies?: number;
    role: 'owner' | 'member' | 'guest';
    ready: boolean;
    joined_at?: string;
};

type ClanInviteRow = {
    id: string;
    clan_id: string;
    from_user_id: string;
    to_user_id: string;
    to_nickname: string;
    clan_name: string;
    from_user_name: string;
    status: ClanInvite['status'];
    created_at: string;
};

type ClanMessageRow = {
    id: string;
    clan_id: string;
    author_id: string;
    author_name: string;
    text: string;
    type: ClanMessage['type'];
    created_at: string;
};

type FriendlyRoomRow = {
    id: string;
    clan_id: string;
    host_user_id: string;
    guest_user_id: string | null;
    host_name: string;
    guest_name: string | null;
    host_team: Team;
    guest_team: Team;
    status: FriendlyRoom['status'];
    host_ready?: boolean;
    guest_ready?: boolean;
    revision?: number;
    expires_at?: string;
    created_at: string;
};

export interface RemoteClanState {
    clan: ClanRoom | null;
    members: ClanMember[];
    invites: ClanInvite[];
    messages: ClanMessage[];
    friendlyRoom: FriendlyRoom | null;
}

const fromClanRow = (row: ClanRow): ClanRoom => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: new Date(row.created_at).getTime(),
});

const fromMemberRow = (row: ClanMemberRow): ClanMember => ({
    id: row.profile_id,
    name: row.nickname ?? row.profile_id,
    level: row.level ?? 1,
    trophies: row.trophies ?? 0,
    online: false,
    ready: row.ready,
    role: row.role,
});

const fromInviteRow = (row: ClanInviteRow): ClanInvite => ({
    id: row.id,
    clanId: row.clan_id,
    fromUserId: row.from_user_id,
    fromUserName: row.from_user_name,
    toUserId: row.to_user_id,
    toNickname: row.to_nickname,
    clanName: row.clan_name,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
});

const fromMessageRow = (row: ClanMessageRow): ClanMessage => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    text: row.text,
    type: row.type,
    createdAt: new Date(row.created_at).getTime(),
});

const fromFriendlyRoomRow = (row: FriendlyRoomRow, localUserId: string): FriendlyRoom => {
    const isHost = row.host_user_id === localUserId;
    return {
        id: row.id,
        hostUserId: row.host_user_id,
        guestUserId: row.guest_user_id,
        hostName: row.host_name,
        guestName: row.guest_name,
        localTeam: isHost ? row.host_team : row.guest_team,
        opponentTeam: isHost ? row.guest_team : row.host_team,
        status: row.status,
        hostReady: row.host_ready ?? true,
        guestReady: row.guest_ready ?? row.status !== 'requested',
        revision: row.revision ?? 1,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
        createdAt: new Date(row.created_at).getTime(),
    };
};

const requireClient = () => supabase;

export async function upsertRemoteProfile(profile: PlayerProfile): Promise<SupabaseResult<null>> {
    const result = await saveProfile(profile);
    if (!result.ok) return result;
    return { ok: true, data: null };
}

export async function createRemoteClan(_profile: PlayerProfile, name: string): Promise<SupabaseResult<ClanRoom>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data: clan, error: clanError } = await client.rpc('create_clan', {
        clan_name: name,
    }) as { data: ClanRow | null; error: { message: string } | null };
    if (clanError) return toSupabaseError(`클랜 생성 실패: ${clanError.message}`, clanError);
    if (!clan) return toSupabaseError('클랜 생성 결과가 없습니다.');

    return { ok: true, data: fromClanRow(clan) };
}

export async function createRemoteInvite(clan: ClanRoom, profile: PlayerProfile, nickname: string): Promise<SupabaseResult<ClanInvite>> {
    const client = requireClient();
    if (!client) return disabledResult();

    void clan;
    void profile;
    const { data, error } = await client.rpc('create_clan_invite', { target_nickname: nickname.trim() });
    if (error) return toSupabaseError(`초대 생성 실패: ${error.message}`, error);
    const row = (Array.isArray(data) ? data[0] : data) as ClanInviteRow | null;
    if (!row) return toSupabaseError('초대 생성 결과가 없습니다.');
    return { ok: true, data: fromInviteRow(row) };
}

export async function cancelRemoteInvite(inviteId: string): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.rpc('cancel_clan_invite', { target_invite_id: inviteId });
    if (error) return toSupabaseError(`초대 취소 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function acceptRemoteInvite(invite: ClanInvite): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.rpc('accept_clan_invite', { invite_id: invite.id });
    if (error) return toSupabaseError(`초대 수락 실패: ${error.message}`, error);

    return { ok: true, data: null };
}

export async function declineRemoteInvite(inviteId: string): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();
    const { error } = await client.rpc('decline_clan_invite', { target_invite_id: inviteId });
    if (error) return toSupabaseError(`초대 거절 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function removeRemoteClanMember(clan: ClanRoom, memberId: string): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();
    void clan;
    const { error } = await client.rpc('remove_clan_member', { target_profile_id: memberId });
    if (error) return toSupabaseError(`클랜 멤버 내보내기 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function sendRemoteClanMessage(clan: ClanRoom, profile: PlayerProfile, text: string, type: ClanMessage['type'] = 'chat'): Promise<SupabaseResult<ClanMessage>> {
    const client = requireClient();
    if (!client) return disabledResult();

    void clan;
    void profile;
    if (type !== 'chat') return toSupabaseError('시스템 메시지는 서버에서만 만들 수 있습니다.');
    const { data, error } = await client.rpc('send_clan_message', { message_text: text.trim() });
    if (error) return toSupabaseError(`채팅 전송 실패: ${error.message}`, error);
    const row = (Array.isArray(data) ? data[0] : data) as ClanMessageRow | null;
    if (!row) return toSupabaseError('채팅 전송 결과가 없습니다.');
    return { ok: true, data: fromMessageRow(row) };
}

export async function leaveRemoteClan(): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();
    const { error } = await client.rpc('leave_clan');
    if (error) return toSupabaseError(`클랜 나가기 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function createRemoteFriendlyRoom(clan: ClanRoom, profile: PlayerProfile, opponent: ClanMember): Promise<SupabaseResult<FriendlyRoom>> {
    const client = requireClient();
    if (!client) return disabledResult();

    void clan;
    const { data, error } = await client.rpc('create_friendly_room', {
        target_profile_id: opponent.id,
    });
    if (error) return toSupabaseError(`친선전 요청 실패: ${error.message}`, error);

    const row = (Array.isArray(data) ? data[0] : data) as FriendlyRoomRow | null;
    if (!row) return toSupabaseError('Friendly battle request returned no room.');
    return { ok: true, data: fromFriendlyRoomRow(row, profile.id) };
}

export async function acceptRemoteFriendlyRoom(room: FriendlyRoom): Promise<SupabaseResult<number>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data, error } = await client.rpc('transition_friendly_room', {
        target_room_id: room.id,
        expected_revision: room.revision ?? 1,
        next_status: 'accepted',
    });
    if (error) return toSupabaseError(`친선전 수락 실패: ${error.message}`, error);
    return { ok: true, data: Number(data) };
}

export async function updateRemoteFriendlyRoomStatus(
    room: Pick<FriendlyRoom, 'id' | 'revision'>,
    status: FriendlyRoom['status']
): Promise<SupabaseResult<number>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data, error } = await client.rpc('transition_friendly_room', {
        target_room_id: room.id,
        expected_revision: room.revision ?? 1,
        next_status: status,
    });
    if (error) return toSupabaseError(`Friendly battle status update failed: ${error.message}`, error);
    return { ok: true, data: Number(data) };
}

export async function loadRemoteClanState(profile: PlayerProfile): Promise<SupabaseResult<RemoteClanState>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data: incomingInvites, error: incomingInviteError } = await client
        .from('clan_invites')
        .select('*')
        .eq('to_user_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .returns<ClanInviteRow[]>();
    if (incomingInviteError) return toSupabaseError(`받은 초대 조회 실패: ${incomingInviteError.message}`, incomingInviteError);

    const { data: membership, error: membershipError } = await client
        .from('clan_members')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle<ClanMemberRow>();
    if (membershipError) return toSupabaseError(`클랜 멤버십 조회 실패: ${membershipError.message}`, membershipError);
    if (!membership) {
        return {
            ok: true,
            data: {
                clan: null,
                members: [],
                invites: (incomingInvites ?? []).map(fromInviteRow),
                messages: [],
                friendlyRoom: null,
            },
        };
    }

    const { data: clan, error: clanError } = await client.from('clans').select('*').eq('id', membership.clan_id).single<ClanRow>();
    if (clanError) return toSupabaseError(`클랜 조회 실패: ${clanError.message}`, clanError);

    const [membersResult, invitesResult, messagesResult, roomsResult] = await Promise.all([
        client.from('clan_member_directory').select('*').eq('clan_id', clan.id).returns<ClanMemberRow[]>(),
        client.from('clan_invites').select('*').eq('clan_id', clan.id).order('created_at', { ascending: false }).returns<ClanInviteRow[]>(),
        client.from('clan_messages').select('*').eq('clan_id', clan.id).order('created_at', { ascending: true }).limit(80).returns<ClanMessageRow[]>(),
        client.from('friendly_rooms').select('*').eq('clan_id', clan.id).in('status', ['requested', 'accepted', 'starting', 'in_battle']).order('created_at', { ascending: false }).limit(1).returns<FriendlyRoomRow[]>(),
    ]);
    const firstError = membersResult.error ?? invitesResult.error ?? messagesResult.error ?? roomsResult.error;
    if (firstError) return toSupabaseError(`클랜 상태 동기화 실패: ${firstError.message}`, firstError);

    return {
        ok: true,
        data: {
            clan: fromClanRow(clan),
            members: (membersResult.data ?? []).map(fromMemberRow),
            invites: [...new Map(
                [...(incomingInvites ?? []), ...(invitesResult.data ?? [])].map((invite) => [invite.id, invite])
            ).values()].map(fromInviteRow),
            messages: (messagesResult.data ?? []).map(fromMessageRow),
            friendlyRoom: roomsResult.data?.[0] ? fromFriendlyRoomRow(roomsResult.data[0], profile.id) : null,
        },
    };
}

export interface RemoteSocialSubscription {
    userChannel: RealtimeChannel;
    clanChannel: RealtimeChannel | null;
}

export function subscribeRemoteSocial(
    userId: string,
    clanId: string | undefined,
    onChange: () => void,
    onPresence: (onlineUserIds: string[]) => void,
): RemoteSocialSubscription | null {
    const client = requireClient();
    if (!client) return null;

    const userChannel = client
        .channel(`social-user:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_invites', filter: `to_user_id=eq.${userId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_members', filter: `profile_id=eq.${userId}` }, onChange)
        .subscribe();

    if (!clanId) {
        onPresence([]);
        return { userChannel, clanChannel: null };
    }

    const clanChannel = client
        .channel(`social-clan:${clanId}`, { config: { presence: { key: userId } } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_members', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_invites', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_messages', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendly_rooms', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('presence', { event: 'sync' }, () => {
            const state = clanChannel.presenceState() as Record<string, Array<{ user_id?: string }>>;
            const ids = new Set<string>();
            for (const [key, presences] of Object.entries(state)) {
                if (key) ids.add(key);
                for (const presence of presences) if (presence.user_id) ids.add(presence.user_id);
            }
            onPresence([...ids]);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                void clanChannel.track({ user_id: userId, online_at: new Date().toISOString() });
            }
        });

    return { userChannel, clanChannel };
}

export function unsubscribeRemoteSocial(subscription: RemoteSocialSubscription | null) {
    if (!subscription || !supabase) return;
    void supabase.removeChannel(subscription.userChannel);
    if (subscription.clanChannel) void supabase.removeChannel(subscription.clanChannel);
}
