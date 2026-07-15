import type { RealtimeChannel } from '@supabase/supabase-js';
import { disabledResult, supabase, toSupabaseError, type SupabaseResult } from './supabaseClient';
import type { ClanInvite, ClanMember, ClanMessage, ClanRoom, FriendlyRoom, PlayerProfile, Team } from './types';

type ProfileRow = {
    id: string;
    nickname: string;
    avatar_unit: string;
    level: number;
    trophies: number;
    gold: number;
    gems: number;
    wins: number;
    losses: number;
    selected_deck: string[];
    updated_at?: string;
};

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
    online: boolean;
    ready: boolean;
    joined_at?: string;
};

type ClanInviteRow = {
    id: string;
    clan_id: string;
    from_user_id: string;
    to_nickname: string;
    status: 'pending' | 'accepted' | 'declined';
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
    created_at: string;
};

export interface RemoteClanState {
    clan: ClanRoom | null;
    members: ClanMember[];
    invites: ClanInvite[];
    messages: ClanMessage[];
    friendlyRoom: FriendlyRoom | null;
}

const toProfileRow = (profile: PlayerProfile): ProfileRow => ({
    id: profile.id,
    nickname: profile.name,
    avatar_unit: profile.avatarUnit,
    level: profile.level,
    trophies: profile.trophies,
    gold: profile.gold,
    gems: profile.gems,
    wins: profile.wins,
    losses: profile.losses,
    selected_deck: profile.selectedDeck,
});

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
    online: row.online,
    ready: row.ready,
    role: row.role,
});

const fromInviteRow = (row: ClanInviteRow): ClanInvite => ({
    id: row.id,
    clanId: row.clan_id,
    fromUserId: row.from_user_id,
    toNickname: row.to_nickname,
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
        createdAt: new Date(row.created_at).getTime(),
    };
};

const requireClient = () => supabase;

export async function upsertRemoteProfile(profile: PlayerProfile): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.from('profiles').upsert(toProfileRow(profile), { onConflict: 'id' });
    if (error) return toSupabaseError(`프로필 저장 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function createRemoteClan(profile: PlayerProfile, name: string): Promise<SupabaseResult<ClanRoom>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const clanRow = {
        name,
        owner_id: profile.id,
        invite_code: `CHAOS-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    const { data: clan, error: clanError } = await client.from('clans').insert(clanRow).select('*').single<ClanRow>();
    if (clanError) return toSupabaseError(`클랜 생성 실패: ${clanError.message}`, clanError);

    const { error: memberError } = await client.from('clan_members').upsert({
        clan_id: clan.id,
        profile_id: profile.id,
        nickname: profile.name,
        level: profile.level,
        trophies: profile.trophies,
        role: 'owner',
        online: true,
        ready: true,
    });
    if (memberError) return toSupabaseError(`클랜 멤버 등록 실패: ${memberError.message}`, memberError);

    return { ok: true, data: fromClanRow(clan) };
}

export async function createRemoteInvite(clan: ClanRoom, profile: PlayerProfile, nickname: string): Promise<SupabaseResult<ClanInvite>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data: targetProfile, error: profileError } = await client
        .from('profiles')
        .select('id,nickname')
        .eq('nickname', nickname)
        .maybeSingle<{ id: string; nickname: string }>();
    if (profileError) return toSupabaseError(`초대 대상 확인 실패: ${profileError.message}`, profileError);
    if (!targetProfile) return toSupabaseError(`${nickname} 님은 아직 가입된 유저가 아닙니다.`);

    const { data, error } = await client
        .from('clan_invites')
        .insert({
            clan_id: clan.id,
            from_user_id: profile.id,
            to_nickname: nickname,
            status: 'pending',
        })
        .select('*')
        .single<ClanInviteRow>();
    if (error) return toSupabaseError(`초대 생성 실패: ${error.message}`, error);

    return { ok: true, data: fromInviteRow(data) };
}

export async function cancelRemoteInvite(inviteId: string): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.from('clan_invites').delete().eq('id', inviteId);
    if (error) return toSupabaseError(`초대 취소 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function acceptRemoteInvite(invite: ClanInvite): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data: targetProfile, error: profileError } = await client
        .from('profiles')
        .select('id,nickname,level,trophies')
        .eq('nickname', invite.toNickname)
        .maybeSingle<{ id: string; nickname: string; level: number; trophies: number }>();
    if (profileError) return toSupabaseError(`초대 수락 유저 확인 실패: ${profileError.message}`, profileError);
    if (!targetProfile) return toSupabaseError(`${invite.toNickname} 님의 프로필이 없습니다.`);

    const { error: inviteError } = await client.from('clan_invites').update({ status: 'accepted' }).eq('id', invite.id);
    if (inviteError) return toSupabaseError(`초대 상태 변경 실패: ${inviteError.message}`, inviteError);

    const { error: memberError } = await client.from('clan_members').upsert({
        clan_id: invite.clanId,
        profile_id: targetProfile.id,
        nickname: targetProfile.nickname,
        level: targetProfile.level,
        trophies: targetProfile.trophies,
        role: 'member',
        online: true,
        ready: false,
    });
    if (memberError) return toSupabaseError(`멤버 입장 처리 실패: ${memberError.message}`, memberError);

    return { ok: true, data: null };
}

export async function sendRemoteClanMessage(clan: ClanRoom, profile: PlayerProfile, text: string, type: ClanMessage['type'] = 'chat'): Promise<SupabaseResult<ClanMessage>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data, error } = await client
        .from('clan_messages')
        .insert({
            clan_id: clan.id,
            author_id: profile.id,
            author_name: profile.name,
            text,
            type,
        })
        .select('*')
        .single<ClanMessageRow>();
    if (error) return toSupabaseError(`채팅 전송 실패: ${error.message}`, error);

    return { ok: true, data: fromMessageRow(data) };
}

export async function createRemoteFriendlyRoom(clan: ClanRoom, profile: PlayerProfile, opponent: ClanMember): Promise<SupabaseResult<FriendlyRoom>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const hostTeam: Team = Math.random() > 0.5 ? 'blue' : 'red';
    const guestTeam: Team = hostTeam === 'blue' ? 'red' : 'blue';
    const { data, error } = await client
        .from('friendly_rooms')
        .insert({
            clan_id: clan.id,
            host_user_id: profile.id,
            guest_user_id: opponent.id,
            host_name: profile.name,
            guest_name: opponent.name,
            host_team: hostTeam,
            guest_team: guestTeam,
            status: 'requested',
        })
        .select('*')
        .single<FriendlyRoomRow>();
    if (error) return toSupabaseError(`친선전 요청 실패: ${error.message}`, error);

    return { ok: true, data: fromFriendlyRoomRow(data, profile.id) };
}

export async function acceptRemoteFriendlyRoom(roomId: string): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.from('friendly_rooms').update({ status: 'accepted' }).eq('id', roomId);
    if (error) return toSupabaseError(`친선전 수락 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function updateRemoteFriendlyRoomStatus(
    roomId: string,
    status: FriendlyRoom['status']
): Promise<SupabaseResult<null>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { error } = await client.from('friendly_rooms').update({ status }).eq('id', roomId);
    if (error) return toSupabaseError(`Friendly battle status update failed: ${error.message}`, error);
    return { ok: true, data: null };
}

export async function loadRemoteClanState(profile: PlayerProfile): Promise<SupabaseResult<RemoteClanState>> {
    const client = requireClient();
    if (!client) return disabledResult();

    const { data: membership, error: membershipError } = await client
        .from('clan_members')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle<ClanMemberRow>();
    if (membershipError) return toSupabaseError(`클랜 멤버십 조회 실패: ${membershipError.message}`, membershipError);
    if (!membership) return { ok: true, data: { clan: null, members: [], invites: [], messages: [], friendlyRoom: null } };

    const { data: clan, error: clanError } = await client.from('clans').select('*').eq('id', membership.clan_id).single<ClanRow>();
    if (clanError) return toSupabaseError(`클랜 조회 실패: ${clanError.message}`, clanError);

    const [membersResult, invitesResult, messagesResult, roomsResult] = await Promise.all([
        client.from('clan_members').select('*').eq('clan_id', clan.id).returns<ClanMemberRow[]>(),
        client.from('clan_invites').select('*').eq('clan_id', clan.id).order('created_at', { ascending: false }).returns<ClanInviteRow[]>(),
        client.from('clan_messages').select('*').eq('clan_id', clan.id).order('created_at', { ascending: true }).limit(80).returns<ClanMessageRow[]>(),
        client.from('friendly_rooms').select('*').eq('clan_id', clan.id).in('status', ['requested', 'accepted', 'in_battle']).order('created_at', { ascending: false }).limit(1).returns<FriendlyRoomRow[]>(),
    ]);
    const firstError = membersResult.error ?? invitesResult.error ?? messagesResult.error ?? roomsResult.error;
    if (firstError) return toSupabaseError(`클랜 상태 동기화 실패: ${firstError.message}`, firstError);

    return {
        ok: true,
        data: {
            clan: fromClanRow(clan),
            members: (membersResult.data ?? []).map(fromMemberRow),
            invites: (invitesResult.data ?? []).map(fromInviteRow),
            messages: (messagesResult.data ?? []).map(fromMessageRow),
            friendlyRoom: roomsResult.data?.[0] ? fromFriendlyRoomRow(roomsResult.data[0], profile.id) : null,
        },
    };
}

export function subscribeRemoteClan(clanId: string, onChange: () => void): RealtimeChannel | null {
    const client = requireClient();
    if (!client) return null;

    return client
        .channel(`clan:${clanId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_members', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_invites', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_messages', filter: `clan_id=eq.${clanId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendly_rooms', filter: `clan_id=eq.${clanId}` }, onChange)
        .subscribe();
}

export function unsubscribeRemoteClan(channel: RealtimeChannel | null) {
    if (!channel || !supabase) return;
    void supabase.removeChannel(channel);
}
