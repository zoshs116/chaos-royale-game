export type AppRoute = 'loading' | 'login' | 'profile' | 'lobby' | 'deck' | 'clan' | 'battle' | 'result';

export type Team = 'blue' | 'red';
export type ResultWinner = Team | 'draw';

export interface PlayerProfile {
    id: string;
    name: string;
    level: number;
    trophies: number;
    gold: number;
    gems: number;
    wins: number;
    losses: number;
    avatarUnit: string;
    selectedDeck: string[];
    profileComplete?: boolean;
}

export interface ClanRoom {
    id: string;
    name: string;
    ownerId: string;
    inviteCode: string;
    createdAt: number;
}

export interface ClanMember {
    id: string;
    name: string;
    level: number;
    trophies: number;
    online: boolean;
    ready: boolean;
    role?: 'owner' | 'member' | 'guest';
}

export interface ClanInvite {
    id: string;
    clanId: string;
    fromUserId: string;
    fromUserName?: string;
    toUserId?: string;
    toNickname: string;
    clanName?: string;
    status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
    createdAt: number;
}

export interface ClanMessage {
    id: string;
    authorId: string;
    authorName: string;
    text: string;
    createdAt: number;
    type: 'chat' | 'friendly_request' | 'system';
}

export interface FriendlyRoom {
    id: string;
    hostUserId: string;
    guestUserId: string | null;
    hostName: string;
    guestName: string | null;
    localTeam: Team;
    opponentTeam: Team;
    status: 'waiting' | 'requested' | 'accepted' | 'starting' | 'in_battle' | 'finished' | 'declined' | 'canceled' | 'expired';
    hostReady?: boolean;
    guestReady?: boolean;
    revision?: number;
    expiresAt?: number;
    createdAt: number;
}

export interface BattleResult {
    winner: ResultWinner;
    blueCrowns: number;
    redCrowns: number;
    playerName: string;
    opponentName: string;
    arenaName: string;
}

export interface BattleLaunchContext {
    mode: 'solo' | 'friendly';
    roomId?: string;
    playerId?: string;
    localTeam: Team;
    opponentName: string;
}

export interface AppState {
    route: AppRoute;
    isAuthenticated: boolean;
    profile: PlayerProfile;
    clan: ClanRoom | null;
    clanMembers: ClanMember[];
    clanInvites: ClanInvite[];
    clanMessages: ClanMessage[];
    friendlyRoom: FriendlyRoom | null;
    result: BattleResult | null;
}
