import { UNIT_FACTIONS, UNIT_TYPES } from '../data/UnitData';
import type { PlayerProfile } from './types';

export const MAX_DECK_SIZE = 8;

export function sanitizeDeck(deck: string[]): string[] {
    const validKeys = new Set(
        Object.keys(UNIT_TYPES).filter((key) => UNIT_FACTIONS[key] && !UNIT_FACTIONS[key].isHidden)
    );
    return [...new Set(deck.filter((key) => validKeys.has(key)))].slice(0, MAX_DECK_SIZE);
}

export function sanitizeProfile(profile: PlayerProfile): PlayerProfile {
    return {
        ...profile,
        name: profile.name.trim().slice(0, 16) || '카오스로드',
        level: clampInteger(profile.level, 1, 100),
        trophies: clampInteger(profile.trophies, 0, 100000),
        gold: clampInteger(profile.gold, 0, 999999999),
        gems: clampInteger(profile.gems, 0, 999999999),
        wins: clampInteger(profile.wins, 0, 999999999),
        losses: clampInteger(profile.losses, 0, 999999999),
        selectedDeck: sanitizeDeck(profile.selectedDeck),
        profileComplete: profile.profileComplete ?? true,
    };
}

function clampInteger(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));
}
