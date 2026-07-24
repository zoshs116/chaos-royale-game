import type { DuckxelDirection } from './DuckxelAnimationCatalog';

export type ActiveSkillKey = 'earthbreaker' | 'web_snare' | 'dragon_blade';
export type ActiveSkillPhase = 'ready' | 'casting' | 'cooldown';
export type ActiveSkillMovementMode = 'forward-leap' | 'backward-vault' | 'stationary-release';

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
    knockupHeight?: number;
    knockupDurationMs?: number;
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
    travelingProjectile?: {
        texturePrefix: string;
        frameCount: number;
        fps: number;
        displaySize: number;
        startScale: number;
        endScale: number;
        speed: number;
        maxRange: number;
        collisionRadius: number;
        knockbackDistance: number;
        knockbackDurationMs: number;
        trailIntervalMs: number;
    };
    persistentZone?: {
        durationMs: number;
        tickIntervalMs: number;
        damagePerTick: number;
        root: boolean;
    };
    sustainedFollowUp?: {
        /** Keeps the caster at the completed movement position while the follow-up is active. */
        channelDurationMs: number;
        initialDelayMs: number;
        intervalMs: number;
        animationFrames: number[];
        animationFrameDurationMs: number;
        projectileThickness: number;
        projectileTravelMs: number;
        damagePerShot: number;
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
    dragon_blade: {
        key: 'dragon_blade',
        name: '황금 용의 일격',
        description: '회전하는 칼끝에서 황금 용을 발사해 범위 피해를 주고 적을 진행 방향으로 밀어냅니다.',
        cooldownMs: 9500,
        radius: 84,
        damage: 460,
        towerDamageMultiplier: 0.55,
        forwardDistance: 0,
        movementMode: 'stationary-release',
        effectForwardDistance: 184,
        liftHeight: 1,
        impactFrameByDirection: {
            'north-east': 5,
            'north-west': 5,
            'south-east': 5,
            'south-west': 5,
        },
        timingByDirection: {
            'north-east': { impactMs: 5290, totalMs: 6320 },
            'north-west': { impactMs: 5290, totalMs: 6320 },
            'south-east': { impactMs: 5290, totalMs: 6320 },
            'south-west': { impactMs: 5290, totalMs: 6320 },
        },
        targetMask: { units: true, towers: true, ground: true, air: false },
        impactWaves: [{
            delayAfterLandingMs: 0,
            radius: 84,
            damage: 460,
            towerDamageMultiplier: 0.55,
            vfxScale: 1.35,
            shakeDurationMs: 165,
            shakeIntensity: 0.005,
        }],
        effectFadeMs: 180,
        vfx: {
            texturePrefix: 'vfx_barbarian_dragon_impact',
            frameCount: 4,
            fps: 16,
            displaySize: 196,
        },
        travelingProjectile: {
            texturePrefix: 'vfx_barbarian_dragon',
            frameCount: 4,
            fps: 12,
            displaySize: 186,
            startScale: 1,
            endScale: 1.08,
            speed: 190,
            maxRange: 184,
            collisionRadius: 28,
            knockbackDistance: 58,
            knockbackDurationMs: 190,
            trailIntervalMs: 90,
        },
    },
    earthbreaker: {
        key: 'earthbreaker',
        name: '대지 강타',
        description: '공중으로 뛰어올라 도끼로 지면을 내리쳐 주변 지상 적과 건물에 범위 피해를 줍니다.',
        cooldownMs: 9000,
        radius: 72,
        damage: 380,
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
            'north-east': { impactMs: 1080, totalMs: 3200 },
            'north-west': { impactMs: 1080, totalMs: 3200 },
            'south-east': { impactMs: 1100, totalMs: 3220 },
            'south-west': { impactMs: 1140, totalMs: 3260 },
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
                damage: 160,
                towerDamageMultiplier: 0.65,
                knockupHeight: 34,
                knockupDurationMs: 520,
                vfxScale: 1,
                shakeDurationMs: 120,
                shakeIntensity: 0.0034,
            },
            {
                delayAfterLandingMs: 1300,
                radius: 122,
                damage: 220,
                towerDamageMultiplier: 0.65,
                knockupHeight: 42,
                knockupDurationMs: 580,
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
        description: '백덤블링으로 뒤로 빠진 뒤 전방에 거미줄을 펼쳐 7초 동안 적을 속박하고 연속 거미줄로 피해를 줍니다.',
        cooldownMs: 11000,
        radius: 78,
        damage: 35,
        towerDamageMultiplier: 0,
        forwardDistance: 82,
        movementMode: 'backward-vault',
        effectForwardDistance: 128,
        liftHeight: 66,
        impactFrameByDirection: {
            'north-east': 7,
            'north-west': 7,
            'south-east': 7,
            'south-west': 7,
        },
        timingByDirection: {
            'north-east': { impactMs: 1400, totalMs: 1840 },
            'north-west': { impactMs: 1400, totalMs: 1840 },
            'south-east': { impactMs: 1400, totalMs: 1840 },
            'south-west': { impactMs: 1400, totalMs: 1840 },
        },
        targetMask: {
            units: true,
            // The web field can bind towers as well as units. Tower damage stays at zero;
            // the tower is only prevented from acquiring or firing while it is webbed.
            towers: true,
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
            durationMs: 7000,
            tickIntervalMs: 1000,
            damagePerTick: 42,
            root: true,
        },
        sustainedFollowUp: {
            // Starts only once the backflip and the landing slide have fully completed.
            channelDurationMs: 7000,
            initialDelayMs: 560,
            intervalMs: 380,
            animationFrames: [6, 7, 8, 7],
            animationFrameDurationMs: 60,
            projectileThickness: 14,
            projectileTravelMs: 125,
            damagePerShot: 36,
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
            const hasKnockupHeight = wave.knockupHeight !== undefined;
            const hasKnockupDuration = wave.knockupDurationMs !== undefined;
            if (
                hasKnockupHeight !== hasKnockupDuration
                || (hasKnockupHeight && (wave.knockupHeight as number) <= 0)
                || (hasKnockupDuration && (wave.knockupDurationMs as number) <= 0)
            ) errors.push(`${key}/wave-${waveIndex}: invalid knockup values`);
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
        if (skill.travelingProjectile && (
            skill.travelingProjectile.frameCount <= 0
            || skill.travelingProjectile.fps <= 0
            || skill.travelingProjectile.displaySize <= 0
            || skill.travelingProjectile.startScale <= 0
            || skill.travelingProjectile.endScale < skill.travelingProjectile.startScale
            || skill.travelingProjectile.speed <= 0
            || skill.travelingProjectile.maxRange <= 0
            || skill.travelingProjectile.collisionRadius <= 0
            || skill.travelingProjectile.knockbackDistance < 0
            || skill.travelingProjectile.knockbackDurationMs <= 0
            || skill.travelingProjectile.trailIntervalMs <= 0
        )) errors.push(`${key}: invalid traveling projectile`);
        if (skill.persistentZone && (
            skill.persistentZone.durationMs <= 0
            || skill.persistentZone.tickIntervalMs <= 0
            || skill.persistentZone.damagePerTick <= 0
        )) errors.push(`${key}: invalid persistent zone`);
        if (skill.sustainedFollowUp && (
            skill.sustainedFollowUp.channelDurationMs <= 0
            || skill.sustainedFollowUp.initialDelayMs < 0
            || skill.sustainedFollowUp.intervalMs <= 0
            || skill.sustainedFollowUp.animationFrames.length === 0
            || skill.sustainedFollowUp.animationFrameDurationMs <= 0
            || skill.sustainedFollowUp.projectileThickness <= 0
            || skill.sustainedFollowUp.projectileTravelMs <= 0
            || skill.sustainedFollowUp.damagePerShot <= 0
        )) errors.push(`${key}: invalid sustained follow-up`);
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
