import { isSupabaseConfigured, supabase, toSupabaseError, type SupabaseResult } from './supabaseClient';
import { sanitizeProfile } from './profileRules';
import type { PlayerProfile } from './types';

const profileCachePrefix = 'chaos-royale-profile-v1';

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
    profile_complete: boolean;
};

const cacheKey = (userId: string) => `${profileCachePrefix}:${userId}`;

export function loadCachedProfile(fallback: PlayerProfile): PlayerProfile {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(cacheKey(fallback.id));
        if (!raw) return fallback;
        return sanitizeProfile({ ...fallback, ...(JSON.parse(raw) as Partial<PlayerProfile>) });
    } catch {
        return fallback;
    }
}

export function saveCachedProfile(profile: PlayerProfile): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(cacheKey(profile.id), JSON.stringify(sanitizeProfile(profile)));
}

export async function loadProfile(profile: PlayerProfile): Promise<SupabaseResult<PlayerProfile>> {
    const cached = loadCachedProfile(profile);
    if (!isSupabaseConfigured || !supabase) return { ok: true, data: cached };

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return toSupabaseError('로그인 세션이 필요합니다.');

    const { data, error } = await supabase
        .from('profiles')
        .select('id,nickname,avatar_unit,level,trophies,gold,gems,wins,losses,selected_deck,profile_complete')
        .eq('id', sessionData.session.user.id)
        .maybeSingle<ProfileRow>();
    if (error) return toSupabaseError(`프로필 조회 실패: ${error.message}`, error);

    let row = data;
    if (!row) {
        const { data: ensured, error: ensureError } = await supabase.rpc('ensure_own_profile');
        if (ensureError || !ensured) {
            return toSupabaseError(`프로필 초기화 실패: ${ensureError?.message ?? '응답 없음'}`, ensureError);
        }
        row = (Array.isArray(ensured) ? ensured[0] : ensured) as ProfileRow;
    }

    const loaded = profileFromRow(row);
    if (loaded.profileComplete === false && loaded.selectedDeck.length === 0) {
        loaded.selectedDeck = cached.selectedDeck;
    }
    saveCachedProfile(loaded);
    return { ok: true, data: loaded };
}

export async function saveProfile(profile: PlayerProfile): Promise<SupabaseResult<PlayerProfile>> {
    const clean = sanitizeProfile(profile);
    if (!isSupabaseConfigured || !supabase) {
        saveCachedProfile(clean);
        return { ok: true, data: clean };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return toSupabaseError('로그인 세션이 필요합니다.');

    const authenticatedProfile = { ...clean, id: sessionData.session.user.id };
    const { data, error } = await supabase.rpc('update_own_profile', {
        profile_nickname: authenticatedProfile.name,
        profile_avatar_unit: authenticatedProfile.avatarUnit,
        profile_selected_deck: authenticatedProfile.selectedDeck,
    });
    if (error || !data) {
        const duplicate = error?.code === '23505' || error?.message.toLowerCase().includes('nickname already exists');
        return toSupabaseError(
            duplicate ? '이미 사용 중인 닉네임입니다.' : `프로필 저장 실패: ${error?.message ?? '응답 없음'}`,
            error,
        );
    }

    const saved = profileFromRow((Array.isArray(data) ? data[0] : data) as ProfileRow);
    saveCachedProfile(saved);
    return { ok: true, data: saved };
}

function profileFromRow(row: ProfileRow): PlayerProfile {
    return sanitizeProfile({
        id: row.id,
        name: row.nickname,
        avatarUnit: row.avatar_unit,
        level: row.level,
        trophies: row.trophies,
        gold: row.gold,
        gems: row.gems,
        wins: row.wins,
        losses: row.losses,
        selectedDeck: row.selected_deck,
        profileComplete: row.profile_complete,
    });
}
