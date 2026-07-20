import type {
    ClanInvite,
    ClanMember,
    ClanMessage,
    ClanRoom,
    FriendlyRoom,
    PlayerProfile,
    Team,
} from './types';
export interface LocalClanState {
    clan: ClanRoom | null;
    members: ClanMember[];
    invites: ClanInvite[];
    messages: ClanMessage[];
    friendlyRoom: FriendlyRoom | null;
}

type MemberRecord = {
    clanId: string;
    profileId: string;
    role: 'owner' | 'member';
    ready: boolean;
    joinedAt: number;
};

type StoredFriendlyRoom = Omit<FriendlyRoom, 'localTeam' | 'opponentTeam'> & {
    hostTeam: Team;
    guestTeam: Team;
};

type LocalMultiplayerDatabase = {
    version: 1;
    profiles: Record<string, PlayerProfile>;
    clans: Record<string, ClanRoom>;
    members: MemberRecord[];
    invites: ClanInvite[];
    messages: ClanMessage[];
    rooms: StoredFriendlyRoom[];
};

type LocalResult<T> = { ok: true; data: T } | { ok: false; message: string };

const databaseKey = 'chaos-royale-local-multiplayer-v1';
const broadcastName = 'chaos-royale-local-multiplayer';
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(broadcastName);

channel?.addEventListener('message', () => {
    for (const listener of listeners) listener();
});

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key !== databaseKey) return;
        for (const listener of listeners) listener();
    });
}

export function upsertLocalProfile(profile: PlayerProfile): LocalResult<null> {
    return mutate((database) => {
        const duplicate = Object.values(database.profiles).find(
            (candidate) => candidate.id !== profile.id && candidate.name.toLowerCase() === profile.name.toLowerCase()
        );
        if (duplicate) return fail(`이미 사용 중인 닉네임입니다: ${profile.name}`);
        database.profiles[profile.id] = structuredClone(profile);
        return success(null);
    });
}

export function createLocalClan(profile: PlayerProfile, name: string): LocalResult<ClanRoom> {
    return mutate((database) => {
        if (database.members.some((member) => member.profileId === profile.id)) {
            return fail('이미 가입한 클랜이 있습니다.');
        }
        const clan: ClanRoom = {
            id: crypto.randomUUID(),
            name: name.trim().slice(0, 20) || '카오스 훈련장',
            ownerId: profile.id,
            inviteCode: createInviteCode(database),
            createdAt: Date.now(),
        };
        database.profiles[profile.id] = structuredClone(profile);
        database.clans[clan.id] = clan;
        database.members.push({
            clanId: clan.id,
            profileId: profile.id,
            role: 'owner',
            ready: true,
            joinedAt: Date.now(),
        });
        database.messages.push(createSystemMessage(clan.id, `${clan.name} 클랜이 만들어졌습니다.`));
        return success(clan);
    });
}

export function createLocalInvite(
    clan: ClanRoom,
    profile: PlayerProfile,
    nickname: string
): LocalResult<ClanInvite> {
    return mutate((database) => {
        const target = Object.values(database.profiles).find(
            (candidate) => candidate.name.toLowerCase() === nickname.trim().toLowerCase()
        );
        if (!target) return fail(`${nickname} 님은 아직 등록된 사용자가 아닙니다.`);
        if (target.id === profile.id) return fail('자기 자신은 초대할 수 없습니다.');
        if (database.members.some((member) => member.profileId === target.id)) {
            return fail(`${target.name} 님은 이미 클랜에 가입되어 있습니다.`);
        }
        if (database.invites.some(
            (invite) => invite.clanId === clan.id && invite.toUserId === target.id && invite.status === 'pending'
        )) {
            return fail(`${target.name} 님에게 이미 보낸 초대가 있습니다.`);
        }

        const invite: ClanInvite = {
            id: crypto.randomUUID(),
            clanId: clan.id,
            clanName: clan.name,
            fromUserId: profile.id,
            fromUserName: profile.name,
            toUserId: target.id,
            toNickname: target.name,
            status: 'pending',
            createdAt: Date.now(),
        };
        database.invites.unshift(invite);
        return success(invite);
    });
}

export function cancelLocalInvite(inviteId: string, actorId: string): LocalResult<null> {
    return mutate((database) => {
        const invite = database.invites.find((candidate) => candidate.id === inviteId);
        if (!invite || invite.status !== 'pending') return fail('취소할 초대를 찾을 수 없습니다.');
        if (invite.fromUserId !== actorId) return fail('초대를 보낸 사용자만 취소할 수 있습니다.');
        database.invites = database.invites.filter((candidate) => candidate.id !== inviteId);
        return success(null);
    });
}

export function acceptLocalInvite(inviteId: string, actorId: string): LocalResult<null> {
    return mutate((database) => {
        const invite = database.invites.find((candidate) => candidate.id === inviteId);
        if (!invite || invite.status !== 'pending') return fail('수락할 초대를 찾을 수 없습니다.');
        if (invite.toUserId !== actorId) return fail('초대받은 사용자만 수락할 수 있습니다.');
        if (database.members.some((member) => member.profileId === actorId)) {
            return fail('이미 가입한 클랜이 있습니다.');
        }
        invite.status = 'accepted';
        database.members.push({
            clanId: invite.clanId,
            profileId: actorId,
            role: 'member',
            ready: false,
            joinedAt: Date.now(),
        });
        database.messages.push(createSystemMessage(invite.clanId, `${invite.toNickname} 님이 클랜에 가입했습니다.`));
        return success(null);
    });
}

export function declineLocalInvite(inviteId: string, actorId: string): LocalResult<null> {
    return mutate((database) => {
        const invite = database.invites.find((candidate) => candidate.id === inviteId);
        if (!invite || invite.status !== 'pending') return fail('거절할 초대를 찾을 수 없습니다.');
        if (invite.toUserId !== actorId) return fail('초대받은 사용자만 거절할 수 있습니다.');
        invite.status = 'declined';
        return success(null);
    });
}

export function removeLocalMember(clanId: string, memberId: string, actorId: string): LocalResult<null> {
    return mutate((database) => {
        const clan = database.clans[clanId];
        if (!clan || clan.ownerId !== actorId) return fail('클랜장만 멤버를 내보낼 수 있습니다.');
        if (memberId === actorId) return fail('클랜장은 자신을 내보낼 수 없습니다.');
        database.members = database.members.filter(
            (member) => !(member.clanId === clanId && member.profileId === memberId)
        );
        database.rooms = database.rooms.filter(
            (room) => room.hostUserId !== memberId && room.guestUserId !== memberId
        );
        const profile = database.profiles[memberId];
        if (profile) database.messages.push(createSystemMessage(clanId, `${profile.name} 님이 클랜에서 나갔습니다.`));
        return success(null);
    });
}

export function leaveLocalClan(actorId: string): LocalResult<null> {
    return mutate((database) => {
        const membership = database.members.find((member) => member.profileId === actorId);
        if (!membership) return fail('가입한 클랜이 없습니다.');
        const clan = database.clans[membership.clanId];
        if (!clan) return fail('클랜 데이터를 찾을 수 없습니다.');
        const clanMembers = database.members.filter((member) => member.clanId === clan.id);
        if (membership.role === 'owner') {
            if (clanMembers.length > 1) return fail('클랜장은 다른 멤버를 내보낸 뒤 클랜을 해체할 수 있습니다.');
            delete database.clans[clan.id];
            database.members = database.members.filter((member) => member.clanId !== clan.id);
            database.invites = database.invites.filter((invite) => invite.clanId !== clan.id);
            database.messages = database.messages.filter((message) => !message.id.startsWith(`${clan.id}:`));
            database.rooms = database.rooms.filter((room) => room.hostUserId !== actorId && room.guestUserId !== actorId);
            return success(null);
        }

        database.members = database.members.filter(
            (member) => !(member.clanId === clan.id && member.profileId === actorId)
        );
        const profile = database.profiles[actorId];
        if (profile) database.messages.push(createSystemMessage(clan.id, `${profile.name} 님이 클랜을 떠났습니다.`));
        database.rooms = database.rooms.filter((room) => room.hostUserId !== actorId && room.guestUserId !== actorId);
        return success(null);
    });
}

export function sendLocalClanMessage(
    clan: ClanRoom,
    profile: PlayerProfile,
    text: string,
    type: ClanMessage['type'] = 'chat'
): LocalResult<ClanMessage> {
    return mutate((database) => {
        const isMember = database.members.some(
            (member) => member.clanId === clan.id && member.profileId === profile.id
        );
        if (!isMember) return fail('클랜 멤버만 메시지를 보낼 수 있습니다.');
        const cleanText = text.trim().slice(0, 300);
        if (!cleanText) return fail('메시지를 입력하세요.');
        const message: ClanMessage = {
            id: `${clan.id}:${crypto.randomUUID()}`,
            authorId: profile.id,
            authorName: profile.name,
            text: cleanText,
            type,
            createdAt: Date.now(),
        };
        database.messages.push({ ...message, text: cleanText });
        return success(message);
    }, clan.id);
}

export function createLocalFriendlyRoom(
    clan: ClanRoom,
    profile: PlayerProfile,
    opponent: ClanMember
): LocalResult<FriendlyRoom> {
    return mutate((database) => {
        const activeStatuses: FriendlyRoom['status'][] = ['requested', 'accepted', 'starting', 'in_battle'];
        const conflict = database.rooms.some((room) =>
            activeStatuses.includes(room.status)
            && [room.hostUserId, room.guestUserId].some((id) => id === profile.id || id === opponent.id)
        );
        if (conflict) return fail('두 사용자 중 한 명이 이미 다른 친선전에 참가 중입니다.');
        if (!database.members.some((member) => member.clanId === clan.id && member.profileId === opponent.id)) {
            return fail('같은 클랜의 멤버만 친선전에 초대할 수 있습니다.');
        }

        const hostTeam: Team = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'blue' : 'red';
        const guestTeam: Team = hostTeam === 'blue' ? 'red' : 'blue';
        const room: StoredFriendlyRoom = {
            id: crypto.randomUUID(),
            hostUserId: profile.id,
            guestUserId: opponent.id,
            hostName: profile.name,
            guestName: opponent.name,
            hostTeam,
            guestTeam,
            status: 'requested',
            hostReady: true,
            guestReady: false,
            revision: 1,
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
        };
        database.rooms.unshift(room);
        database.messages.push(createSystemMessage(clan.id, `${profile.name} 님이 ${opponent.name} 님에게 친선전을 요청했습니다.`));
        return success(toFriendlyRoom(room, profile.id));
    });
}

export function updateLocalFriendlyRoom(
    roomId: string,
    actorId: string,
    nextStatus: FriendlyRoom['status']
): LocalResult<FriendlyRoom> {
    return mutate((database) => {
        const room = database.rooms.find((candidate) => candidate.id === roomId);
        if (!room) return fail('친선전 방을 찾을 수 없습니다.');
        if (actorId !== room.hostUserId && actorId !== room.guestUserId) return fail('방 참가자만 상태를 변경할 수 있습니다.');
        if ((room.expiresAt ?? 0) <= Date.now() && !['finished', 'declined', 'canceled', 'expired'].includes(room.status)) {
            room.status = 'expired';
            return fail('친선전 요청 시간이 만료되었습니다.');
        }
        const allowed = allowedRoomTransitions(room, actorId);
        if (!allowed.includes(nextStatus)) return fail(`${room.status} 상태에서는 ${nextStatus}(으)로 변경할 수 없습니다.`);

        room.status = nextStatus;
        room.revision = (room.revision ?? 0) + 1;
        if (nextStatus === 'accepted') room.guestReady = true;
        return success(toFriendlyRoom(room, actorId));
    });
}

export function loadLocalClanState(profile: PlayerProfile): LocalResult<LocalClanState> {
    const database = readDatabase();
    const membership = database.members.find((member) => member.profileId === profile.id);
    const incomingInvites = database.invites.filter(
        (invite) => invite.toUserId === profile.id && invite.status === 'pending'
    );
    if (!membership) {
        return success({
            clan: null,
            members: [],
            invites: incomingInvites,
            messages: [],
            friendlyRoom: findActiveRoom(database, profile.id),
        });
    }

    const clan = database.clans[membership.clanId] ?? null;
    if (!clan) return fail('클랜 데이터가 손상되었습니다.');
    const members = database.members
        .filter((member) => member.clanId === clan.id)
        .map((member): ClanMember | null => {
            const memberProfile = database.profiles[member.profileId];
            if (!memberProfile) return null;
            return {
                id: memberProfile.id,
                name: memberProfile.name,
                level: memberProfile.level,
                trophies: memberProfile.trophies,
                online: true,
                ready: member.ready,
                role: member.role,
            };
        })
        .filter((member): member is ClanMember => member !== null);

    const invites = database.invites.filter(
        (invite) => invite.clanId === clan.id || (invite.toUserId === profile.id && invite.status === 'pending')
    );
    const messages = database.messages.filter((message) => message.id.startsWith(`${clan.id}:`)).slice(-80);
    return success({
        clan,
        members,
        invites,
        messages,
        friendlyRoom: findActiveRoom(database, profile.id),
    });
}

export function subscribeLocalMultiplayer(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

function findActiveRoom(database: LocalMultiplayerDatabase, userId: string): FriendlyRoom | null {
    const room = database.rooms.find(
        (candidate) =>
            !['finished', 'declined', 'canceled', 'expired'].includes(candidate.status)
            && (candidate.hostUserId === userId || candidate.guestUserId === userId)
    );
    return room ? toFriendlyRoom(room, userId) : null;
}

function toFriendlyRoom(room: StoredFriendlyRoom, localUserId: string): FriendlyRoom {
    const isHost = room.hostUserId === localUserId;
    return {
        id: room.id,
        hostUserId: room.hostUserId,
        guestUserId: room.guestUserId,
        hostName: room.hostName,
        guestName: room.guestName,
        localTeam: isHost ? room.hostTeam : room.guestTeam,
        opponentTeam: isHost ? room.guestTeam : room.hostTeam,
        status: room.status,
        hostReady: room.hostReady,
        guestReady: room.guestReady,
        revision: room.revision,
        expiresAt: room.expiresAt,
        createdAt: room.createdAt,
    };
}

function allowedRoomTransitions(room: StoredFriendlyRoom, actorId: string): FriendlyRoom['status'][] {
    if (room.status === 'requested') {
        return actorId === room.guestUserId ? ['accepted', 'declined'] : ['canceled'];
    }
    if (room.status === 'accepted') {
        return actorId === room.hostUserId ? ['starting', 'canceled'] : ['canceled'];
    }
    if (room.status === 'starting') return actorId === room.hostUserId ? ['in_battle', 'canceled'] : ['canceled'];
    if (room.status === 'in_battle') return ['finished', 'canceled'];
    return [];
}

function createInviteCode(database: LocalMultiplayerDatabase): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = `CHAOS-${Math.floor(1000 + Math.random() * 9000)}`;
        if (!Object.values(database.clans).some((clan) => clan.inviteCode === code)) return code;
    }
    return `CHAOS-${Date.now().toString().slice(-6)}`;
}

function createSystemMessage(clanId: string, text: string): ClanMessage {
    return {
        id: `${clanId}:${crypto.randomUUID()}`,
        authorId: 'system',
        authorName: '시스템',
        text,
        type: 'system',
        createdAt: Date.now(),
    };
}

function readDatabase(): LocalMultiplayerDatabase {
    if (typeof window === 'undefined') return emptyDatabase();
    try {
        const raw = window.localStorage.getItem(databaseKey);
        if (!raw) return emptyDatabase();
        const parsed = JSON.parse(raw) as LocalMultiplayerDatabase;
        return parsed.version === 1 ? parsed : emptyDatabase();
    } catch {
        return emptyDatabase();
    }
}

function writeDatabase(database: LocalMultiplayerDatabase): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(databaseKey, JSON.stringify(database));
    channel?.postMessage({ type: 'changed', at: Date.now() });
    for (const listener of listeners) listener();
}

function mutate<T>(
    operation: (database: LocalMultiplayerDatabase) => LocalResult<T>,
    clanIdForMessage?: string
): LocalResult<T> {
    const database = readDatabase();
    const result = operation(database);
    if (result.ok) {
        if (clanIdForMessage && database.messages.length > 200) {
            database.messages = database.messages.filter((message) => message.id.startsWith(`${clanIdForMessage}:`)).slice(-120);
        }
        writeDatabase(database);
    }
    return result;
}

function emptyDatabase(): LocalMultiplayerDatabase {
    return {
        version: 1,
        profiles: {},
        clans: {},
        members: [],
        invites: [],
        messages: [],
        rooms: [],
    };
}

function success<T>(data: T): LocalResult<T> {
    return { ok: true, data };
}

function fail<T>(message: string): LocalResult<T> {
    return { ok: false, message };
}
