import { CONSTANTS } from '../systems/Constants';

export type DuckxelBattleUnitKey =
    | 'duckxel_sword_man'
    | 'duckxel_barbarian'
    | 'spear_goblin'
    | 'skeleton_swordsman'
    | 'royal_giant'
    | 'hog_rider'
    | 'duckxel_muradin';

export type TargetPolicy = 'any-nearest' | 'building-only';
export type DuckxelBattleBehavior = 'melee-combat' | 'ranged-combat' | 'building-ranged' | 'building-jump';
export type DuckxelMovementRoute = 'ground-bridge' | 'river-jump' | 'air-direct';

export interface DuckxelTargetMask {
    units: boolean;
    towers: boolean;
    ground: boolean;
    air: boolean;
}

export interface DuckxelBattleProfile {
    unitKey: DuckxelBattleUnitKey;
    behavior: DuckxelBattleBehavior;
    displaySize: number;
    collisionRadius: number;
    collisionMass: number;
    movement: {
        route: DuckxelMovementRoute;
        canChangeLane: boolean;
        jumpSpeed?: number;
        jumpCooldown?: number;
        jumpLandingOffset?: number;
    };
    hpBar: {
        width: number;
        y: number;
    };
    shadow: {
        width: number;
        height: number;
        y: number;
        alpha: number;
    };
    targeting: {
        policy: TargetPolicy;
        mask: DuckxelTargetMask;
        fallback: 'crown-tower' | 'none';
        sightMin: number;
        sightMax: number;
        sameLanePenalty: number;
        crossLaneCloseRange: number;
        bridgeCrossLaneAllowed: boolean;
        bridgeEngagementRange: number;
        lockDuration: number;
        scanInterval: number;
        switchAdvantage: number;
    };
    attack: {
        frameDuration: number;
        hitFrame: number;
        rangePadding: number;
        projectileForward?: number;
        projectileLift?: number;
        projectileSpeed?: number;
        splashRadius?: number;
        recoilDistance?: number;
    };
    timing: {
        deployDelay: number;
        acquisitionDelay: number;
        firstHitDelay: number;
    };
    tracking: {
        attackExitPadding: number;
        leashDistance: number;
        returnToLaneDelay: number;
    };
    reaction?: {
        retargetOnHit: boolean;
    };
    spawn?: {
        count: number;
        formation: Array<{ x: number; y: number }>;
    };
    tuning?: {
        speedMultiplier?: number;
        attackIntervalMultiplier?: number;
    };
}

const triangle3 = [
    { x: 0, y: -13 },
    { x: -15, y: 11 },
    { x: 15, y: 11 },
];

const skeletonSwarm13 = [
    { x: 0, y: 0 },
    { x: -10, y: -9 },
    { x: 10, y: -9 },
    { x: -20, y: -19 },
    { x: 0, y: -19 },
    { x: 20, y: -19 },
    { x: -28, y: -30 },
    { x: -10, y: -32 },
    { x: 10, y: -32 },
    { x: 28, y: -30 },
    { x: -18, y: -44 },
    { x: 0, y: -46 },
    { x: 18, y: -44 },
];

const baseAnyTargeting = {
    policy: 'any-nearest' as const,
    mask: { units: true, towers: true, ground: true, air: false },
    fallback: 'crown-tower' as const,
    sightMin: 90,
    sightMax: 285,
    sameLanePenalty: 140,
    crossLaneCloseRange: 64,
    bridgeCrossLaneAllowed: true,
    bridgeEngagementRange: 92,
    lockDuration: 430,
    scanInterval: 320,
    switchAdvantage: 18,
};

const buildingTargeting = {
    policy: 'building-only' as const,
    mask: { units: false, towers: true, ground: true, air: false },
    fallback: 'crown-tower' as const,
    sightMin: 110,
    sightMax: 390,
    sameLanePenalty: 140,
    crossLaneCloseRange: 52,
    bridgeCrossLaneAllowed: false,
    bridgeEngagementRange: 0,
    lockDuration: 520,
    scanInterval: 420,
    switchAdvantage: 28,
};

const combatReaction = {
    retargetOnHit: true,
};

const meleeTiming = {
    deployDelay: CONSTANTS.GAMEPLAY.SPAWN_DELAY,
    acquisitionDelay: 90,
    firstHitDelay: 180,
};

const meleeTracking = {
    attackExitPadding: 9,
    leashDistance: 220,
    returnToLaneDelay: 560,
};

export const DUCKXEL_BATTLE_PROFILES: Record<DuckxelBattleUnitKey, DuckxelBattleProfile> = {
    duckxel_sword_man: {
        unitKey: 'duckxel_sword_man',
        behavior: 'melee-combat',
        displaySize: 62,
        collisionRadius: 13,
        collisionMass: 1.2,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 24, y: -17 },
        shadow: { width: 18, height: 7, y: 9, alpha: 0.28 },
        targeting: baseAnyTargeting,
        attack: { frameDuration: 90, hitFrame: 2, rangePadding: 18 },
        timing: meleeTiming,
        tracking: meleeTracking,
        reaction: combatReaction,
    },
    duckxel_barbarian: {
        unitKey: 'duckxel_barbarian',
        behavior: 'melee-combat',
        displaySize: 62,
        collisionRadius: 13,
        collisionMass: 1.25,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 24, y: -17 },
        shadow: { width: 18, height: 7, y: 9, alpha: 0.28 },
        targeting: baseAnyTargeting,
        attack: { frameDuration: 90, hitFrame: 2, rangePadding: 18 },
        timing: meleeTiming,
        tracking: meleeTracking,
        reaction: combatReaction,
    },
    duckxel_muradin: {
        unitKey: 'duckxel_muradin',
        behavior: 'melee-combat',
        displaySize: 68,
        collisionRadius: 14,
        collisionMass: 1.8,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 27, y: -21 },
        shadow: { width: 21, height: 8, y: 10, alpha: 0.28 },
        targeting: baseAnyTargeting,
        attack: { frameDuration: 100, hitFrame: 2, rangePadding: 18 },
        timing: meleeTiming,
        tracking: meleeTracking,
        reaction: combatReaction,
    },
    spear_goblin: {
        unitKey: 'spear_goblin',
        behavior: 'ranged-combat',
        displaySize: 42,
        collisionRadius: 6,
        collisionMass: 0.72,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 18, y: -15 },
        shadow: { width: 13, height: 5, y: 8, alpha: 0.24 },
        targeting: {
            ...baseAnyTargeting,
            sightMax: 310,
            sameLanePenalty: 125,
            crossLaneCloseRange: 74,
        },
        attack: { frameDuration: 75, hitFrame: 1, rangePadding: 10, projectileForward: 13, projectileLift: 10, projectileSpeed: 390 },
        timing: { deployDelay: CONSTANTS.GAMEPLAY.SPAWN_DELAY, acquisitionDelay: 90, firstHitDelay: 260 },
        tracking: { attackExitPadding: 14, leashDistance: 250, returnToLaneDelay: 520 },
        reaction: combatReaction,
        spawn: { count: 3, formation: triangle3 },
    },
    skeleton_swordsman: {
        unitKey: 'skeleton_swordsman',
        behavior: 'melee-combat',
        displaySize: 24,
        collisionRadius: 4,
        collisionMass: 0.45,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 16, y: -13 },
        shadow: { width: 9, height: 4, y: 6, alpha: 0.2 },
        targeting: {
            ...baseAnyTargeting,
            sightMax: 225,
            crossLaneCloseRange: 48,
        },
        attack: { frameDuration: 78, hitFrame: 1, rangePadding: 14 },
        timing: { deployDelay: CONSTANTS.GAMEPLAY.SPAWN_DELAY, acquisitionDelay: 70, firstHitDelay: 120 },
        tracking: { attackExitPadding: 7, leashDistance: 180, returnToLaneDelay: 480 },
        reaction: combatReaction,
        spawn: { count: 13, formation: skeletonSwarm13 },
    },
    royal_giant: {
        unitKey: 'royal_giant',
        behavior: 'building-ranged',
        displaySize: 92,
        collisionRadius: 18,
        collisionMass: 4,
        movement: { route: 'ground-bridge', canChangeLane: true },
        hpBar: { width: 32, y: -28 },
        shadow: { width: 28, height: 10, y: 12, alpha: 0.3 },
        targeting: buildingTargeting,
        attack: { frameDuration: 90, hitFrame: 1, rangePadding: 12, projectileForward: 16, projectileLift: 8, projectileSpeed: 260, recoilDistance: 9 },
        timing: { deployDelay: CONSTANTS.GAMEPLAY.SPAWN_DELAY, acquisitionDelay: 120, firstHitDelay: 400 },
        tracking: { attackExitPadding: 18, leashDistance: 0, returnToLaneDelay: 0 },
        tuning: { speedMultiplier: 0.64, attackIntervalMultiplier: 1.35 },
    },
    hog_rider: {
        unitKey: 'hog_rider',
        behavior: 'building-jump',
        displaySize: 68,
        collisionRadius: 14,
        collisionMass: 2.1,
        movement: { route: 'river-jump', canChangeLane: true, jumpSpeed: 116, jumpCooldown: 850, jumpLandingOffset: 24 },
        hpBar: { width: 26, y: -20 },
        shadow: { width: 22, height: 8, y: 10, alpha: 0.28 },
        targeting: buildingTargeting,
        attack: { frameDuration: 88, hitFrame: 2, rangePadding: 18 },
        timing: { deployDelay: CONSTANTS.GAMEPLAY.SPAWN_DELAY, acquisitionDelay: 80, firstHitDelay: 240 },
        tracking: { attackExitPadding: 10, leashDistance: 0, returnToLaneDelay: 0 },
        tuning: { speedMultiplier: 0.72, attackIntervalMultiplier: 1.35 },
    },
};

export function getDuckxelBattleProfile(unitKey: string): DuckxelBattleProfile | null {
    return DUCKXEL_BATTLE_PROFILES[unitKey as DuckxelBattleUnitKey] ?? null;
}

export function validateDuckxelBattleProfiles(): string[] {
    const errors: string[] = [];
    for (const [unitKey, profile] of Object.entries(DUCKXEL_BATTLE_PROFILES)) {
        if (profile.unitKey !== unitKey) errors.push(`${unitKey}: unitKey mismatch`);
        if (profile.displaySize <= 0) errors.push(`${unitKey}: displaySize must be positive`);
        if (profile.collisionRadius <= 0) errors.push(`${unitKey}: collisionRadius must be positive`);
        if (profile.collisionMass <= 0) errors.push(`${unitKey}: collisionMass must be positive`);
        if (profile.targeting.sightMin < 0 || profile.targeting.sightMax < profile.targeting.sightMin) {
            errors.push(`${unitKey}: invalid sight range`);
        }
        if (!profile.targeting.mask.units && !profile.targeting.mask.towers) {
            errors.push(`${unitKey}: target mask has no valid target kind`);
        }
        if (profile.targeting.policy === 'building-only' && profile.targeting.mask.units) {
            errors.push(`${unitKey}: building-only profile cannot target units`);
        }
        if (profile.timing.deployDelay < 0 || profile.timing.acquisitionDelay < 0 || profile.timing.firstHitDelay < 0) {
            errors.push(`${unitKey}: timing values cannot be negative`);
        }
    }
    return errors;
}

export function getDuckxelSpawnOffset(unitKey: string, index: number, count: number, team: 'blue' | 'red') {
    const profile = getDuckxelBattleProfile(unitKey);
    const formation = profile?.spawn?.formation;
    const base = formation?.[index];
    if (base) {
        const forward = team === 'blue' ? 1 : -1;
        return { x: base.x, y: base.y * forward };
    }

    return {
        x: count > 1 ? (index * 16 - (count - 1) * 8) : 0,
        y: count > 1 ? (index * 8) : 0,
    };
}

export function getDuckxelSpawnCount(unitKey: string, fallbackCount: number) {
    return getDuckxelBattleProfile(unitKey)?.spawn?.count ?? fallbackCount;
}

export function getDuckxelTunedSpeed(unitKey: string, baseSpeed: number, globalMultiplier: number) {
    const profile = getDuckxelBattleProfile(unitKey);
    return Math.max(10, Math.round(baseSpeed * (profile?.tuning?.speedMultiplier ?? globalMultiplier)));
}

export function getDuckxelTunedAttackInterval(unitKey: string, baseAttackSpeed: number, globalMultiplier: number) {
    const profile = getDuckxelBattleProfile(unitKey);
    return Math.round(baseAttackSpeed * (profile?.tuning?.attackIntervalMultiplier ?? globalMultiplier));
}

export function getBattleLaneFromX(x: number): 'left' | 'right' {
    return x < CONSTANTS.SCREEN_WIDTH / 2 ? 'left' : 'right';
}
