import Phaser from 'phaser';
import { CONSTANTS } from '../systems/Constants';
import type { SkillType, SkillParams, UnitRole } from '../data/UnitData';
import type { Debuff } from '../systems/SkillSystem';
import { getBattleLaneFromX, getDuckxelBattleProfile } from '../data/DuckxelBattleProfiles';
import type { DuckxelBattleProfile } from '../data/DuckxelBattleProfiles';
import { resolveCombatTarget } from '../systems/combat/TargetResolver';

export const UnitState = {
    SPAWN: 0,
    IDLE: 1,
    MOVE: 2,
    CHASE: 3,
    ATTACK: 4,
    DIE: 5
} as const;

export type UnitStateType = number;

export interface UnitStats {
    hp: number;
    damage: number;
    speed: number;
    range: number;
    attackSpeed: number;
    movementType: 'ground' | 'air';
    targetPriority: 'any' | 'building' | 'ground' | 'air';
    attackType: 'melee' | 'ranged' | 'splash';
    splashRadius?: number;
    projectileKey?: string;
    sightRange: number;
    spawnCount?: number;
}

interface TeamPalette {
    body: number;
    armor: number;
    trim: number;
    fx: number;
}

type DuckxelDirection = 'north-east' | 'north-west' | 'south-east' | 'south-west';
type BattleLane = 'left' | 'right';

const DEFAULT_ACQUISITION_DELAY = 90;
const DEFAULT_FIRST_HIT_DELAY = 180;

interface DuckxelAssetProfile {
    unitKey: string;
    texturePrefix: string;
    walkFrameCounts: Record<DuckxelDirection, number>;
    attackFrameCounts: Record<DuckxelDirection, number>;
    displaySize?: number;
}

const DUCKXEL_ASSET_PROFILES: Record<string, DuckxelAssetProfile> = {
    duckxel_sword_man: {
        unitKey: 'duckxel_sword_man',
        texturePrefix: 'unit_duckxel_sword_man',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 3 },
    },
    duckxel_barbarian: {
        unitKey: 'duckxel_barbarian',
        texturePrefix: 'unit_duckxel_barbarian',
        walkFrameCounts: { 'north-east': 6, 'north-west': 2, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 4 },
    },
    royal_giant: {
        unitKey: 'royal_giant',
        texturePrefix: 'unit_royal_giant',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 0, 'north-west': 0, 'south-east': 0, 'south-west': 0 },
    },
    spear_goblin: {
        unitKey: 'spear_goblin',
        texturePrefix: 'unit_spear_goblin',
        walkFrameCounts: { 'north-east': 6, 'north-west': 4, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 3, 'south-west': 4 },
    },
    skeleton_swordsman: {
        unitKey: 'skeleton_swordsman',
        texturePrefix: 'unit_skeleton_swordsman',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 3, 'south-west': 3 },
    },
    hog_rider: {
        unitKey: 'hog_rider',
        texturePrefix: 'unit_hog_rider',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 5, 'south-west': 5 },
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 4, 'south-west': 4 },
    },
};

export default class Unit extends Phaser.GameObjects.Container {
    public id: string;
    public state: UnitStateType;
    public stats: UnitStats;
    public maxHp: number;
    public team: 'blue' | 'red';
    public unitKey: string;
    public simulationOrder: number = 0;
    public isTower: boolean = false;
    public isKingTower: boolean = false;
    public towerActive: boolean = true;

    // Skill system
    public skillType: SkillType = 'none';
    public skillParams: SkillParams = {};
    public role: UnitRole = 'swarm';
    public hitCount: number = 0;
    public lastDamageSourceOrder: number | null = null;
    public lastDamageAt: number = 0;
    public debuffs: Debuff[] = [];
    public isStunned: boolean = false;
    public slowFactor: number = 1;
    public hasDefenseAura: boolean = false;
    public defenseAuraReduction: number = 0;

    // Visual
    protected sprite: Phaser.GameObjects.Image | null = null;
    protected hpBarBg: Phaser.GameObjects.Rectangle;
    protected hpBarFill: Phaser.GameObjects.Rectangle;
    protected hpBarHighlight: Phaser.GameObjects.Rectangle;
    protected shadow: Phaser.GameObjects.Ellipse;
    private attackGlow: Phaser.GameObjects.Ellipse;
    private walkPhase: number = Math.random() * Math.PI * 2;
    private readonly spriteBaseScale: number;
    private readonly isDuckxelTestUnit: boolean = false;
    private readonly duckxelAssetProfile: DuckxelAssetProfile | null = null;
    private readonly duckxelBattleProfile: DuckxelBattleProfile | null = null;
    private duckxelDirection: DuckxelDirection = 'south-east';
    private duckxelFrameIndex: number = 0;
    private duckxelFrameTimer: number = 0;
    private duckxelAttackPlaying: boolean = false;
    private isRiverJumping: boolean = false;
    private hogJumpTarget: { x: number; y: number } | null = null;
    private hogJumpCooldown: number = 0;

    // Combat
    public target: Unit | null = null;
    protected attackTimer: number = 0;
    protected spawnTimer: number = 0;
    private retargetTimer: number = 0;
    private targetLockTimer: number = 0;
    private acquisitionTimer: number = 0;
    private firstHitTimer: number = 0;
    private firstHitPending: boolean = false;
    private firstHitDelayStarted: boolean = false;
    private targetAnchor: { x: number; y: number } | null = null;
    private contactScanRequested: boolean = false;
    private pendingGameplayAttack: {
        kind: 'melee' | 'projectile';
        target: Unit;
        remaining: number;
        color: number;
    } | null = null;

    // Movement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private gameMap: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private entityManagerRef: any = null;
    private readonly spawnLane: BattleLane;
    private routeLane: BattleLane;
    private bridgeLaneLock: BattleLane | null = null;
    private routeSwitchCooldown: number = 0;
    private routeProgressTimer: number = 0;
    private routeProgressX: number = 0;
    private routeProgressY: number = 0;
    private routeStallCount: number = 0;
    private simulationTimeMs: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string, team: 'blue' | 'red', stats: UnitStats) {
        super(scene, x, y);
        this.scene = scene;
        this.team = team;
        this.unitKey = unitKey;
        this.stats = { ...stats };
        this.maxHp = stats.hp;
        this.state = UnitState.SPAWN;
        this.id = Phaser.Utils.String.UUID();
        this.spawnLane = getBattleLaneFromX(x);
        this.routeLane = this.spawnLane;
        this.routeProgressX = x;
        this.routeProgressY = y;
        this.duckxelBattleProfile = getDuckxelBattleProfile(unitKey);
        this.spawnTimer = this.duckxelBattleProfile?.timing.deployDelay ?? CONSTANTS.GAMEPLAY.SPAWN_DELAY;

        const palette = Unit.getPalette(team);
        const externalTextureKey = Unit.getExternalTextureKey(unitKey, team);
        const duckxelAssetProfile = Unit.getDuckxelAssetProfile(scene, unitKey);
        const duckxelTestTextureKey = duckxelAssetProfile ? `${duckxelAssetProfile.texturePrefix}_south-east_0` : null;
        this.duckxelAssetProfile = duckxelAssetProfile;
        this.isDuckxelTestUnit = Boolean(duckxelTestTextureKey);
        const textureKey = externalTextureKey ?? duckxelTestTextureKey ?? Unit.getBattleTextureKey(unitKey, team, stats.attackType);
        if (!externalTextureKey) {
            Unit.ensureBattleTexture(scene, textureKey, palette, stats.attackType, unitKey);
        }

        const shadowProfile = this.duckxelBattleProfile?.shadow;
        this.shadow = scene.add.ellipse(
            0,
            shadowProfile?.y ?? 9,
            shadowProfile?.width ?? 16,
            shadowProfile?.height ?? 6,
            0x000000,
            shadowProfile?.alpha ?? 0.28
        );
        this.shadow.setDepth(CONSTANTS.DEPTH.UNIT_SHADOW);

        const sprite = scene.add.image(0, -2, textureKey);
        const spriteSize = duckxelAssetProfile?.displaySize
            ?? this.duckxelBattleProfile?.displaySize
            ?? (duckxelTestTextureKey ? 62 : externalTextureKey ? 46 : Unit.getSpriteSize(unitKey, stats.attackType));
        sprite.setDisplaySize(spriteSize, spriteSize);
        sprite.setDepth(CONSTANTS.DEPTH.UNIT);
        this.sprite = sprite;
        this.spriteBaseScale = externalTextureKey || duckxelTestTextureKey
            ? sprite.scaleX
            : stats.attackType === 'melee' ? 0.98 : 1;
        this.sprite.setScale(this.spriteBaseScale);

        this.attackGlow = scene.add.ellipse(0, 6, 18, 10, palette.fx, 0);
        this.attackGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.attackGlow.setDepth(CONSTANTS.DEPTH.UNIT - 1);

        const teamBorderColor = team === 'blue' ? 0x4fa8ff : 0xff5959;
        const hpProfile = this.duckxelBattleProfile?.hpBar;
        const hpBarWidth = hpProfile?.width ?? (unitKey === 'royal_giant' ? 32 : unitKey === 'skeleton_swordsman' ? 18 : unitKey === 'spear_goblin' ? 20 : 24);
        const hpBarFillWidth = Math.max(12, hpBarWidth - 4);
        const hpBarY = hpProfile?.y ?? (unitKey === 'royal_giant' ? -28 : unitKey === 'skeleton_swordsman' ? -13 : -17);
        this.hpBarBg = scene.add.rectangle(-hpBarWidth / 2, hpBarY, hpBarWidth, 4, 0x101521, 0.88);
        this.hpBarBg.setOrigin(0, 0.5);
        this.hpBarBg.setStrokeStyle(1, teamBorderColor, 0.62);
        
        this.hpBarHighlight = scene.add.rectangle(-hpBarFillWidth / 2, hpBarY - 1.2, hpBarFillWidth, 1, 0xffffff, 0.22);
        this.hpBarHighlight.setOrigin(0, 0.5);
        
        this.hpBarFill = scene.add.rectangle(-hpBarFillWidth / 2, hpBarY, hpBarFillWidth, 2, CONSTANTS.COLORS.HP_GREEN, 0.96);
        this.hpBarFill.setOrigin(0, 0.5);
        
        this.hpBarBg.setDepth(CONSTANTS.DEPTH.HP_BAR);
        this.hpBarHighlight.setDepth(CONSTANTS.DEPTH.HP_BAR + 1);
        this.hpBarFill.setDepth(CONSTANTS.DEPTH.HP_BAR + 2);

        this.add([this.shadow, this.attackGlow, sprite, this.hpBarBg, this.hpBarHighlight, this.hpBarFill]);

        // Physics
        scene.physics.world.enable(this);
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setCircle(9, -9, -9);

        this.setDepth(CONSTANTS.DEPTH.UNIT);
        this.updateSortDepth();
        scene.add.existing(this);

        // Spawn effect
        this.alpha = 0;
        scene.tweens.add({
            targets: this,
            alpha: 1,
            duration: 280,
            ease: 'Sine.Out'
        });
    }

    protected static getPalette(team: 'blue' | 'red'): TeamPalette {
        if (team === 'blue') {
            return {
                body: 0x5fa8ff,
                armor: 0x264f89,
                trim: 0xe7f2ff,
                fx: 0x7ec6ff,
            };
        }
        return {
            body: 0xf27068,
            armor: 0x8a2e2a,
            trim: 0xffe8e5,
            fx: 0xff9d86,
        };
    }

    private static getBattleTextureKey(unitKey: string, team: 'blue' | 'red', attackType: UnitStats['attackType']) {
        return `battle_unit_${unitKey}_${team}_${attackType}`;
    }

    private static getExternalTextureKey(unitKey: string, team: 'blue' | 'red'): string | null {
        if (unitKey === 'seoultech_student' && team === 'blue') {
            return 'unit_seoultech_student_blue';
        }
        return null;
    }

    private static getDuckxelAssetProfile(scene: Phaser.Scene, unitKey: string): DuckxelAssetProfile | null {
        const profile = DUCKXEL_ASSET_PROFILES[unitKey];
        if (!profile) return null;
        return scene.textures.exists(`${profile.texturePrefix}_south-east_0`) ? profile : null;
    }

    private static getSpriteSize(unitKey: string, attackType: UnitStats['attackType']) {
        switch (unitKey) {
            case 'seoultech_student':
                return 46;
            case 'muradin':
                return 38;
            case 'stone_cold':
                return 38;
            case 'demolisher':
                return 39;
            case 'ghoul':
                return 28;
            case 'raiden':
            case 'viper':
                return 32;
            default:
                return attackType === 'splash' ? 36 : 33;
        }
    }

    private static ensureBattleTexture(
        scene: Phaser.Scene,
        textureKey: string,
        palette: TeamPalette,
        attackType: UnitStats['attackType'],
        unitKey: string
    ) {
        if (scene.textures.exists(textureKey)) return;

        const g = scene.add.graphics({ x: 0, y: 0 });
        const isBlue = palette.body === Unit.getPalette('blue').body;
        const unitTrim = {
            stone_cold: 0x95b8d8,
            muradin: 0xd6a96c,
            raiden: 0xc8ddff,
            viper: 0x7bd785,
            agamemnon: 0xff9348,
            medusa: 0x84d56b,
            akasha: 0xe57bd5,
            voodoo: 0xbf7fff,
            demolisher: 0xd8b56b,
            ghoul: 0xa9b8cc,
        }[unitKey] ?? palette.trim;

        // === PixelLab 스타일 픽셀 아트 유닛 렌더링 ===
        const outlineColor = 0x1a1a2e;

        // 몸통 외곽선 + 본체
        g.fillStyle(outlineColor, 1);
        g.fillRoundedRect(13, 18, 22, 18, 4);
        g.fillStyle(palette.armor, 1);
        g.fillRoundedRect(15, 20, 18, 14, 3);
        g.fillStyle(palette.body, 1);
        g.fillRoundedRect(17, 21, 14, 11, 2);
        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(18, 22, 8, 5, 2);

        // 머리 외곽선 + 본체
        g.fillStyle(outlineColor, 1);
        g.fillCircle(24, 12, 9);
        g.fillStyle(unitTrim, 1);
        g.fillCircle(24, 12, 8);
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(21, 9, 3.5);

        // 눈 (픽셀 아트 스타일)
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(21, 12, 2.2);
        g.fillCircle(27, 12, 2.2);
        g.fillStyle(0x101826, 0.95);
        g.fillCircle(21.5, 12.5, 1.3);
        g.fillCircle(27.5, 12.5, 1.3);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(20.5, 11.5, 0.6);
        g.fillCircle(26.5, 11.5, 0.6);

        // 다리 (외곽선 포함)
        g.fillStyle(outlineColor, 1);
        g.fillRect(17, 33, 6, 8);
        g.fillRect(25, 33, 6, 8);
        g.fillStyle(palette.armor, 1);
        g.fillRect(18, 34, 4, 6);
        g.fillRect(26, 34, 4, 6);
        g.fillStyle(0xffffff, 0.12);
        g.fillRect(18, 34, 4, 2);
        g.fillRect(26, 34, 4, 2);

        // 무기 (외곽선 포함)
        if (attackType === 'melee') {
            g.fillStyle(outlineColor, 1);
            g.fillTriangle(31, 22, 44, 16, 36, 32);
            g.fillStyle(0xd3e3ff, 1);
            g.fillTriangle(32, 23, 43, 18, 35, 30);
            g.fillStyle(0xf0f6ff, 0.7);
            g.fillTriangle(33, 24, 40, 19, 35, 27);
            g.fillStyle(0x7b5835, 1);
            g.fillRect(28, 24, 5, 3);
            g.fillStyle(0xd4a04f, 1);
            g.fillCircle(30, 25, 1.5);
        } else if (attackType === 'ranged') {
            g.lineStyle(3, outlineColor, 1);
            g.beginPath();
            g.arc(34, 23, 7, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false);
            g.strokePath();
            g.lineStyle(2, 0xc59755, 1);
            g.beginPath();
            g.arc(34, 23, 6, Phaser.Math.DegToRad(215), Phaser.Math.DegToRad(325), false);
            g.strokePath();
            g.fillStyle(0xd2c0a0, 1);
            g.fillRect(28, 23, 10, 2);
            g.fillStyle(0xf4dcc4, 1);
            g.fillTriangle(38, 24, 44, 22, 44, 26);
        } else {
            g.fillStyle(outlineColor, 1);
            g.fillRect(29, 21, 4, 3);
            g.fillRect(34, 15, 4, 10);
            g.fillStyle(0x7353cc, 1);
            g.fillRect(30, 22, 2, 2);
            g.fillStyle(0x6e4fb8, 1);
            g.fillRect(35, 16, 2, 8);
            g.fillStyle(0xb997ff, 1);
            g.fillCircle(36, 14, 4);
            g.fillStyle(0xe0ccff, 0.6);
            g.fillCircle(35, 13, 1.8);
            g.fillStyle(0xffffff, 0.5);
            g.fillCircle(34, 12, 0.8);
        }

        // 유닛별 고유 디테일
        switch (unitKey) {
            case 'stone_cold':
                g.fillStyle(outlineColor, 1);
                g.fillCircle(14, 23, 6.5);
                g.fillCircle(34, 25, 7);
                g.fillStyle(0x4b5d74, 1);
                g.fillCircle(14, 23, 5.5);
                g.fillCircle(34, 25, 6);
                g.fillStyle(0x7ec6ff, 0.7);
                g.fillCircle(14, 21, 2);
                g.fillCircle(34, 23, 2.2);
                break;
            case 'muradin':
                g.fillStyle(outlineColor, 1);
                g.fillRect(18, 5, 12, 6);
                g.fillStyle(0x6f4f34, 1);
                g.fillRect(19, 6, 10, 4);
                g.fillStyle(0xd8c49a, 1);
                g.fillTriangle(16, 8, 19, 2, 22, 8);
                g.fillTriangle(26, 8, 29, 2, 32, 8);
                break;
            case 'raiden':
                g.fillStyle(0xb8d9ff, 0.75);
                g.fillTriangle(16, 18, 24, 6, 32, 18);
                g.fillStyle(0x8bc6ff, 0.6);
                g.fillRect(10, 26, 5, 3);
                g.fillRect(33, 24, 5, 3);
                g.fillStyle(0xffff66, 0.5);
                g.fillCircle(24, 8, 2);
                break;
            case 'viper':
                g.fillStyle(outlineColor, 1);
                g.fillEllipse(15, 17, 11, 16);
                g.fillEllipse(33, 17, 11, 16);
                g.fillStyle(0x4f9b4a, 0.9);
                g.fillEllipse(15, 17, 9, 14);
                g.fillEllipse(33, 17, 9, 14);
                g.fillStyle(0x94f08f, 0.6);
                g.fillCircle(24, 13, 2.5);
                break;
            case 'agamemnon':
                g.fillStyle(0xd1642e, 0.9);
                g.fillTriangle(11, 32, 24, 17, 37, 32);
                g.fillStyle(0xffc16c, 0.65);
                g.fillCircle(24, 15, 3.5);
                g.fillStyle(0xffff66, 0.4);
                g.fillCircle(24, 14, 1.5);
                break;
            case 'medusa':
                g.fillStyle(outlineColor, 1);
                for (let i = 0; i < 5; i++) {
                    g.fillCircle(15 + i * 4, 6 + ((i % 2) * 2.5), 3);
                }
                g.fillStyle(0x7ab95d, 1);
                for (let i = 0; i < 5; i++) {
                    g.fillCircle(15 + i * 4, 6 + ((i % 2) * 2.5), 2.2);
                }
                break;
            case 'akasha':
                g.fillStyle(outlineColor, 1);
                g.fillTriangle(12, 26, 4, 12, 16, 12);
                g.fillTriangle(36, 26, 44, 12, 32, 12);
                g.fillStyle(0x8f3b8f, 0.85);
                g.fillTriangle(13, 25, 6, 14, 15, 14);
                g.fillTriangle(35, 25, 42, 14, 33, 14);
                g.fillStyle(0xff97ea, 0.7);
                g.fillCircle(24, 14, 1.8);
                break;
            case 'voodoo':
                g.fillStyle(outlineColor, 1);
                g.fillRect(17, 3, 14, 8);
                g.fillStyle(0x7f5db0, 0.9);
                g.fillRect(18, 4, 12, 6);
                g.fillStyle(0xe8dbff, 0.85);
                g.fillRect(20, 6, 2, 2);
                g.fillRect(26, 6, 2, 2);
                g.fillStyle(0x44325f, 1);
                g.fillRect(35, 17, 3, 16);
                g.fillStyle(0xbf7fff, 0.8);
                g.fillCircle(36, 15, 2.5);
                break;
            case 'demolisher':
                g.fillStyle(outlineColor, 1);
                g.fillRect(12, 21, 20, 11);
                g.fillStyle(0x6b5a44, 1);
                g.fillRect(14, 22, 18, 9);
                g.fillStyle(0x3f3f3f, 1);
                g.fillCircle(32, 26, 5);
                g.fillStyle(0x5a5a5a, 0.7);
                g.fillCircle(31, 25, 2);
                g.fillStyle(0xbb9a66, 1);
                g.fillRect(18, 24, 10, 3);
                break;
            case 'ghoul':
                g.fillStyle(outlineColor, 1);
                g.fillCircle(24, 14, 8);
                g.fillStyle(0x7f8ea3, 1);
                g.fillCircle(24, 14, 7);
                g.fillStyle(0xd8e4f4, 0.7);
                g.fillRect(19, 18, 10, 3);
                g.fillStyle(0x52657d, 1);
                g.fillRect(12, 23, 5, 3);
                g.fillRect(31, 23, 5, 3);
                break;
        }

        // 팀 표시 벨트
        g.fillStyle(outlineColor, 1);
        g.fillRect(16, 27, 16, 4);
        g.fillStyle(isBlue ? 0x5b8fd1 : 0xb45a56, 0.95);
        g.fillRect(17, 28, 14, 2);

        // 팀 원형 마커
        g.lineStyle(2, outlineColor, 0.6);
        g.strokeCircle(24, 24, 19);
        g.lineStyle(1.5, palette.fx, 0.75);
        g.strokeCircle(24, 24, 18);

        g.generateTexture(textureKey, 48, 48);
        g.destroy();

        if (!scene.textures.exists(textureKey)) {
            const fallback = scene.add.graphics({ x: 0, y: 0 });
            fallback.fillStyle(palette.body, 1);
            fallback.fillCircle(24, 24, 12);
            fallback.lineStyle(2, palette.trim, 0.9);
            fallback.strokeCircle(24, 24, 12);
            fallback.generateTexture(textureKey, 48, 48);
            fallback.destroy();
        }
    }

    getSprite(): Phaser.GameObjects.Image | null {
        return this.sprite;
    }

    protected setSpriteTexture(textureKey: string, width: number, height: number) {
        if (!this.sprite) return;
        if (this.scene.textures.exists(textureKey)) {
            this.sprite.setTexture(textureKey);
        } else {
            const fallbackKey = Unit.getBattleTextureKey(this.unitKey, this.team, this.stats.attackType);
            Unit.ensureBattleTexture(
                this.scene,
                fallbackKey,
                Unit.getPalette(this.team),
                this.stats.attackType,
                this.unitKey
            );

            if (this.scene.textures.exists(fallbackKey)) {
                this.sprite.setTexture(fallbackKey);
            } else {
                this.sprite.setTexture('__WHITE');
                this.sprite.setTint(Unit.getPalette(this.team).body);
            }
        }
        this.sprite.setDisplaySize(width, height);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGameMap(gameMap: any) {
        this.gameMap = gameMap;
    }

    public setSimulationOrder(order: number) {
        this.simulationOrder = order;
    }

    public getNavigationLane(): BattleLane {
        return this.bridgeLaneLock ?? this.routeLane;
    }

    public getCollisionRadius(): number {
        if (!this.active || this.state === UnitState.DIE || this.stats.movementType === 'air') return 0;
        if (this.isTower) return this.isKingTower ? 28 : 22;
        if (this.duckxelBattleProfile) return this.duckxelBattleProfile.collisionRadius;
        if (this.isDuckxelTestUnit) return 13;
        return this.stats.attackType === 'melee' ? 12 : 10;
    }

    public getCollisionMass(): number {
        if (this.isTower) return Infinity;
        if (this.duckxelBattleProfile) return this.duckxelBattleProfile.collisionMass;
        if (this.role === 'tank') return 2.4;
        if (this.role === 'swarm') return 0.75;
        return 1.2;
    }

    public applyCollisionOffset(dx: number, dy: number) {
        if (this.isTower || this.state === UnitState.DIE || !this.active) return;
        this.x += dx;
        this.y += dy;
        this.clampPosition();
        this.updateSortDepth();
    }

    public requestCombatScan() {
        if (!this.duckxelBattleProfile || this.duckxelBattleProfile.targeting.policy === 'building-only') return;
        this.contactScanRequested = true;
    }

    public updateSortDepth() {
        const sortY = Phaser.Math.Clamp(this.y, 0, CONSTANTS.ARENA.UI_START);
        this.setDepth(CONSTANTS.DEPTH.UNIT + sortY * 0.09);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(_time: number, delta: number, entityManager?: any) {
        if (this.state === UnitState.DIE || !this.active) return;
        this.simulationTimeMs += delta;
        if (entityManager) this.entityManagerRef = entityManager;

        // Reset aura flag each frame (will be reapplied by SkillSystem)
        this.hasDefenseAura = false;
        this.defenseAuraReduction = 0;
        if (this.hogJumpCooldown > 0) {
            this.hogJumpCooldown -= delta;
        }
        if (this.routeSwitchCooldown > 0) {
            this.routeSwitchCooldown -= delta;
        }
        this.updateBridgeLaneLock();
        if (this.contactScanRequested) {
            this.contactScanRequested = false;
            this.acquisitionTimer = 0;
            this.retargetTimer = 0;
            if (!this.target || this.target.isTower) this.targetLockTimer = 0;
        }

        // Stunned/petrified: can't act
        if (this.isStunned) {
            (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            this.updateHpBar();
            this.animateVisual(delta);
            return;
        }

        if (this.updateHogRiverJump()) {
            this.updateHpBar();
            this.updateSortDepth();
            this.animateVisual(delta);
            return;
        }

        // Attack cooldown
        if (this.attackTimer > 0) {
            this.attackTimer -= delta;
        }
        if (this.retargetTimer > 0) {
            this.retargetTimer -= delta;
        }
        if (this.targetLockTimer > 0) {
            this.targetLockTimer -= delta;
        }
        if (this.acquisitionTimer > 0) {
            this.acquisitionTimer -= delta;
        }
        if (this.firstHitTimer > 0) {
            this.firstHitTimer -= delta;
        }
        this.updatePendingGameplayAttack(delta);
        this.updateCombatPerception(entityManager);

        switch (this.state) {
            case UnitState.SPAWN:
                this.spawnTimer -= delta;
                if (this.spawnTimer <= 0) {
                    this.state = UnitState.IDLE;
                    this.acquisitionTimer = this.duckxelBattleProfile?.timing.acquisitionDelay ?? DEFAULT_ACQUISITION_DELAY;
                }
                (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                break;

            case UnitState.IDLE:
                if (!this.duckxelBattleProfile && this.acquisitionTimer <= 0) {
                    this.findTarget(entityManager);
                }
                if (this.target) {
                    this.state = UnitState.CHASE;
                } else {
                    this.state = UnitState.MOVE;
                }
                break;

            case UnitState.MOVE:
                if (!this.duckxelBattleProfile && this.acquisitionTimer <= 0) {
                    this.findTarget(entityManager);
                }
                if (this.target) {
                    this.state = UnitState.CHASE;
                } else {
                    this.moveTowardsLane(delta);
                }
                break;

            case UnitState.CHASE:
                if (!this.isValidTarget()) {
                    this.clearInvalidTarget();
                    break;
                }
                if (!this.duckxelBattleProfile
                    && this.targetLockTimer <= 0
                    && this.retargetTimer <= 0
                    && !this.isInAttackRange()) {
                    this.findTarget(entityManager);
                    this.retargetTimer = 320;
                }
                if (this.isInAttackRange()) {
                    this.state = UnitState.ATTACK;
                    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                    this.startFirstHitDelayIfNeeded();
                } else {
                    this.chase();
                }
                break;

            case UnitState.ATTACK:
                if (!this.isValidTarget()) {
                    this.clearInvalidTarget();
                    break;
                }
                if (!this.isInAttackRange(true)) {
                    this.state = UnitState.CHASE;
                    break;
                }
                this.startFirstHitDelayIfNeeded();
                if (this.attackTimer <= 0 && this.firstHitTimer <= 0) {
                    this.performAttack();
                    this.firstHitPending = false;
                    this.firstHitDelayStarted = false;
                    this.attackTimer = this.stats.attackSpeed;
                }
                break;

            case UnitState.DIE:
                break;
        }

        this.updateHpBar();
        this.clampPosition();
        this.updateSortDepth();
        this.updateRouteProgress(delta);
        this.animateVisual(delta);
    }

    // Duck.xel combat perception runs independently from movement/attack state.
    // This lets a nearby unit preempt a tower target even after tower combat starts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private updateCombatPerception(entityManager: any) {
        if (!this.duckxelBattleProfile || !entityManager) return;
        if (this.state === UnitState.SPAWN || this.state === UnitState.DIE) return;
        if (this.acquisitionTimer > 0 || this.retargetTimer > 0) return;

        this.findTarget(entityManager);
        this.retargetTimer = this.duckxelBattleProfile.targeting.scanInterval;
    }

    private isValidTarget(): boolean {
        if (!this.target) return false;
        if (!this.target.active) return false;
        if (this.target.state === UnitState.DIE) return false;
        if (this.target.stats.hp <= 0) return false;
        if (this.target.isKingTower && !this.target.towerActive) return false;
        if (!this.target.isTower) {
            if (this.duckxelBattleProfile) {
                const mask = this.duckxelBattleProfile.targeting.mask;
                if (!mask.units) return false;
                if (this.target.stats.movementType === 'ground' && !mask.ground) return false;
                if (this.target.stats.movementType === 'air' && !mask.air) return false;
            } else {
                if (this.getTravelCostTo(this.target) > this.getEffectiveSightRange() * 1.45) {
                    return false;
                }
                if (this.hasExceededTargetLeash()) return false;
            }
        }
        return true;
    }

    private isInAttackRange(useExitPadding: boolean = false): boolean {
        if (!this.target) return false;
        return this.isTargetWithinAttackRange(this.target, useExitPadding);
    }

    private isTargetWithinAttackRange(target: Unit, useExitPadding: boolean = false): boolean {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
        const edgeDistance = Math.max(0, dist - this.getCollisionRadius() - target.getCollisionRadius());
        const exitPadding = useExitPadding
            ? (this.duckxelBattleProfile?.tracking.attackExitPadding ?? 8)
            : 0;
        const withinCenterRange = edgeDistance <= this.stats.range + (this.duckxelBattleProfile?.attack.rangePadding ?? 10) + exitPadding;
        if (!withinCenterRange || this.stats.attackType !== 'melee' || !this.entityManagerRef) {
            return withinCenterRange;
        }

        const approach = this.entityManagerRef.getAttackApproachPoint?.(this, target) as { x: number; y: number } | null;
        if (!approach) return withinCenterRange;
        const approachDistance = Phaser.Math.Distance.Between(this.x, this.y, approach.x, approach.y);
        const tolerance = Math.max(useExitPadding ? 13 : 8, this.getCollisionRadius() * (useExitPadding ? 1.15 : 0.72));
        return approachDistance <= tolerance;
    }

    private hasExceededTargetLeash(): boolean {
        const leashDistance = this.duckxelBattleProfile?.tracking.leashDistance ?? 0;
        if (leashDistance <= 0 || !this.targetAnchor || !this.target || this.target.isTower) return false;
        if (this.isTargetWithinAttackRange(this.target, true)) return false;
        return Phaser.Math.Distance.Between(this.targetAnchor.x, this.targetAnchor.y, this.x, this.y) > leashDistance;
    }

    private clearInvalidTarget() {
        const shouldReturnToLane = !this.duckxelBattleProfile && this.hasExceededTargetLeash();
        this.setTarget(null);
        if (shouldReturnToLane) {
            this.acquisitionTimer = 0;
            this.state = UnitState.MOVE;
            return;
        }
        this.state = UnitState.IDLE;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private findTarget(entityManager: any) {
        if (!entityManager) return;

        const myLane = this.getNavigationLane();
        if (this.duckxelBattleProfile) {
            const targeting = this.duckxelBattleProfile.targeting;
            const resolution = resolveCombatTarget({
                actor: this,
                currentTarget: this.target,
                candidates: entityManager.getUnits() as Unit[],
                lane: myLane,
                policy: targeting.policy,
                mask: targeting.mask,
                sightRange: this.getEffectiveSightRange(),
                crossLaneCloseRange: targeting.crossLaneCloseRange,
                sameLanePenalty: targeting.sameLanePenalty,
                bridgeCrossLaneAllowed: targeting.bridgeCrossLaneAllowed,
                bridgeEngagementRange: targeting.bridgeEngagementRange,
                getRouteDistance: (target) => this.getTravelCostTo(target),
                getBridgeCorridor: (target) => this.gameMap?.getBridgeCorridorLane?.(target.x, target.y) ?? null,
                getArenaSide: (target) => this.gameMap?.getArenaSide?.(target.y) ?? 0,
            });
            this.applyTargetCandidate(resolution.target);
            return;
        }

        const isBuildingOnly = this.stats.targetPriority === 'building';

        // 1. 테러형 유닛: 타워만 타겟팅, 적 유닛 무시
        if (isBuildingOnly) {
            this.applyTargetCandidate(this.findNearestTower(entityManager, myLane));
            return;
        }

        // 2. 일반 유닛: 사거리 내 같은 레인 적 유닛 우선
        const closestEnemy = this.findNearestEnemyInRange(entityManager, myLane);
        if (closestEnemy) {
            this.applyTargetCandidate(closestEnemy);
            return;
        }

        // 3. 사거리 내 적이 없으면 같은 레인 타워 타겟팅
        this.applyTargetCandidate(this.findNearestTower(entityManager, myLane));
    }

    private applyTargetCandidate(candidate: Unit | null) {
        if (!candidate || candidate === this.target) return;
        if (!this.target || !this.isValidTarget()) {
            this.setTarget(candidate);
            return;
        }

        if (this.target.isTower && !candidate.isTower) {
            this.setTarget(candidate);
            return;
        }
        if (!this.target.isTower && candidate.isTower) return;

        const currentDistance = this.getTravelCostTo(this.target);
        const candidateDistance = this.getTravelCostTo(candidate);
        const switchAdvantage = this.duckxelBattleProfile?.targeting.switchAdvantage ?? 18;
        if (candidateDistance + switchAdvantage < currentDistance) {
            this.setTarget(candidate);
        }
    }

    private setTarget(target: Unit | null) {
        if (this.target === target) return;
        const wasAttacking = this.state === UnitState.ATTACK;
        if (this.target && this.entityManagerRef) {
            this.entityManagerRef.releaseAttackSlot?.(this);
        }
        this.target = target;
        if (this.pendingGameplayAttack && this.pendingGameplayAttack.target !== target) {
            this.pendingGameplayAttack = null;
        }
        this.targetLockTimer = target ? (this.duckxelBattleProfile?.targeting.lockDuration ?? 430) : 0;
        this.retargetTimer = target ? Math.min(this.duckxelBattleProfile?.targeting.scanInterval ?? 320, 260) : 0;
        this.firstHitPending = Boolean(target);
        this.firstHitDelayStarted = false;
        this.firstHitTimer = 0;
        this.targetAnchor = target ? { x: this.x, y: this.y } : null;
        this.routeStallCount = 0;
        if (target && wasAttacking) {
            this.state = UnitState.CHASE;
        }
        if (target) this.selectRouteLaneForTarget(target);
    }

    private startFirstHitDelayIfNeeded() {
        if (!this.firstHitPending || this.firstHitDelayStarted) return;
        this.firstHitDelayStarted = true;
        this.firstHitTimer = this.duckxelBattleProfile?.timing.firstHitDelay ?? DEFAULT_FIRST_HIT_DELAY;
    }

    private getEffectiveSightRange() {
        const targeting = this.duckxelBattleProfile?.targeting;
        return Phaser.Math.Clamp(
            Math.max(this.stats.sightRange, this.stats.range + 50),
            targeting?.sightMin ?? 90,
            targeting?.sightMax ?? 285
        );
    }

    private getTravelCostTo(target: Unit) {
        if (this.gameMap && typeof this.gameMap.estimatePathDistanceForLane === 'function') {
            return this.gameMap.estimatePathDistanceForLane(
                this.getNavigationLane(),
                this.x,
                this.y,
                target.x,
                target.y
            );
        }
        return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    }

    private selectRouteLaneForTarget(target: Unit, forceAlternate: boolean = false) {
        if (!this.duckxelBattleProfile?.movement.canChangeLane || this.bridgeLaneLock || this.routeSwitchCooldown > 0) return;
        if (!this.gameMap || typeof this.gameMap.estimatePathDistanceForLane !== 'function') return;
        if (this.duckxelBattleProfile.movement.route !== 'ground-bridge') return;

        const leftCost = this.gameMap.estimatePathDistanceForLane('left', this.x, this.y, target.x, target.y);
        const rightCost = this.gameMap.estimatePathDistanceForLane('right', this.x, this.y, target.x, target.y);
        const currentCost = this.routeLane === 'left' ? leftCost : rightCost;
        const otherLane: BattleLane = this.routeLane === 'left' ? 'right' : 'left';
        const otherCost = otherLane === 'left' ? leftCost : rightCost;
        const switchMargin = forceAlternate ? -1 : 18;
        if (otherCost + switchMargin < currentCost) {
            this.routeLane = otherLane;
            this.routeSwitchCooldown = forceAlternate ? 900 : 520;
        }
    }

    private updateBridgeLaneLock() {
        if (!this.gameMap || this.duckxelBattleProfile?.movement.route !== 'ground-bridge') return;
        const corridor = this.gameMap.getBridgeCorridorLane?.(this.x, this.y, 14, 28) as BattleLane | null;
        if (corridor) {
            this.bridgeLaneLock = corridor;
            this.routeLane = corridor;
            return;
        }

        if (!this.bridgeLaneLock) return;
        const clearDistance = CONSTANTS.ARENA.RIVER_HEIGHT / 2 + 54;
        const clearedRiver = Math.abs(this.y - CONSTANTS.ARENA.RIVER_Y) > clearDistance;
        if (clearedRiver) {
            this.bridgeLaneLock = null;
            this.routeSwitchCooldown = Math.max(this.routeSwitchCooldown, 260);
        }
    }

    private updateRouteProgress(delta: number) {
        if (!this.duckxelBattleProfile || this.state === UnitState.SPAWN || this.state === UnitState.ATTACK) {
            this.routeProgressTimer = 0;
            this.routeStallCount = 0;
            this.routeProgressX = this.x;
            this.routeProgressY = this.y;
            return;
        }

        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body.velocity.lengthSq() < 36) {
            this.routeProgressTimer = 0;
            this.routeProgressX = this.x;
            this.routeProgressY = this.y;
            return;
        }

        this.routeProgressTimer += delta;
        if (this.routeProgressTimer < 650) return;

        const progressed = Phaser.Math.Distance.Between(this.routeProgressX, this.routeProgressY, this.x, this.y);
        this.routeProgressTimer = 0;
        this.routeProgressX = this.x;
        this.routeProgressY = this.y;
        if (progressed >= 3.5 || !this.target || this.bridgeLaneLock) {
            this.routeStallCount = 0;
            return;
        }

        this.routeStallCount += 1;
        this.selectRouteLaneForTarget(this.target, true);
        this.retargetTimer = 0;
        if (this.routeStallCount >= 4 && !this.target.isTower) {
            this.setTarget(null);
            this.state = UnitState.MOVE;
            this.acquisitionTimer = 120;
        }
    }

    private findNearestTower(entityManager: any, myLane: 'left' | 'right'): Unit | null {
        const towers = entityManager.getTowers() as Unit[];
        let sameLanePrincess: Unit | null = null;
        let sameLaneKing: Unit | null = null;
        let crossLanePrincess: Unit | null = null;
        let anyKing: Unit | null = null;
        let minSamePrincess = Infinity;
        let minSameKing = Infinity;
        let minCrossPrincess = Infinity;
        let minAnyKing = Infinity;

        for (const tower of towers) {
            if (tower.team === this.team) continue;
            if (!tower.active || tower.state === UnitState.DIE) continue;
            if (tower.stats.hp <= 0) continue;
            if (tower.isKingTower && !tower.towerActive) continue;

            const towerLane = getBattleLaneFromX(tower.x);
            const sameLane = towerLane === myLane;
            const dist = this.getTravelCostTo(tower);

            if (tower.isKingTower) {
                if (sameLane && this.isBetterTargetByDistance(tower, dist, sameLaneKing, minSameKing)) {
                    minSameKing = dist;
                    sameLaneKing = tower;
                }
                if (this.isBetterTargetByDistance(tower, dist, anyKing, minAnyKing)) {
                    minAnyKing = dist;
                    anyKing = tower;
                }
            } else {
                if (sameLane && this.isBetterTargetByDistance(tower, dist, sameLanePrincess, minSamePrincess)) {
                    minSamePrincess = dist;
                    sameLanePrincess = tower;
                } else if (!sameLane && this.isBetterTargetByDistance(tower, dist, crossLanePrincess, minCrossPrincess)) {
                    minCrossPrincess = dist;
                    crossLanePrincess = tower;
                }
            }
        }

        return sameLanePrincess ?? sameLaneKing ?? crossLanePrincess ?? anyKing;
    }

    private findNearestEnemyInRange(entityManager: any, myLane: 'left' | 'right'): Unit | null {
        const units = entityManager.getUnits() as Unit[];
        let closest: Unit | null = null;
        let bestScore = Infinity;
        const targeting = this.duckxelBattleProfile?.targeting;
        const effectiveSightRange = this.getEffectiveSightRange();
        const bridgeCorridorLane = this.gameMap
            && typeof this.gameMap.getBridgeCorridorLane === 'function'
            ? this.gameMap.getBridgeCorridorLane(this.x, this.y)
            : null;
        for (const unit of units) {
            if (unit === this) continue;
            if (unit.team === this.team) continue;
            if (!unit.active || unit.state === UnitState.DIE) continue;
            if (unit.stats.hp <= 0) continue;
            if (unit.isTower) continue;

            if (this.stats.targetPriority === 'ground' && unit.stats.movementType === 'air') continue;
            if (this.stats.targetPriority === 'air' && unit.stats.movementType === 'ground') continue;

            const directDistance = Phaser.Math.Distance.Between(this.x, this.y, unit.x, unit.y);
            const routeDistance = this.getTravelCostTo(unit);
            if (routeDistance > effectiveSightRange) continue;

            const unitLane = unit.getNavigationLane();
            const sameLane = unitLane === myLane;
            const targetBridgeCorridor = this.gameMap
                && typeof this.gameMap.getBridgeCorridorLane === 'function'
                ? this.gameMap.getBridgeCorridorLane(unit.x, unit.y)
                : null;
            if (bridgeCorridorLane) {
                const bridgeEngagementRange = targeting?.bridgeEngagementRange ?? 84;
                if (targetBridgeCorridor !== bridgeCorridorLane || directDistance > bridgeEngagementRange) continue;
            }
            const bridgeCrossLaneAllowed = targeting?.bridgeCrossLaneAllowed ?? true;
            const closeCrossLane = directDistance <= Math.max(this.stats.range + 24, targeting?.crossLaneCloseRange ?? 64);
            const sameBridgeCorridor = Boolean(bridgeCorridorLane && targetBridgeCorridor === bridgeCorridorLane);
            if (!sameLane && !(bridgeCrossLaneAllowed && sameBridgeCorridor) && !closeCrossLane) continue;

            const lanePenalty = sameLane ? 0 : (targeting?.sameLanePenalty ?? 140);
            const score = routeDistance + lanePenalty;
            if (this.isBetterTargetByDistance(unit, score, closest, bestScore)) {
                bestScore = score;
                closest = unit;
            }
        }

        return closest;
    }

    private isBetterTargetByDistance(candidate: Unit, score: number, current: Unit | null, currentScore: number) {
        const epsilon = 0.001;
        if (score < currentScore - epsilon) return true;
        if (Math.abs(score - currentScore) > epsilon) return false;
        return candidate.simulationOrder < (current?.simulationOrder ?? Number.MAX_SAFE_INTEGER);
    }

    private chase() {
        if (!this.target) return;
        const body = this.body as Phaser.Physics.Arcade.Body;
        const speed = this.stats.speed * this.slowFactor;
        this.selectRouteLaneForTarget(this.target);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
        const bridgeWaypoint = this.getBridgeRouteWaypoint();
        if (bridgeWaypoint) {
            const angle = Phaser.Math.Angle.Between(this.x, this.y, bridgeWaypoint.x, bridgeWaypoint.y);
            body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            return;
        }

        // Legacy Chaos units retain their old kiting behavior. Duck.xel ranged
        // profiles advance to range, stop, and attack without orbiting the target.
        if (!this.isTower && this.stats.attackType !== 'melee' && !this.duckxelBattleProfile) {
            const minRange = this.stats.range * (this.stats.attackType === 'splash' ? 0.72 : 0.65);
            const safeRange = this.stats.range * 1.1;

            if (dist < minRange) {
                const retreat = Phaser.Math.Angle.Between(this.target.x, this.target.y, this.x, this.y);
                body.setVelocity(Math.cos(retreat) * speed * 0.72, Math.sin(retreat) * speed * 0.72);
                return;
            }

            if (dist < safeRange) {
                const dir = this.team === 'blue' ? 1 : -1;
                const strafe = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y) + dir * Math.PI / 2;
                body.setVelocity(Math.cos(strafe) * speed * 0.46, Math.sin(strafe) * speed * 0.46);
                return;
            }
        }

        let targetX = this.target.x;
        let targetY = this.target.y;

        if (this.tryStartHogRiverJump(targetX, targetY)) {
            return;
        }

        const attackApproach = this.entityManagerRef?.getAttackApproachPoint?.(this, this.target) as { x: number; y: number } | null;
        if (attackApproach) {
            targetX = attackApproach.x;
            targetY = attackApproach.y;
        }

        if (this.gameMap && typeof this.gameMap.getWaypointTowardsForLane === 'function') {
            const waypoint = this.gameMap.getWaypointTowardsForLane(this.getNavigationLane(), this.x, this.y, targetX, targetY, this.team);
            targetX = waypoint.x;
            targetY = waypoint.y;
        } else if (this.gameMap && typeof this.gameMap.getWaypointTowards === 'function') {
            const waypoint = this.gameMap.getWaypointTowards(this.x, this.y, targetX, targetY, this.team);
            targetX = waypoint.x;
            targetY = waypoint.y;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        body.setVelocity(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed
        );
    }

    private getBridgeRouteWaypoint(): { x: number; y: number } | null {
        if (!this.target || !this.gameMap || typeof this.gameMap.getStrictBridgeWaypointForLane !== 'function') {
            return null;
        }
        return this.gameMap.getStrictBridgeWaypointForLane(this.getNavigationLane(), this.x, this.y, this.target.y, this.team);
    }

    private performAttack() {
        if (!this.target) return;
        this.hitCount++;

        this.scene.events.emit('unitAttack', {
            attacker: this,
            target: this.target,
            hitCount: this.hitCount,
        });

        const teamFx = Unit.getPalette(this.team).fx;

        if (this.isDuckxelTestUnit && this.stats.attackType === 'melee') {
            this.playDuckxelMeleeAttack(this.target, teamFx);
            return;
        }

        if (this.stats.attackType === 'ranged' || this.stats.attackType === 'splash') {
            if (this.unitKey === 'spear_goblin') {
                this.playSpearGoblinAttack(this.target, teamFx);
                return;
            }

            if (this.duckxelBattleProfile) {
                this.playDuckxelProjectileAttack(this.target, teamFx);
                return;
            }

            this.fireProjectileAt(this.target);
            if (this.stats.attackType === 'ranged') {
                this.playRangedMuzzle(teamFx);
                if (this.unitKey === 'royal_giant') {
                    this.playTargetedCannonRecoil();
                } else {
                    this.playRangedRecoil();
                }
            } else {
                this.playMagicCast(teamFx);
                this.playCastStance();
            }
        } else {
            // Melee: instant damage (modified by EntityManager with matchup)
            this.scene.events.emit('meleeDamage', {
                attacker: this,
                target: this.target,
                baseDamage: this.stats.damage,
            });

            this.playMeleeSlash(this.target.x, this.target.y, teamFx);
            this.playMeleeLunge(this.target.x, this.target.y);
            this.target.showHitReaction('melee', teamFx);
        }

        this.playHeroAttackEffect(this.target.x, this.target.y, teamFx);
        this.pulseAttackGlow(teamFx);

        if (this.sprite && !this.duckxelBattleProfile) {
            this.scene.tweens.add({
                targets: this.sprite,
                scaleX: this.spriteBaseScale * 1.16,
                scaleY: this.spriteBaseScale * 0.9,
                duration: 90,
                yoyo: true,
                ease: 'Sine.Out',
                onComplete: () => {
                    if (this.sprite && this.active) this.sprite.setScale(this.spriteBaseScale);
                }
            });
        }
    }

    public showHitReaction(style: 'melee' | 'ranged' | 'splash', color: number) {
        const size = style === 'melee' ? 2.8 : style === 'splash' ? 5.5 : 3.5;
        const ring = this.scene.add.ellipse(this.x, this.y - 4, size * 2.2, size, color, style === 'splash' ? 0.13 : 0.1);
        ring.setDepth(CONSTANTS.DEPTH.PROJECTILE + 3);
        ring.setRotation(Phaser.Math.FloatBetween(-0.55, 0.55));
        ring.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 1.2,
            scaleY: 0.65,
            duration: 72,
            ease: 'Quad.Out',
            onComplete: () => ring.destroy(),
        });

        if (style === 'splash') {
            const inner = this.scene.add.circle(this.x, this.y - 3, 2.4, 0xffffff, 0.12);
            inner.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
            inner.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: inner,
                alpha: 0,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 70,
                onComplete: () => inner.destroy(),
            });
        }

        if (this.sprite) {
            this.sprite.setTint(0xffd2c6);
            this.scene.time.delayedCall(42, () => {
                if (this.sprite && this.active) this.sprite.clearTint();
            });
        }
    }

    private scheduleGameplayAttack(kind: 'melee' | 'projectile', target: Unit, delay: number, color: number) {
        this.pendingGameplayAttack = {
            kind,
            target,
            remaining: Math.max(0, delay),
            color,
        };
    }

    private updatePendingGameplayAttack(delta: number) {
        const pending = this.pendingGameplayAttack;
        if (!pending) return;
        pending.remaining -= delta;
        if (pending.remaining > 0) return;
        this.pendingGameplayAttack = null;

        const target = pending.target;
        if (!this.active || this.state === UnitState.DIE) return;
        if (!target.active || target.state === UnitState.DIE || target.stats.hp <= 0) return;
        if (!this.isTargetWithinAttackRange(target, true)) return;

        if (pending.kind === 'melee') {
            this.scene.events.emit('meleeDamage', {
                attacker: this,
                target,
                baseDamage: this.stats.damage,
            });
            this.playMeleeSlash(target.x, target.y, pending.color);
            target.showHitReaction('melee', pending.color);
            return;
        }

        this.fireProjectileAt(target);
        this.playRangedMuzzle(pending.color);
        if (this.unitKey === 'royal_giant') {
            this.playTargetedCannonRecoil();
        } else {
            this.playRangedRecoil();
        }
        this.playHeroAttackEffect(target.x, target.y, pending.color);
        this.pulseAttackGlow(pending.color);
    }

    public takeDamage(amount: number, attacker: Unit | null = null) {
        if (this.state === UnitState.DIE) return;

        if (attacker && attacker.active && attacker.team !== this.team) {
            this.lastDamageSourceOrder = attacker.simulationOrder || null;
            this.lastDamageAt = this.simulationTimeMs;

            const shouldRetarget = this.duckxelBattleProfile?.reaction?.retargetOnHit === true;
            const canRetarget = this.duckxelBattleProfile?.targeting.policy !== 'building-only';
            const currentTargetInRange = this.target
                ? this.isTargetWithinAttackRange(this.target, true)
                : false;
            const attackerDistance = this.getTravelCostTo(attacker);
            const attackerIsRelevant = attackerDistance <= this.getEffectiveSightRange() * 1.15;
            const hasCommittedUnitTarget = Boolean(
                this.target
                && !this.target.isTower
                && this.isValidTarget(),
            );
            if (shouldRetarget && canRetarget && attackerIsRelevant && !currentTargetInRange && !hasCommittedUnitTarget) {
                this.setTarget(attacker);
                this.state = UnitState.CHASE;
            }
        }

        if (this.hasDefenseAura) {
            amount = Math.floor(amount * (1 - this.defenseAuraReduction));
        }

        this.stats.hp -= amount;

        if (this.isKingTower && !this.towerActive) {
            this.towerActive = true;
            this.scene.events.emit('kingTowerActivated', { team: this.team });
        }

        if (this.stats.hp <= 0) {
            this.die();
        }
    }

    public heal(amount: number) {
        this.stats.hp = Math.min(this.maxHp, this.stats.hp + amount);
    }

    public addDebuff(debuff: Debuff) {
        if (this.isTower) return;
        this.debuffs = this.debuffs.filter(d => d.type !== debuff.type);
        this.debuffs.push(debuff);
    }

    private die() {
        this.stats.hp = 0;
        this.state = UnitState.DIE;
        this.pendingGameplayAttack = null;

        const body = this.body as Phaser.Physics.Arcade.Body;
        body.enable = false;
        body.setVelocity(0, 0);

        if (this.isTower) {
            this.scene.events.emit('towerDestroyed', { team: this.team, isKing: this.isKingTower });
            this.playTowerDestroySequence();
        }

        this.scene.events.emit('unitDeath', { unit: this });

        const burstRadius = this.isTower ? 28 : 16;
        const burst = this.scene.add.circle(this.x, this.y - 2, burstRadius, Unit.getPalette(this.team).fx, 0.52);
        burst.setDepth(CONSTANTS.DEPTH.PROJECTILE + 2);
        burst.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: burst,
            alpha: 0,
            scaleX: this.isTower ? 2.8 : 2.2,
            scaleY: this.isTower ? 2.8 : 2.2,
            duration: this.isTower ? 380 : 220,
            ease: 'Quad.Out',
            onComplete: () => burst.destroy(),
        });

        const core = this.scene.add.circle(this.x, this.y - 2, this.isTower ? 14 : 8, 0xffffff, 0.65);
        core.setDepth(CONSTANTS.DEPTH.PROJECTILE + 3);
        core.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: core,
            alpha: 0,
            scaleX: 1.8,
            scaleY: 1.8,
            duration: this.isTower ? 200 : 120,
            onComplete: () => core.destroy(),
        });

        const fadeDuration = this.isTower ? 600 : 360;
        const fadeDelay = this.isTower ? 180 : 0;
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            scaleX: 0.3,
            scaleY: 0.3,
            duration: fadeDuration,
            delay: fadeDelay,
            ease: 'Power2',
            onComplete: () => {
                this.active = false;
                this.visible = false;
                this.destroy();
            }
        });
    }

    private playTowerDestroySequence() {
        const palette = Unit.getPalette(this.team);
        if (this.scene.textures.exists('battle_arena_royal_valley')) {
            this.createArenaTowerRuin();
        }

        // 1) Sprite shake — 3회 좌우 흔들림
        if (this.sprite) {
            this.scene.tweens.add({
                targets: this.sprite,
                x: { from: -5, to: 5 },
                duration: 70,
                repeat: 3,
                yoyo: true,
                ease: 'Sine.InOut',
            });
        }

        // 2) Debris 파편 5개 사방으로 퍼짐
        const debrisCount = this.isKingTower ? 7 : 5;
        for (let i = 0; i < debrisCount; i++) {
            const angle = (Math.PI * 2 * i) / debrisCount + (Math.random() - 0.5) * 0.6;
            const dist = 18 + Math.random() * 22;
            const w = 3 + Math.random() * 5;
            const h = 3 + Math.random() * 4;
            const debris = this.scene.add.rectangle(
                this.x + (Math.random() - 0.5) * 8,
                this.y - 8 + (Math.random() - 0.5) * 6,
                w, h, 0xc8b89c, 0.92
            );
            debris.setDepth(CONSTANTS.DEPTH.PROJECTILE + 3);
            debris.angle = Math.random() * 360;
            this.scene.tweens.add({
                targets: debris,
                x: this.x + Math.cos(angle) * dist,
                y: this.y + Math.sin(angle) * dist - 24,
                alpha: 0,
                angle: debris.angle + 200 * (Math.random() > 0.5 ? 1 : -1),
                duration: 380 + Math.random() * 200,
                ease: 'Quad.Out',
                onComplete: () => debris.destroy(),
            });
        }

        // 3) 화염 파티클 — 팀 색 불꽃
        for (let i = 0; i < 3; i++) {
            const flame = this.scene.add.circle(
                this.x + (Math.random() - 0.5) * 16,
                this.y - 10 + (Math.random() - 0.5) * 10,
                5 + Math.random() * 5,
                i === 0 ? 0xff6622 : palette.fx,
                0.72
            );
            flame.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
            flame.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: flame,
                y: flame.y - 20 - Math.random() * 14,
                alpha: 0,
                scaleX: 1.6,
                scaleY: 1.6,
                duration: 320 + i * 80,
                ease: 'Sine.Out',
                onComplete: () => flame.destroy(),
            });
        }

        // 4) Charred base — 그을린 원형 베이스 영구 잔존
        const charredWidth = this.isKingTower ? 60 : 52;
        const charredHeight = this.isKingTower ? 12 : 10;
        const charredY = this.isKingTower ? 23 : 16;
        const charred = this.scene.add.ellipse(this.x, this.y + charredY, charredWidth, charredHeight, 0x1a1a1a, 0.52);
        charred.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        // 서서히 등장
        charred.setAlpha(0);
        this.scene.tweens.add({
            targets: charred,
            alpha: 0.6,
            duration: 300,
            delay: 100,
            ease: 'Sine.Out',
        });
    }

    private createArenaTowerRuin() {
        const ruin = this.scene.add.container(this.x, this.y);
        ruin.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 2);

        const type = this.isKingTower ? 'king' : 'princess';
        const assetKey = `battle_rubble_${this.team}_${type}`;
        if (this.scene.textures.exists(assetKey)) {
            const rubble = this.scene.add.image(0, this.isKingTower ? 29 : 21, assetKey);
            rubble.setOrigin(0.5, 1);
            rubble.setDisplaySize(this.isKingTower ? 68 : 60, this.isKingTower ? 68 : 48);
            ruin.add(rubble);

            ruin.setAlpha(0);
            this.scene.tweens.add({
                targets: ruin,
                alpha: 1,
                duration: 220,
                ease: 'Sine.Out',
            });
            return;
        }

        const coverW = this.isKingTower ? 70 : 58;
        const coverH = this.isKingTower ? 48 : 42;
        const coverY = this.isKingTower ? -16 : -14;

        const smoke = this.scene.add.ellipse(0, coverY, coverW, coverH, 0x05070b, 0.58);
        const ash = this.scene.add.ellipse(0, coverY + 15, coverW * 0.82, coverH * 0.36, 0x101018, 0.72);
        const glow = this.scene.add.ellipse(0, coverY + 6, coverW * 0.62, coverH * 0.3, this.team === 'blue' ? 0x4eb7ff : 0xff7358, 0.18);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        ruin.add([smoke, ash, glow]);

        const chunks = this.isKingTower ? 8 : 6;
        for (let i = 0; i < chunks; i++) {
            const px = Phaser.Math.Between(-Math.round(coverW * 0.35), Math.round(coverW * 0.35));
            const py = Phaser.Math.Between(Math.round(coverY), Math.round(coverY + coverH * 0.45));
            const block = this.scene.add.rectangle(px, py, Phaser.Math.Between(4, 9), Phaser.Math.Between(3, 7), 0x2a2522, 0.86);
            block.angle = Phaser.Math.Between(-28, 28);
            ruin.add(block);
        }

        ruin.setAlpha(0);
        this.scene.tweens.add({
            targets: ruin,
            alpha: 1,
            duration: 220,
            ease: 'Sine.Out',
        });
    }

    private tryStartHogRiverJump(targetX: number, targetY: number): boolean {
        if (this.duckxelBattleProfile?.behavior !== 'building-jump') return false;
        if (this.isRiverJumping || this.hogJumpCooldown > 0) return false;
        if (!this.gameMap || typeof this.gameMap.isInRiver !== 'function') return false;

        const riverTop = CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const riverBottom = CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const movingAcrossRiver = this.team === 'blue'
            ? this.y > riverBottom - 8 && targetY < riverTop + 8
            : this.y < riverTop + 8 && targetY > riverBottom - 8;
        if (!movingAcrossRiver) return false;

        const approachBand = this.team === 'blue'
            ? this.y <= riverBottom + 44
            : this.y >= riverTop - 44;
        if (!approachBand) return false;

        const laneX = Phaser.Math.Clamp(
            Phaser.Math.Linear(this.x, targetX, 0.22),
            this.getNavigationLane() === 'left' ? 42 : CONSTANTS.SCREEN_WIDTH / 2 + 18,
            this.getNavigationLane() === 'left' ? CONSTANTS.SCREEN_WIDTH / 2 - 18 : CONSTANTS.SCREEN_WIDTH - 42
        );
        const landingY = this.team === 'blue' ? riverTop - 24 : riverBottom + 24;
        this.startHogRiverJump(laneX, landingY);
        return true;
    }

    private startHogRiverJump(landingX: number, landingY: number) {
        if (!this.sprite) return;
        this.isRiverJumping = true;
        this.hogJumpTarget = { x: landingX, y: landingY };
        this.duckxelAttackPlaying = true;
        const body = this.body as Phaser.Physics.Arcade.Body;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, landingX, landingY);
        const jumpSpeed = Math.max(this.stats.speed * 1.9, 116);
        body.setVelocity(Math.cos(angle) * jumpSpeed, Math.sin(angle) * jumpSpeed);
        this.duckxelDirection = this.getDuckxelDirection(landingX - this.x, landingY - this.y);
        this.duckxelFrameIndex = 0;
        this.duckxelFrameTimer = 0;
        const forwardFrameKey = `${this.duckxelAssetProfile?.texturePrefix}_${this.duckxelDirection}_0`;
        if (this.duckxelAssetProfile && this.scene.textures.exists(forwardFrameKey)) {
            this.sprite.setTexture(forwardFrameKey);
            const displaySize = this.getDuckxelDisplaySize();
            this.sprite.setDisplaySize(displaySize, displaySize);
            this.sprite.setScale(this.spriteBaseScale);
        }

        this.scene.tweens.killTweensOf(this.sprite);
        this.scene.tweens.add({
            targets: this.sprite,
            y: -34,
            scaleX: this.spriteBaseScale * 1.03,
            scaleY: this.spriteBaseScale * 1.03,
            duration: 170,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (!this.sprite || !this.active) return;
                this.sprite.y = -7;
                this.sprite.setScale(this.spriteBaseScale);
            },
        });

        this.scene.tweens.add({
            targets: this.shadow,
            scaleX: 0.72,
            scaleY: 0.55,
            alpha: 0.18,
            duration: 170,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (!this.active) return;
                this.shadow.alpha = 1;
            },
        });
    }

    private updateHogRiverJump(): boolean {
        if (!this.isRiverJumping || !this.hogJumpTarget) return false;
        const body = this.body as Phaser.Physics.Arcade.Body;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.hogJumpTarget.x, this.hogJumpTarget.y);
        if (dist <= 9) {
            this.x = this.hogJumpTarget.x;
            this.y = this.hogJumpTarget.y;
            body.setVelocity(0, 0);
            this.isRiverJumping = false;
            this.hogJumpTarget = null;
            this.hogJumpCooldown = 850;
            this.duckxelAttackPlaying = false;
            this.duckxelFrameTimer = 0;
            this.state = UnitState.IDLE;
            this.clampPosition();
            return false;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.hogJumpTarget.x, this.hogJumpTarget.y);
        const jumpSpeed = Math.max(this.stats.speed * 1.9, 116);
        body.setVelocity(Math.cos(angle) * jumpSpeed, Math.sin(angle) * jumpSpeed);
        return true;
    }

    private moveTowardsLane(_delta: number) {
        const body = this.body as Phaser.Physics.Arcade.Body;
        const direction = this.team === 'blue' ? -1 : 1;
        const speed = this.stats.speed * this.slowFactor;
        const advanceTargetY = this.team === 'blue' ? CONSTANTS.ARENA.TOP + 90 : CONSTANTS.ARENA.UI_START - 90;
        if (this.tryStartHogRiverJump(this.x, advanceTargetY)) {
            return;
        }

        if (this.gameMap && typeof this.gameMap.getAdvanceWaypointForLane === 'function') {
            const waypoint = this.gameMap.getAdvanceWaypointForLane(this.getNavigationLane(), this.x, this.y, this.team);
            const angle = Phaser.Math.Angle.Between(this.x, this.y, waypoint.x, waypoint.y);
            body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            return;
        }

        if (this.gameMap && typeof this.gameMap.getAdvanceWaypoint === 'function') {
            const waypoint = this.gameMap.getAdvanceWaypoint(this.x, this.y, this.team);
            const angle = Phaser.Math.Angle.Between(this.x, this.y, waypoint.x, waypoint.y);
            body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            return;
        }

        const myLane = this.getNavigationLane();
        const bridgeX = myLane === 'left'
            ? CONSTANTS.ARENA.BRIDGE_LEFT_X
            : CONSTANTS.ARENA.BRIDGE_RIGHT_X;
        const laneDrift = Phaser.Math.Clamp((bridgeX - this.x) * 0.22, -speed * 0.55, speed * 0.55);
        body.setVelocity(laneDrift, direction * speed);
    }

    private updateHpBar() {
        const pct = Math.max(0, this.stats.hp / this.maxHp);
        this.hpBarFill.scaleX = pct;

        if (pct > 0.75) {
            this.hpBarFill.setFillStyle(CONSTANTS.COLORS.HP_GREEN);
        } else if (pct > 0.5) {
            this.hpBarFill.setFillStyle(0xdddd44);
        } else {
            this.hpBarFill.setFillStyle(CONSTANTS.COLORS.HP_RED);
        }
    }

    private clampPosition() {
        if (this.isRiverJumping) {
            this.x = Phaser.Math.Clamp(this.x, 18, CONSTANTS.SCREEN_WIDTH - 18);
            this.y = Phaser.Math.Clamp(this.y, 24, CONSTANTS.ARENA.UI_START - 38);
            return;
        }

        if (this.gameMap && typeof this.gameMap.projectToWalkable === 'function') {
            const projected = this.gameMap.projectToWalkable(this.x, this.y);
            this.x = projected.x;
            this.y = projected.y;
            return;
        }

        if (this.x < 5) this.x = 5;
        if (this.x > CONSTANTS.SCREEN_WIDTH - 5) this.x = CONSTANTS.SCREEN_WIDTH - 5;

        const minY = 20;
        const maxY = CONSTANTS.ARENA.UI_START - 10;
        if (this.y < minY) this.y = minY;
        if (this.y > maxY) this.y = maxY;
    }

    private animateVisual(delta: number) {
        const body = this.body as Phaser.Physics.Arcade.Body;
        const velocity = body.velocity.length();
        const moving = velocity > 4 && (this.state === UnitState.MOVE || this.state === UnitState.CHASE);

        if (this.isDuckxelTestUnit) {
            this.updateDuckxelWalkFrame(delta, body.velocity.x, body.velocity.y, moving);
            if (this.sprite && !this.duckxelAttackPlaying) {
                this.sprite.y = -7;
                this.sprite.rotation = Phaser.Math.Linear(this.sprite.rotation, 0, 0.2);
                if (!this.scene.tweens.isTweening(this.sprite)) {
                    this.sprite.setScale(this.spriteBaseScale);
                }
            }
            const targetShadowX = moving ? 1.04 : 1;
            const targetShadowY = moving ? 0.94 : 1;
            this.shadow.scaleX = Phaser.Math.Linear(this.shadow.scaleX, targetShadowX, 0.14);
            this.shadow.scaleY = Phaser.Math.Linear(this.shadow.scaleY, targetShadowY, 0.14);
            this.attackGlow.alpha = Math.max(0, this.attackGlow.alpha - delta * 0.0035);
            return;
        }

        this.walkPhase += delta * (moving ? 0.02 : 0.008);
        const styleBobBoost = this.stats.attackType === 'splash' ? 0.5 : this.stats.attackType === 'ranged' ? 0.2 : 0;
        const bob = Math.sin(this.walkPhase) * (moving ? 1.5 + styleBobBoost : 0.4 + styleBobBoost * 0.4);

        if (this.sprite) {
            this.sprite.y = -2 + bob;

            if (!this.isDuckxelTestUnit && Math.abs(body.velocity.x) > 4) {
                this.sprite.setFlipX(body.velocity.x < 0);
            }

            if (!this.scene.tweens.isTweening(this.sprite)) {
                const stretchBase = this.stats.attackType === 'melee' ? 0.085 : this.stats.attackType === 'ranged' ? 0.05 : 0.035;
                const stretch = moving ? 1 + Math.abs(Math.cos(this.walkPhase)) * stretchBase : 1;
                this.sprite.setScale(this.spriteBaseScale * stretch, this.spriteBaseScale / stretch);
            }

            const maxLean = this.stats.attackType === 'melee' ? 0.16 : this.stats.attackType === 'ranged' ? 0.1 : 0.08;
            const targetLean = moving ? Phaser.Math.Clamp(body.velocity.x / 160, -maxLean, maxLean) : 0;
            this.sprite.rotation = Phaser.Math.Linear(this.sprite.rotation, targetLean, 0.18);
        }

        const targetShadowX = moving ? 1.1 : 1;
        const targetShadowY = moving ? 0.8 : 1;
        this.shadow.scaleX = Phaser.Math.Linear(this.shadow.scaleX, targetShadowX, 0.14);
        this.shadow.scaleY = Phaser.Math.Linear(this.shadow.scaleY, targetShadowY, 0.14);
        this.attackGlow.alpha = Math.max(0, this.attackGlow.alpha - delta * 0.0035);
    }

    private updateDuckxelWalkFrame(delta: number, velocityX: number, velocityY: number, moving: boolean) {
        if (!this.sprite) return;
        if (this.duckxelAttackPlaying) return;
        if (this.isRiverJumping) return;
        if (!this.duckxelAssetProfile) return;

        const direction = this.getDuckxelDirection(velocityX, velocityY);
        const frameCount = this.duckxelAssetProfile.walkFrameCounts[direction];
        if (direction !== this.duckxelDirection) {
            this.duckxelDirection = direction;
            this.duckxelFrameIndex = 0;
            this.duckxelFrameTimer = 0;
        }

        if (moving) {
            this.duckxelFrameTimer += delta;
            const movementSpeed = Math.hypot(velocityX, velocityY);
            const frameDuration = Phaser.Math.Clamp(3100 / Math.max(18, movementSpeed), 95, 175);
            if (this.duckxelFrameTimer >= frameDuration) {
                this.duckxelFrameTimer = 0;
                this.duckxelFrameIndex = (this.duckxelFrameIndex + 1) % frameCount;
            }
        } else {
            this.duckxelFrameIndex = 0;
            this.duckxelFrameTimer = 0;
        }

        const frameKey = `${this.duckxelAssetProfile.texturePrefix}_${this.duckxelDirection}_${this.duckxelFrameIndex}`;
        if (this.scene.textures.exists(frameKey) && this.sprite.texture.key !== frameKey) {
            this.sprite.setTexture(frameKey);
            const displaySize = this.getDuckxelDisplaySize();
            this.sprite.setDisplaySize(displaySize, displaySize);
            this.sprite.setScale(this.spriteBaseScale);
        }
    }

    private getDuckxelDisplaySize() {
        return this.duckxelBattleProfile?.displaySize ?? this.duckxelAssetProfile?.displaySize ?? 62;
    }

    private getDuckxelDirection(velocityX: number, velocityY: number): DuckxelDirection {
        const absX = Math.abs(velocityX);
        const absY = Math.abs(velocityY);
        if (absX < 6 && absY < 6) return this.duckxelDirection;

        const previousVertical = this.duckxelDirection.startsWith('north') ? 'north' : 'south';
        const vertical = absY < absX * 0.45
            ? previousVertical
            : velocityY < 0 ? 'north' : 'south';
        const horizontal = absX < 8
            ? this.duckxelDirection.endsWith('west') ? 'west' : 'east'
            : velocityX < 0 ? 'west' : 'east';

        return `${vertical}-${horizontal}` as DuckxelDirection;
    }

    private playDuckxelMeleeAttack(target: Unit, color: number) {
        if (!this.sprite) return;
        if (!this.duckxelAssetProfile) return;

        this.duckxelAttackPlaying = true;
        this.duckxelDirection = this.getDuckxelDirection(target.x - this.x, target.y - this.y);
        const profile = this.duckxelAssetProfile;
        const frameCount = profile.attackFrameCounts[this.duckxelDirection];
        const frameDuration = this.duckxelBattleProfile?.attack.frameDuration ?? 90;
        const hitFrame = Math.min(this.duckxelBattleProfile?.attack.hitFrame ?? 2, frameCount - 1);
        this.scheduleGameplayAttack('melee', target, hitFrame * frameDuration, color);

        for (let frame = 0; frame < frameCount; frame++) {
            this.scene.time.delayedCall(frame * frameDuration, () => {
                if (!this.active || !this.sprite || this.state === UnitState.DIE) return;
                const frameKey = `${profile.texturePrefix}_attack_${this.duckxelDirection}_${frame}`;
                if (!this.scene.textures.exists(frameKey)) return;
                this.sprite.setTexture(frameKey);
                const displaySize = this.getDuckxelDisplaySize();
                this.sprite.setDisplaySize(displaySize, displaySize);
                this.sprite.setScale(this.spriteBaseScale);
            });
        }

        this.scene.time.delayedCall(frameCount * frameDuration, () => {
            this.duckxelAttackPlaying = false;
            this.duckxelFrameIndex = 0;
            this.duckxelFrameTimer = 0;
        });
    }

    private playDuckxelRangedAttack(target: Unit, color: number) {
        if (!this.sprite) return;
        if (!this.duckxelAssetProfile) {
            this.playSpearThrowMotion();
            return;
        }

        this.duckxelAttackPlaying = true;
        this.duckxelDirection = this.getDuckxelDirection(target.x - this.x, target.y - this.y);
        const profile = this.duckxelAssetProfile;
        const frameCount = profile.attackFrameCounts[this.duckxelDirection];
        if (frameCount <= 0) {
            this.playSpearThrowMotion();
            return;
        }

        const frameDuration = this.duckxelBattleProfile?.attack.frameDuration ?? 75;
        for (let frame = 0; frame < frameCount; frame++) {
            this.scene.time.delayedCall(frame * frameDuration, () => {
                if (!this.active || !this.sprite || this.state === UnitState.DIE) return;
                const frameKey = `${profile.texturePrefix}_attack_${this.duckxelDirection}_${frame}`;
                if (!this.scene.textures.exists(frameKey)) return;
                this.sprite.setTexture(frameKey);
                const displaySize = this.getDuckxelDisplaySize();
                this.sprite.setDisplaySize(displaySize, displaySize);
                this.sprite.setScale(this.spriteBaseScale);
            });
        }

        this.scene.time.delayedCall(Math.max(130, frameCount * frameDuration), () => {
            this.duckxelAttackPlaying = false;
            this.duckxelFrameIndex = 0;
            this.duckxelFrameTimer = 0;
            if (!this.active || !this.sprite || this.state === UnitState.DIE) return;
            const idleKey = `${profile.texturePrefix}_${this.duckxelDirection}_0`;
            if (this.scene.textures.exists(idleKey)) {
                this.sprite.setTexture(idleKey);
                const displaySize = this.getDuckxelDisplaySize();
                this.sprite.setDisplaySize(displaySize, displaySize);
                this.sprite.setScale(this.spriteBaseScale);
            }
        });

        if (this.unitKey === 'spear_goblin') {
            this.scene.time.delayedCall(35, () => {
                if (!this.active || this.state === UnitState.DIE) return;
                this.playSpearThrowMotion();
            });
        } else {
            this.pulseAttackGlow(color);
        }
    }

    private playDuckxelProjectileAttack(target: Unit, color: number) {
        const frameDuration = this.duckxelBattleProfile?.attack.frameDuration ?? 90;
        const hitFrame = this.duckxelBattleProfile?.attack.hitFrame ?? 1;
        const launchDelay = Math.max(45, hitFrame * frameDuration);
        this.duckxelAttackPlaying = true;
        this.scheduleGameplayAttack('projectile', target, launchDelay, color);

        this.scene.time.delayedCall(launchDelay + 190, () => {
            this.duckxelAttackPlaying = false;
            this.restoreDuckxelIdleFrame();
        });
    }

    private pulseAttackGlow(color: number) {
        this.attackGlow.setFillStyle(color, 0.55);
        this.attackGlow.setScale(1, 1);
        this.attackGlow.setAlpha(0.55);
        this.scene.tweens.add({
            targets: this.attackGlow,
            scaleX: 1.7,
            scaleY: 1.7,
            alpha: 0,
            duration: 220,
            ease: 'Quad.Out',
        });
    }

    private playMeleeSlash(targetX: number, targetY: number, color: number) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        const x = this.x + Math.cos(angle) * 14;
        const y = this.y + Math.sin(angle) * 14;

        const slash = this.scene.add.ellipse(x, y, 24, 10, color, 0.85);
        slash.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
        slash.setRotation(angle);
        slash.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: slash,
            scaleX: 2.2,
            scaleY: 0.2,
            alpha: 0,
            duration: 140,
            ease: 'Sine.Out',
            onComplete: () => slash.destroy(),
        });

        const spark = this.scene.add.circle(x, y, 4, 0xffffff, 0.7);
        spark.setDepth(CONSTANTS.DEPTH.PROJECTILE + 5);
        spark.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: spark,
            alpha: 0,
            scaleX: 2.5,
            scaleY: 2.5,
            duration: 100,
            onComplete: () => spark.destroy(),
        });
    }

    private playRangedMuzzle(color: number) {
        const origin = this.getProjectileOrigin();
        const flash = this.scene.add.circle(origin.x, origin.y, this.unitKey === 'royal_giant' ? 8 : 6, color, 1);
        flash.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
        flash.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: flash,
            scaleX: this.unitKey === 'royal_giant' ? 3.3 : 2.8,
            scaleY: this.unitKey === 'royal_giant' ? 3.3 : 2.8,
            alpha: 0,
            duration: this.unitKey === 'royal_giant' ? 135 : 110,
            ease: 'Quad.Out',
            onComplete: () => flash.destroy(),
        });

        const core = this.scene.add.circle(origin.x, origin.y, this.unitKey === 'royal_giant' ? 4 : 3, 0xffffff, 0.9);
        core.setDepth(CONSTANTS.DEPTH.PROJECTILE + 5);
        core.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: core,
            alpha: 0,
            scaleX: 1.8,
            scaleY: 1.8,
            duration: 80,
            onComplete: () => core.destroy(),
        });
    }

    private playMagicCast(color: number) {
        const ring = this.scene.add.circle(this.x, this.y - 6, 9, color, 0.52);
        ring.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
        ring.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: ring,
            scaleX: 2.6,
            scaleY: 2.6,
            alpha: 0,
            duration: 160,
            ease: 'Sine.Out',
            onComplete: () => ring.destroy(),
        });

        const inner = this.scene.add.circle(this.x, this.y - 6, 4, 0xffffff, 0.65);
        inner.setDepth(CONSTANTS.DEPTH.PROJECTILE + 5);
        inner.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: inner,
            alpha: 0,
            scaleX: 2.2,
            scaleY: 2.2,
            duration: 120,
            onComplete: () => inner.destroy(),
        });
    }

    private playMeleeLunge(targetX: number, targetY: number) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        const ox = this.x;
        const oy = this.y;
        const dash = 5.5;
        this.scene.tweens.add({
            targets: this,
            x: ox + Math.cos(angle) * dash,
            y: oy + Math.sin(angle) * dash,
            duration: 70,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (!this.active) return;
                this.x = ox;
                this.y = oy;
            }
        });
    }

    private playRangedRecoil() {
        if (!this.sprite) return;
        const recoilX = this.team === 'blue' ? 1.8 : -1.8;
        this.scene.tweens.add({
            targets: this.sprite,
            x: -recoilX,
            duration: 70,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (this.sprite && this.active) this.sprite.x = 0;
            }
        });
    }

    private getProjectileOrigin() {
        if (!this.target || (this.unitKey !== 'royal_giant' && this.unitKey !== 'spear_goblin')) {
            return { x: this.x, y: this.y - 5 };
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
        const forward = this.duckxelBattleProfile?.attack.projectileForward ?? (this.unitKey === 'spear_goblin' ? 13 : 16);
        const lift = this.duckxelBattleProfile?.attack.projectileLift ?? (this.unitKey === 'spear_goblin' ? 10 : 8);
        return {
            x: this.x + Math.cos(angle) * forward,
            y: this.y + Math.sin(angle) * forward - lift,
        };
    }

    private fireProjectileAt(target: Unit) {
        const projectileOrigin = this.getProjectileOrigin();
        this.scene.events.emit('fireProjectile', {
            fromX: projectileOrigin.x,
            fromY: projectileOrigin.y,
            target,
            damage: this.stats.damage,
            projectileKey: this.stats.projectileKey || 'projectile_tower',
            splash: this.stats.attackType === 'splash' ? (this.stats.splashRadius || 40) : 0,
            team: this.team,
            attackerRole: this.role,
            attacker: this,
            attackType: this.stats.attackType,
        });
    }

    private playSpearGoblinAttack(target: Unit, color: number) {
        this.playDuckxelRangedAttack(target, color);
        this.playHeroAttackEffect(target.x, target.y, color);
        this.pulseAttackGlow(color);
        const frameDuration = this.duckxelBattleProfile?.attack.frameDuration ?? 75;
        const hitFrame = this.duckxelBattleProfile?.attack.hitFrame ?? 1;
        const launchDelay = Math.max(75, hitFrame * frameDuration + 30);
        this.scheduleGameplayAttack('projectile', target, launchDelay, color);

        this.scene.time.delayedCall(launchDelay + 130, () => {
            this.duckxelAttackPlaying = false;
            this.restoreDuckxelIdleFrame();
        });
    }

    private restoreDuckxelIdleFrame() {
        if (!this.active || !this.sprite || !this.duckxelAssetProfile) return;
        const idleKey = `${this.duckxelAssetProfile.texturePrefix}_${this.duckxelDirection}_0`;
        if (!this.scene.textures.exists(idleKey)) return;
        this.sprite.setTexture(idleKey);
        const displaySize = this.getDuckxelDisplaySize();
        this.sprite.setDisplaySize(displaySize, displaySize);
        this.sprite.setScale(this.spriteBaseScale);
        this.sprite.x = 0;
        this.sprite.y = -2;
    }

    private playTargetedCannonRecoil() {
        if (!this.sprite || !this.target) return;

        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
        const recoilDistance = 9;
        this.duckxelAttackPlaying = true;
        this.scene.tweens.add({
            targets: this.sprite,
            x: -Math.cos(angle) * recoilDistance,
            y: -Math.sin(angle) * recoilDistance - 2,
            duration: 95,
            yoyo: true,
            hold: 35,
            ease: 'Sine.Out',
            onComplete: () => {
                if (this.sprite && this.active) {
                    this.sprite.x = 0;
                    this.sprite.y = -2;
                }
                this.duckxelAttackPlaying = false;
            }
        });
    }

    private playSpearThrowMotion() {
        if (!this.sprite || !this.target) return;

        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
        this.duckxelAttackPlaying = true;
        this.scene.tweens.add({
            targets: this.sprite,
            x: Math.cos(angle) * 4.5,
            y: Math.sin(angle) * 4.5 - 4,
            scaleX: this.spriteBaseScale * 1.08,
            scaleY: this.spriteBaseScale * 0.94,
            duration: 70,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (this.sprite && this.active) {
                    this.sprite.x = 0;
                    this.sprite.y = -2;
                    this.sprite.setScale(this.spriteBaseScale);
                }
                this.duckxelAttackPlaying = false;
            }
        });
    }

    private playCastStance() {
        if (!this.sprite) return;
        this.scene.tweens.add({
            targets: this.sprite,
            y: -9,
            duration: 110,
            yoyo: true,
            ease: 'Sine.Out',
            onComplete: () => {
                if (this.sprite && this.active) this.sprite.y = -2;
            }
        });
    }

    private playHeroAttackEffect(targetX: number, targetY: number, color: number) {
        const depth = CONSTANTS.DEPTH.PROJECTILE + 4;
        switch (this.unitKey) {
            case 'raiden': {
                const bolt = this.scene.add.rectangle(this.x, this.y - 4, 3, 22, 0xa9dbff, 0.85);
                bolt.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                bolt.rotation = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY) + Math.PI / 2;
                this.scene.tweens.add({
                    targets: bolt,
                    alpha: 0,
                    scaleY: 1.8,
                    duration: 120,
                    onComplete: () => bolt.destroy(),
                });
                break;
            }
            case 'viper': {
                const venom = this.scene.add.circle(targetX, targetY - 4, 5, 0x6bdc6e, 0.38);
                venom.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: venom,
                    alpha: 0,
                    scaleX: 1.9,
                    scaleY: 1.9,
                    duration: 220,
                    onComplete: () => venom.destroy(),
                });
                break;
            }
            case 'medusa': {
                const beam = this.scene.add.rectangle((this.x + targetX) / 2, (this.y + targetY) / 2 - 4, 4, 8, 0x9fd66a, 0.46);
                beam.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                beam.setRotation(Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY));
                beam.displayWidth = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
                this.scene.tweens.add({
                    targets: beam,
                    alpha: 0,
                    duration: 170,
                    onComplete: () => beam.destroy(),
                });
                break;
            }
            case 'agamemnon': {
                const rune = this.scene.add.circle(targetX, targetY, 10, 0xff9246, 0.22);
                rune.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: rune,
                    rotation: Math.PI,
                    alpha: 0,
                    scaleX: 1.8,
                    scaleY: 1.8,
                    duration: 260,
                    onComplete: () => rune.destroy(),
                });
                break;
            }
            case 'akasha': {
                for (let i = 0; i < 2; i++) {
                    const bat = this.scene.add.triangle(this.x, this.y - 5, 0, 0, 8, 2, 2, 8, 0xe077d4, 0.75);
                    bat.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                    this.scene.tweens.add({
                        targets: bat,
                        x: this.x + (i === 0 ? -10 : 10),
                        y: this.y - 20,
                        alpha: 0,
                        duration: 240 + i * 40,
                        onComplete: () => bat.destroy(),
                    });
                }
                break;
            }
            case 'stone_cold':
            case 'muradin':
            case 'demolisher':
            case 'ghoul':
            case 'voodoo':
            default: {
                const pulse = this.scene.add.circle(targetX, targetY - 2, 7, color, 0.22);
                pulse.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: pulse,
                    alpha: 0,
                    scaleX: 2,
                    scaleY: 2,
                    duration: 180,
                    onComplete: () => pulse.destroy(),
                });
                break;
            }
        }
    }
}
