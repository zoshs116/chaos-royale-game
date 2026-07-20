import type { BattlePlayerConfig, BattleTeam } from '../../match-simulator/src/AuthoritativeBattleRoom';

interface FriendlyRoomAuthRow {
    id: string;
    host_user_id: string;
    guest_user_id: string;
    host_team: BattleTeam;
    guest_team: BattleTeam;
    status: string;
}

interface ProfileDeckRow {
    selected_deck: unknown;
}

interface SupabaseUserRow {
    id: string;
}

export interface BattleJoinClaim {
    roomId: string;
    token?: string;
    player: BattlePlayerConfig;
}

export interface BattleJoinVerification {
    player: BattlePlayerConfig;
    source: 'supabase' | 'development';
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY
    ?? '';

export async function verifyBattleJoin(
    claim: BattleJoinClaim,
    options: { production: boolean; developmentToken: string },
): Promise<BattleJoinVerification> {
    if (options.developmentToken && claim.token === options.developmentToken && !options.production) {
        return { player: sanitizeDevelopmentPlayer(claim.player), source: 'development' };
    }

    if (!supabaseUrl || !supabaseKey) {
        if (options.production) throw new Error('server Supabase authentication is not configured');
        if (options.developmentToken) throw new Error('invalid development token');
        return { player: sanitizeDevelopmentPlayer(claim.player), source: 'development' };
    }
    if (!claim.token) throw new Error('battle access token is required');

    const user = await fetchSingle<SupabaseUserRow>(`${supabaseUrl}/auth/v1/user`, claim.token);
    if (!user?.id || user.id !== claim.player.playerId) throw new Error('battle identity does not match session');

    const roomRows = await fetchRows<FriendlyRoomAuthRow>(
        `${supabaseUrl}/rest/v1/friendly_rooms?id=eq.${encodeURIComponent(claim.roomId)}&select=id,host_user_id,guest_user_id,host_team,guest_team,status`,
        claim.token,
    );
    const room = roomRows[0];
    if (!room || !['accepted', 'starting', 'in_battle'].includes(room.status)) {
        throw new Error('friendly room is not ready');
    }

    const team = room.host_user_id === user.id
        ? room.host_team
        : room.guest_user_id === user.id
            ? room.guest_team
            : null;
    if (!team) throw new Error('user is not a participant in this friendly room');

    const profiles = await fetchRows<ProfileDeckRow>(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=selected_deck`,
        claim.token,
    );
    const deck = normalizeDeck(profiles[0]?.selected_deck);
    if (deck.length < 1) throw new Error('saved deck is empty');

    return {
        source: 'supabase',
        player: { playerId: user.id, team, deck },
    };
}

async function fetchRows<T>(url: string, token: string): Promise<T[]> {
    const response = await fetch(url, {
        headers: {
            apikey: supabaseKey,
            authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) throw new Error(`Supabase battle authorization failed (${response.status})`);
    return await response.json() as T[];
}

async function fetchSingle<T>(url: string, token: string): Promise<T | null> {
    const response = await fetch(url, {
        headers: {
            apikey: supabaseKey,
            authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) throw new Error(`Supabase session verification failed (${response.status})`);
    return await response.json() as T;
}

function sanitizeDevelopmentPlayer(player: BattlePlayerConfig): BattlePlayerConfig {
    return {
        playerId: String(player.playerId),
        team: player.team === 'red' ? 'red' : 'blue',
        deck: normalizeDeck(player.deck),
    };
}

function normalizeDeck(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        .slice(0, 8);
}
