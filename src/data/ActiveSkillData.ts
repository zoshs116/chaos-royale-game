import type { DuckxelDirection } from './DuckxelAnimationCatalog';

export type ActiveSkillKey = 'earthbreaker';
export type ActiveSkillPhase = 'ready' | 'casting' | 'cooldown';

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
        if (skill.forwardDistance < 0 || skill.liftHeight <= 0) errors.push(`${key}: invalid movement values`);
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
