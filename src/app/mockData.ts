import { UNIT_FACTIONS, UNIT_TYPES } from '../data/UnitData';
import { DUCKXEL_UNIT_KEYS, isDuckxelAssetUnit } from '../data/DuckxelAnimationCatalog';
import { resolveDevelopmentIdentity } from './identity';
import type { ClanMember, ClanMessage, ClanRoom, PlayerProfile } from './types';

export const DEFAULT_DECK = [...DUCKXEL_UNIT_KEYS];
const developmentIdentity = resolveDevelopmentIdentity();

export const DEFAULT_PROFILE: PlayerProfile = {
    id: developmentIdentity.userId,
    name: developmentIdentity.userId.startsWith('22222222') ? '카오스로드B' : '카오스로드',
    level: 12,
    trophies: 0,
    gold: 0,
    gems: 0,
    wins: 0,
    losses: 0,
    avatarUnit: 'stone_cold',
    selectedDeck: DEFAULT_DECK,
    profileComplete: true,
};

export function createDefaultProfile(id: string, name = '카오스로드'): PlayerProfile {
    return {
        id,
        name,
        level: 1,
        trophies: 0,
        gold: 0,
        gems: 0,
        wins: 0,
        losses: 0,
        avatarUnit: 'stone_cold',
        selectedDeck: [...DEFAULT_DECK],
        profileComplete: false,
    };
}

export const DEFAULT_CLAN: ClanRoom = {
    id: 'clan-local-training',
    name: '카오스 훈련장',
    ownerId: DEFAULT_PROFILE.id,
    inviteCode: 'CHAOS-4580',
    createdAt: Date.now() - 86400000,
};

export const SELF_CLAN_MEMBER: ClanMember = {
    id: DEFAULT_PROFILE.id,
    name: DEFAULT_PROFILE.name,
    level: DEFAULT_PROFILE.level,
    trophies: DEFAULT_PROFILE.trophies,
    online: true,
    ready: true,
    role: 'owner',
};

export const INITIAL_CLAN_MESSAGES: ClanMessage[] = [
    {
        id: 'msg-1',
        authorId: 'system',
        authorName: '시스템',
        text: '클랜을 만들면 친구를 초대하고, 초대가 수락된 멤버와 채팅 및 친선전을 할 수 있습니다.',
        createdAt: Date.now() - 120000,
        type: 'system',
    },
];

export const visibleUnitKeys = () =>
    Object.keys(UNIT_TYPES).filter((key) => (
        UNIT_FACTIONS[key]
        && !UNIT_FACTIONS[key].isHidden
        && isDuckxelAssetUnit(key)
    ));

export const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
};
