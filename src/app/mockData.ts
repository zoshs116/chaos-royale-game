import { UNIT_FACTIONS, UNIT_TYPES } from '../data/UnitData';
import type { ClanMember, ClanMessage, ClanRoom, PlayerProfile } from './types';

export const DEFAULT_DECK = ['skeleton_swordsman', 'spear_goblin', 'royal_giant', 'hog_rider', 'duckxel_barbarian', 'duckxel_sword_man', 'stone_cold', 'darae'];

export const DEFAULT_PROFILE: PlayerProfile = {
    id: 'local-user-1',
    name: '카오스로드',
    level: 12,
    trophies: 4580,
    gold: 12500,
    gems: 320,
    wins: 142,
    losses: 38,
    avatarUnit: 'stone_cold',
    selectedDeck: DEFAULT_DECK,
};

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
    Object.keys(UNIT_TYPES).filter((key) => UNIT_FACTIONS[key] && !UNIT_FACTIONS[key].isHidden);

export const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
};
