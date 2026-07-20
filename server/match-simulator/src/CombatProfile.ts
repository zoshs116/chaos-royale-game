import { UNIT_TYPES } from '../../../src/data/UnitData';
import {
    getDuckxelBattleProfile,
    getDuckxelSpawnCount,
    getDuckxelSpawnOffset,
    getDuckxelTunedAttackInterval,
    getDuckxelTunedSpeed,
    type DuckxelMovementRoute,
} from '../../../src/data/DuckxelBattleProfiles';
import type { ActiveSkillKey } from '../../../src/data/ActiveSkillData';

const GLOBAL_SPEED_MULTIPLIER = 0.7;
const GLOBAL_ATTACK_INTERVAL_MULTIPLIER = 1.35;

export interface AuthoritativeCombatProfile {
    unitKey: string;
    cost: number;
    hp: number;
    damage: number;
    speed: number;
    range: number;
    rangePadding: number;
    sightRange: number;
    attackIntervalMs: number;
    attackWindupMs: number;
    deployDelayMs: number;
    acquisitionDelayMs: number;
    firstHitDelayMs: number;
    attackExitPadding: number;
    targetPolicy: 'any-nearest' | 'building-only';
    canTargetUnits: boolean;
    canTargetTowers: boolean;
    canTargetGround: boolean;
    canTargetAir: boolean;
    movementType: 'ground' | 'air';
    movementRoute: DuckxelMovementRoute;
    collisionRadius: number;
    collisionMass: number;
    projectile: null | {
        key: string;
        speed: number;
        splashRadius: number;
    };
    recoilDistance: number;
    spawnCount: number;
    spawnOffsets: Array<{ x: number; y: number }>;
    jump: null | {
        speed: number;
        cooldownMs: number;
        landingOffset: number;
    };
    activeSkill: ActiveSkillKey | null;
}

export function getAuthoritativeCombatProfile(unitKey: string): AuthoritativeCombatProfile | null {
    const data = UNIT_TYPES[unitKey];
    if (!data) return null;
    const profile = getDuckxelBattleProfile(unitKey);
    const sightRange = profile
        ? clamp(Math.max(data.sightRange, data.range + 50), profile.targeting.sightMin, profile.targeting.sightMax)
        : Math.max(data.sightRange, data.range + 50);
    const spawnCount = getDuckxelSpawnCount(unitKey, data.spawnCount ?? 1);
    const projectile = data.attackType === 'melee'
        ? null
        : {
            key: data.projectileKey ?? 'projectile_tower',
            speed: profile?.attack.projectileSpeed ?? defaultProjectileSpeed(data.projectileKey),
            splashRadius: profile?.attack.splashRadius ?? data.splashRadius ?? 0,
        };

    return {
        unitKey,
        cost: data.cost,
        hp: data.hp,
        damage: data.damage,
        speed: getDuckxelTunedSpeed(unitKey, data.speed, GLOBAL_SPEED_MULTIPLIER),
        range: Math.max(18, data.range),
        rangePadding: profile?.attack.rangePadding ?? 10,
        sightRange,
        attackIntervalMs: Math.max(200, getDuckxelTunedAttackInterval(unitKey, data.attackSpeed, GLOBAL_ATTACK_INTERVAL_MULTIPLIER)),
        attackWindupMs: Math.max(45, (profile?.attack.hitFrame ?? 1) * (profile?.attack.frameDuration ?? 90)),
        deployDelayMs: profile?.timing.deployDelay ?? 500,
        acquisitionDelayMs: profile?.timing.acquisitionDelay ?? 90,
        firstHitDelayMs: profile?.timing.firstHitDelay ?? 180,
        attackExitPadding: profile?.tracking.attackExitPadding ?? 8,
        targetPolicy: profile?.targeting.policy ?? (data.targetPriority === 'building' ? 'building-only' : 'any-nearest'),
        canTargetUnits: profile?.targeting.mask.units ?? data.targetPriority !== 'building',
        canTargetTowers: profile?.targeting.mask.towers ?? true,
        canTargetGround: profile?.targeting.mask.ground ?? data.targetPriority !== 'air',
        canTargetAir: profile?.targeting.mask.air ?? data.targetPriority !== 'ground',
        movementType: data.movementType,
        movementRoute: profile?.movement.route ?? (data.movementType === 'air' ? 'air-direct' : 'ground-bridge'),
        collisionRadius: data.movementType === 'air' ? 0 : profile?.collisionRadius ?? (data.attackType === 'melee' ? 12 : 10),
        collisionMass: profile?.collisionMass ?? (data.role === 'tank' ? 2.4 : data.role === 'swarm' ? 0.75 : 1.2),
        projectile,
        recoilDistance: profile?.attack.recoilDistance ?? 0,
        spawnCount,
        spawnOffsets: Array.from({ length: spawnCount }, (_, index) => getDuckxelSpawnOffset(unitKey, index, spawnCount, 'blue')),
        jump: profile?.movement.route === 'river-jump'
            ? {
                speed: profile.movement.jumpSpeed ?? Math.max(data.speed * 1.9, 116),
                cooldownMs: profile.movement.jumpCooldown ?? 850,
                landingOffset: profile.movement.jumpLandingOffset ?? 24,
            }
            : null,
        activeSkill: data.activeSkill ?? null,
    };
}

export function validateAuthoritativeCombatProfiles(unitKeys: string[]): string[] {
    const errors: string[] = [];
    for (const unitKey of unitKeys) {
        const profile = getAuthoritativeCombatProfile(unitKey);
        if (!profile) {
            errors.push(`${unitKey}: missing combat profile`);
            continue;
        }
        if (profile.hp <= 0 || profile.speed <= 0 || profile.attackIntervalMs <= 0) {
            errors.push(`${unitKey}: invalid core combat values`);
        }
        if (!profile.canTargetUnits && !profile.canTargetTowers) {
            errors.push(`${unitKey}: profile cannot target anything`);
        }
        if (profile.spawnOffsets.length !== profile.spawnCount) {
            errors.push(`${unitKey}: spawn formation does not match spawn count`);
        }
        if (profile.movementRoute === 'river-jump' && !profile.jump) {
            errors.push(`${unitKey}: river jump route requires jump data`);
        }
    }
    return errors;
}

function defaultProjectileSpeed(projectileKey?: string): number {
    if (projectileKey?.includes('spear')) return 390;
    if (projectileKey?.includes('cannon')) return 260;
    if (projectileKey?.includes('fire')) return 240;
    if (projectileKey?.includes('magic')) return 280;
    return 320;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
