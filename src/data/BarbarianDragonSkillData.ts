import type { DuckxelDirection } from './DuckxelAnimationCatalog';

export interface BarbarianSwordTipAnchor {
    x: number;
    y: number;
    behind?: boolean;
    release?: boolean;
}

export const BARBARIAN_DRAGON_SKILL_ASSETS = {
    actionFolder: 'barbarian_skill',
    actionFrameCount: 6,
    actionFps: 10,
    chargeDurationMs: 3900,
    releaseCompressionMs: 420,
    releaseHoldMs: 2000,
    sourceFrameSize: 256,
    dragonTexturePrefix: 'vfx_barbarian_dragon',
    dragonFolder: 'barbarian_vfx/dragon',
    dragonFrameCount: 4,
    dragonFps: 12,
    attachedDragonStartSize: 24,
    attachedDragonEndSize: 186,
    orbitCenterYOffset: -5,
    orbitStartRadiusX: 42,
    orbitStartRadiusY: 34,
    orbitEndRadiusX: 108,
    orbitEndRadiusY: 94,
    orbitReturnStartProgress: 0.78,
    orbitReleaseRotationStartProgress: 0.88,
    orbitDepthHysteresis: 0.08,
    dragonTailOriginX: 0.095,
    dragonTailOriginY: 0.56,
    sandTrailSideOffset: 18,
    // Lay impacts out by travelled distance instead of using three fixed waypoints.
    // This keeps the dragon's whole route visually connected at every cast range.
    pathImpactSpacingPx: 30,
    pathImpactStartOffsetPx: 18,
    pathImpactStartScale: 0.72,
    pathImpactEndScale: 1.02,
    pathImpactHoldMs: 420,
    impactTexturePrefix: 'vfx_barbarian_dragon_impact',
    impactFolder: 'barbarian_vfx/impact',
    impactFrameCount: 4,
    impactFps: 16,
} as const;

// Coordinates measured directly from the approved 256x256 custom-action frames.
export const BARBARIAN_DRAGON_SWORD_TIP_ANCHORS: Record<DuckxelDirection, BarbarianSwordTipAnchor[]> = {
    'north-west': [
        { x: 28, y: 153 },
        { x: 95, y: 28, behind: true },
        { x: 60, y: 56, behind: true },
        { x: 192, y: 77, behind: true },
        { x: 67, y: 91 },
        { x: 18, y: 91, release: true },
    ],
    'north-east': [
        { x: 227, y: 153 },
        { x: 160, y: 28, behind: true },
        { x: 195, y: 56, behind: true },
        { x: 63, y: 77, behind: true },
        { x: 188, y: 91 },
        { x: 237, y: 91, release: true },
    ],
    'south-west': [
        { x: 46, y: 126 },
        { x: 209, y: 195 },
        { x: 206, y: 70, behind: true },
        { x: 227, y: 77, behind: true },
        { x: 192, y: 153 },
        { x: 4, y: 126, release: true },
    ],
    'south-east': [
        { x: 209, y: 126 },
        { x: 46, y: 195 },
        { x: 49, y: 70, behind: true },
        { x: 28, y: 77, behind: true },
        { x: 63, y: 153 },
        { x: 251, y: 126, release: true },
    ],
};
