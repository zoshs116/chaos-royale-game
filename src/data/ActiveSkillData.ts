import type { DuckxelDirection } from './DuckxelAnimationCatalog';

export type ActiveSkillKey = 'earthbreaker' | 'web_snare';
export type ActiveSkillPhase = 'ready' | 'casting' | 'cooldown';
export type ActiveSkillMovementMode = 'forward-leap' | 'backward-vault';

export interface ActiveSkillTargetMask {
    units: boolean;
    towers: boolean;
    ground: boolean;
    air: boolean;
}

export interface ActiveSkillImpactWave {
    delayAfterLandingMs: number;
    radius: number;
    damage: number;
    towerDamageMultiplier: number;
    vfxScale: number;
    shakeDurationMs: number;
    shakeIntensity: number;
}

export interface ActiveSkillDefinition {
    key: ActiveSkillKey;
    name: string;
    description: string;
    cooldownMs: number;
    radius: number;
    damage: number;
    towerDamageMultiplier: number;
    forwardDistance: number;
    movementMode: ActiveSkillMovementMode;
    effectForwardDistance: number;
    liftHeight: number;
    impactFrameByDirection: Record<DuckxelDirection, number>;
    timingByDirection: Record<DuckxelDirection, { impactMs: number; totalMs: number }>;
    targetMask: ActiveSkillTargetMask;
    impactWaves: ActiveSkillImpactWave[];
    effectFadeMs: number;
    vfx: {
        texturePrefix: string;
        frameCount: number;
        fps: number;
        displaySize: number;
    };
    projectileVfx?: {
        texturePrefix: string;
        frameCount: number;
        fps: number;
        thickness: number;
        travelMs: number;
    };
    persistentZone?: {
        durationMs: number;
        tickIntervalMs: number;
        damagePerTick: number;
        root: boolean;
    };
}

export interface ActiveSkillRuntimeSnapshot {
    key: ActiveSkillKey;
    phase: ActiveSkillPhase;
    cooldownRemainingMs: number;
    cooldownProgress: number;
    castSerial: number;
}

export const ACTIVE_SKILLS: Record<ActiveSkillKey, ActiveSkillDefinition> = {
    earthbreaker: {
        key: 'earthbreaker',
        name: '대지 강타',
        description: '공중으로 뛰어올라 도끼로 지면을 내리쳐 주변 지상 적과 건물에 범위 피해를 줍니다.',
        cooldownMs: 9000,
        radius: 72,
        damage: 280,
        towerDamageMultiplier: 0.65,
        forwardDistance: 56,
        movementMode: 'forward-leap',
        effectForwardDistance: 0,
        liftHeight: 72,
        impactFrameByDirection: {
            'north-east': 3,
            'north-west': 3,
            'south-east': 4,
            'south-west': 4,
        },
        timingByDirection: {
            'north-east': { impactMs: 1080, totalMs: 2400 },
            'north-west': { impactMs: 1080, totalMs: 2400 },
            'south-east': { impactMs: 1100, totalMs: 2420 },
            'south-west': { impactMs: 1140, totalMs: 2460 },
        },
        targetMask: {
            units: true,
            towers: true,
            ground: true,
            air: false,
        },
        impactWaves: [
            {
                delayAfterLandingMs: 0,
                radius: 68,
                damage: 120,
                towerDamageMultiplier: 0.65,
                vfxScale: 1,
                shakeDurationMs: 120,
                shakeIntensity: 0.0034,
            },
            {
                delayAfterLandingMs: 900,
                radius: 122,
                damage: 160,
                towerDamageMultiplier: 0.65,
                vfxScale: 1.58,
                shakeDurationMs: 190,
                shakeIntensity: 0.0052,
            },
        ],
        effectFadeMs: 360,
        vfx: {
            texturePrefix: 'vfx_earthbreaker_impact',
            frameCount: 4,
            fps: 16,
            displaySize: 172,
        },
    },
    web_snare: {
        key: 'web_snare',
        name: '거미줄 포획',
        description: '백덤블링으로 뒤로 빠진 뒤 전방에 거미줄을 펼쳐 5초 동안 적 유닛을 속박하고 지속 피해를 줍니다.',
        cooldownMs: 11000,
        radius: 78,
        damage: 35,
        towerDamageMultiplier: 0,
        forwardDistance: 50,
        movementMode: 'backward-vault',
        effectForwardDistance: 118,
        liftHeight: 52,
        impactFrameByDirection: {
            'north-east': 7,
            'north-west': 7,
            'south-east': 7,
            'south-west': 7,
        },
        timingByDirection: {
            'north-east': { impactMs: 1080, totalMs: 1520 },
            'north-west': { impactMs: 1080, totalMs: 1520 },
            'south-east': { impactMs: 1080, totalMs: 1520 },
            'south-west': { impactMs: 1080, totalMs: 1520 },
        },
        targetMask: {
            units: true,
            towers: false,
            ground: true,
            air: false,
        },
        impactWaves: [{
            delayAfterLandingMs: 0,
            radius: 78,
            damage: 35,
            towerDamageMultiplier: 0,
            vfxScale: 1,
            shakeDurationMs: 75,
            shakeIntensity: 0.0018,
        }],
        effectFadeMs: 280,
        vfx: {
            texturePrefix: 'vfx_web_acrobat_zone',
            frameCount: 3,
            fps: 12,
            displaySize: 168,
        },
        projectileVfx: {
            texturePrefix: 'vfx_web_acrobat_line',
            frameCount: 2,
            fps: 14,
            thickness: 34,
            travelMs: 220,
        },
        persistentZone: {
            durationMs: 5000,
            tickIntervalMs: 1000,
            damagePerTick: 42,
            root: true,
        },
    },
};

export function getActiveSkillDefinition(skillKey?: ActiveSkillKey | null) {
    return skillKey ? ACTIVE_SKILLS[skillKey] ?? null : null;
}

export function validateActiveSkillDefinitions(): string[] {
    const errors: string[] = [];
    for (const [key, skill] of Object.entries(ACTIVE_SKILLS)) {
        if (skill.key !== key) errors.push(`${key}: key mismatch`);
        if (skill.cooldownMs <= 0) errors.push(`${key}: cooldown must be positive`);
        if (skill.radius <= 0 || skill.damage <= 0) errors.push(`${key}: damage and radius must be positive`);
        if (skill.towerDamageMultiplier < 0 || skill.towerDamageMultiplier > 1) errors.push(`${key}: invalid tower damage multiplier`);
        if (!skill.targetMask.units && !skill.targetMask.towers) errors.push(`${key}: target mask is empty`);
        if (skill.forwardDistance < 0 || skill.liftHeight <= 0 || skill.effectForwardDistance < 0) errors.push(`${key}: invalid movement values`);
        if (skill.impactWaves.length === 0) errors.push(`${key}: at least one impact wave is required`);
        let previousWaveDelay = -1;
        for (const [waveIndex, wave] of skill.impactWaves.entries()) {
            if (wave.delayAfterLandingMs < previousWaveDelay) errors.push(`${key}/wave-${waveIndex}: waves must be time ordered`);
            if (wave.radius <= 0 || wave.damage <= 0) errors.push(`${key}/wave-${waveIndex}: invalid damage area`);
            if (wave.towerDamageMultiplier < 0 || wave.towerDamageMultiplier > 1) errors.push(`${key}/wave-${waveIndex}: invalid tower multiplier`);
            if (wave.vfxScale <= 0 || wave.shakeDurationMs < 0 || wave.shakeIntensity < 0) errors.push(`${key}/wave-${waveIndex}: invalid VFX values`);
            previousWaveDelay = wave.delayAfterLandingMs;
        }
        if (skill.effectFadeMs < 0) errors.push(`${key}: invalid effect fade time`);
        if (skill.vfx.frameCount <= 0 || skill.vfx.fps <= 0) errors.push(`${key}: invalid VFX timing`);
        if (skill.projectileVfx && (
            skill.projectileVfx.frameCount <= 0
            || skill.projectileVfx.fps <= 0
            || skill.projectileVfx.thickness <= 0
            || skill.projectileVfx.travelMs <= 0
        )) errors.push(`${key}: invalid projectile VFX`);
        if (skill.persistentZone && (
            skill.persistentZone.durationMs <= 0
            || skill.persistentZone.tickIntervalMs <= 0
            || skill.persistentZone.damagePerTick <= 0
        )) errors.push(`${key}: invalid persistent zone`);
        for (const [direction, impactFrame] of Object.entries(skill.impactFrameByDirection)) {
            if (!Number.isInteger(impactFrame) || impactFrame < 0) errors.push(`${key}/${direction}: invalid impact frame`);
        }
        for (const [direction, timing] of Object.entries(skill.timingByDirection)) {
            if (timing.impactMs < 0 || timing.totalMs <= timing.impactMs) errors.push(`${key}/${direction}: invalid cast timing`);
            const lastWaveAtMs = timing.impactMs + Math.max(...skill.impactWaves.map((wave) => wave.delayAfterLandingMs));
            if (timing.totalMs < lastWaveAtMs + skill.effectFadeMs) {
                errors.push(`${key}/${direction}: cast must outlast the final impact fade`);
            }
        }
    }
    return errors;
}
