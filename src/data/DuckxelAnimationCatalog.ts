export const DUCKXEL_BATTLE_DIRECTIONS = [
    'north-east',
    'north-west',
    'south-east',
    'south-west',
] as const;

export type DuckxelDirection = typeof DUCKXEL_BATTLE_DIRECTIONS[number];
export type DuckxelPreviewAction = 'walk' | 'attack' | 'skill';

export interface DuckxelDirectionAnimation {
    frameCount: number;
    fps: number;
    sourceDirection?: DuckxelDirection;
    flipX?: boolean;
}

export interface DuckxelPreviewActionDefinition {
    label: string;
    folder: string;
    textureSegment: string;
    loop: boolean;
    replayDelayMs: number;
    directions: Partial<Record<DuckxelDirection, DuckxelDirectionAnimation>>;
}

export interface DuckxelAssetProfile {
    unitKey: string;
    texturePrefix: string;
    assetFolder: string;
    baseFile: string;
    walkFrameCounts: Record<DuckxelDirection, number>;
    attackFrameCounts: Record<DuckxelDirection, number>;
    displaySize?: number;
    previewActions: Partial<Record<DuckxelPreviewAction, DuckxelPreviewActionDefinition>>;
}

type DirectionCounts = Record<DuckxelDirection, number>;
type DirectionFps = Record<DuckxelDirection, number>;

const createDirections = (counts: DirectionCounts, fps: DirectionFps) => Object.fromEntries(
    DUCKXEL_BATTLE_DIRECTIONS.map((direction) => [
        direction,
        { frameCount: counts[direction], fps: fps[direction] },
    ]),
) as Record<DuckxelDirection, DuckxelDirectionAnimation>;

const createProfile = ({
    unitKey,
    assetFolder,
    baseFile,
    walkFrameCounts,
    walkFps,
    attackFrameCounts,
    attackFps,
    displaySize,
    skill,
}: {
    unitKey: string;
    assetFolder: string;
    baseFile: string;
    walkFrameCounts: DirectionCounts;
    walkFps: DirectionFps;
    attackFrameCounts: DirectionCounts;
    attackFps: DirectionFps;
    displaySize?: number;
    skill?: DuckxelPreviewActionDefinition;
}): DuckxelAssetProfile => ({
    unitKey,
    texturePrefix: `unit_${unitKey}`,
    assetFolder,
    baseFile,
    walkFrameCounts,
    attackFrameCounts,
    displaySize,
    previewActions: {
        walk: {
            label: '걷기',
            folder: assetFolder,
            textureSegment: '',
            loop: true,
            replayDelayMs: 0,
            directions: createDirections(walkFrameCounts, walkFps),
        },
        ...(Object.values(attackFrameCounts).some((count) => count > 0) ? {
            attack: {
                label: '공격',
                folder: `${assetFolder}_attack`,
                textureSegment: '_attack',
                loop: false,
                replayDelayMs: 650,
                directions: createDirections(attackFrameCounts, attackFps),
            },
        } : {}),
        ...(skill ? { skill } : {}),
    },
});

const fps = (northEast: number, northWest: number, southEast: number, southWest: number): DirectionFps => ({
    'north-east': northEast,
    'north-west': northWest,
    'south-east': southEast,
    'south-west': southWest,
});

export const DUCKXEL_ASSET_PROFILES: Record<string, DuckxelAssetProfile> = {
    duckxel_sword_man: createProfile({
        unitKey: 'duckxel_sword_man',
        assetFolder: 'sword_man',
        baseFile: 'sword_man_red.png',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(6, 6, 10, 10),
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 3 },
        attackFps: fps(11, 11, 11, 11),
    }),
    duckxel_barbarian: createProfile({
        unitKey: 'duckxel_barbarian',
        assetFolder: 'barbarian',
        baseFile: 'barbarian_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 2, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(10, 5, 10, 10),
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 4 },
        attackFps: fps(11, 11, 11, 11),
        skill: {
            label: '황금 용의 일격',
            folder: 'barbarian_skill',
            textureSegment: '_skill',
            loop: false,
            replayDelayMs: 1200,
            directions: {
                'north-east': { frameCount: 6, fps: 10 },
                'north-west': { frameCount: 6, fps: 10 },
                'south-east': { frameCount: 6, fps: 10 },
                'south-west': { frameCount: 6, fps: 10 },
            },
        },
    }),
    royal_giant: createProfile({
        unitKey: 'royal_giant',
        assetFolder: 'royal_giant',
        baseFile: 'royal_giant_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(10, 10, 10, 10),
        attackFrameCounts: { 'north-east': 0, 'north-west': 0, 'south-east': 0, 'south-west': 0 },
        attackFps: fps(11, 11, 11, 11),
    }),
    spear_goblin: createProfile({
        unitKey: 'spear_goblin',
        assetFolder: 'spear_goblin',
        baseFile: 'spear_goblin_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 4, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(10, 8, 10, 10),
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 3, 'south-west': 4 },
        attackFps: fps(13, 13, 13, 13),
    }),
    skeleton_swordsman: createProfile({
        unitKey: 'skeleton_swordsman',
        assetFolder: 'skeleton_swordsman',
        baseFile: 'skeleton_swordsman_red.png',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(6, 6, 10, 10),
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 3, 'south-west': 3 },
        attackFps: fps(13, 13, 13, 13),
    }),
    hog_rider: createProfile({
        unitKey: 'hog_rider',
        assetFolder: 'hog_rider',
        baseFile: 'hog_rider/south-east/frame-00.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 5, 'south-west': 5 },
        walkFps: fps(10, 10, 9, 9),
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 4, 'south-west': 4 },
        attackFps: fps(11, 11, 11, 11),
    }),
    duckxel_muradin: createProfile({
        unitKey: 'duckxel_muradin',
        assetFolder: 'muradin',
        baseFile: 'muradin/south-east/frame-00.png',
        displaySize: 68,
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 4, 'south-west': 4 },
        walkFps: fps(10, 10, 10, 10),
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 4, 'south-west': 4 },
        attackFps: fps(10, 10, 10, 10),
        skill: {
            label: '대지 강타',
            folder: 'muradin_skill',
            textureSegment: '_skill',
            loop: false,
            replayDelayMs: 900,
            directions: {
                'north-east': { frameCount: 5, fps: 8 },
                'north-west': {
                    frameCount: 5,
                    fps: 8,
                    sourceDirection: 'north-east',
                    flipX: true,
                },
                'south-east': { frameCount: 6, fps: 10 },
                'south-west': { frameCount: 6, fps: 8 },
            },
        },
    }),
    duckxel_web_acrobat: createProfile({
        unitKey: 'duckxel_web_acrobat',
        assetFolder: 'web_acrobat',
        baseFile: 'web_acrobat_red.png',
        displaySize: 64,
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 6, 'south-west': 6 },
        walkFps: fps(10, 10, 10, 10),
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 4 },
        attackFps: fps(10, 10, 10, 10),
        skill: {
            label: '거미줄 포획',
            folder: 'web_acrobat_skill',
            textureSegment: '_skill',
            loop: false,
            replayDelayMs: 900,
            directions: {
                'north-east': { frameCount: 9, fps: 9 },
                'north-west': { frameCount: 9, fps: 9 },
                'south-east': { frameCount: 9, fps: 9 },
                'south-west': { frameCount: 9, fps: 9 },
            },
        },
    }),
};

export const DUCKXEL_UNIT_KEYS = Object.freeze(Object.keys(DUCKXEL_ASSET_PROFILES));

export function getDuckxelAssetProfile(unitKey: string) {
    return DUCKXEL_ASSET_PROFILES[unitKey] ?? null;
}

export function isDuckxelAssetUnit(unitKey: string) {
    return Boolean(getDuckxelAssetProfile(unitKey));
}

const HORIZONTAL_MIRROR: Record<DuckxelDirection, DuckxelDirection> = {
    'north-east': 'north-west',
    'north-west': 'north-east',
    'south-east': 'south-west',
    'south-west': 'south-east',
};

export function resolveDuckxelDirectionAnimation(
    profile: DuckxelAssetProfile,
    action: DuckxelPreviewAction,
    direction: DuckxelDirection,
) {
    const actionDefinition = profile.previewActions[action];
    if (!actionDefinition) return null;
    const exact = actionDefinition.directions[direction];
    if (exact && exact.frameCount > 0) {
        return {
            actionDefinition,
            directionDefinition: exact,
            sourceDirection: exact.sourceDirection ?? direction,
            flipX: exact.flipX ?? false,
        };
    }

    const mirroredDirection = HORIZONTAL_MIRROR[direction];
    const mirrored = actionDefinition.directions[mirroredDirection];
    if (!mirrored || mirrored.frameCount <= 0) return null;
    return {
        actionDefinition,
        directionDefinition: mirrored,
        sourceDirection: mirrored.sourceDirection ?? mirroredDirection,
        flipX: !(mirrored.flipX ?? false),
    };
}

export function getDuckxelPreviewFramePath(
    profile: DuckxelAssetProfile,
    action: DuckxelPreviewAction,
    direction: DuckxelDirection,
    frameIndex: number,
) {
    const resolved = resolveDuckxelDirectionAnimation(profile, action, direction);
    if (!resolved) return null;
    const safeFrame = Math.max(0, Math.min(frameIndex, resolved.directionDefinition.frameCount - 1));
    return `/assets/sprites/duckxel/${resolved.actionDefinition.folder}/${resolved.sourceDirection}/frame-${String(safeFrame).padStart(2, '0')}.png`;
}
