import Phaser from 'phaser';
import { configureLogicalCamera, getLayout } from '../core/Resolution';
import { createUISkinTextures } from '../ui/UISkinFactory';
import { UI_ATLAS_IMAGES, uiAtlasPath } from '../ui/UIAssetManifest';
import { GAME_FONT, GAME_TITLE_FONT, ko } from '../i18n/ko';
import { dispatchChaosNavigation } from '../app/bridge';

const UI_FONT = GAME_FONT;
const TITLE_FONT = GAME_TITLE_FONT;
const DUCKXEL_BATTLE_DIRECTIONS = ['north-east', 'north-west', 'south-east', 'south-west'] as const;
const DUCKXEL_ASSET_PROFILES = [
    {
        unitKey: 'duckxel_sword_man',
        assetFolder: 'sword_man',
        baseFile: 'sword_man_red.png',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 3 },
    },
    {
        unitKey: 'duckxel_barbarian',
        assetFolder: 'barbarian',
        baseFile: 'barbarian_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 2, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 4, 'south-west': 4 },
    },
    {
        unitKey: 'royal_giant',
        assetFolder: 'royal_giant',
        baseFile: 'royal_giant_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 0, 'north-west': 0, 'south-east': 0, 'south-west': 0 },
    },
    {
        unitKey: 'spear_goblin',
        assetFolder: 'spear_goblin',
        baseFile: 'spear_goblin_red.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 4, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 4, 'north-west': 4, 'south-east': 3, 'south-west': 4 },
    },
    {
        unitKey: 'skeleton_swordsman',
        assetFolder: 'skeleton_swordsman',
        baseFile: 'skeleton_swordsman_red.png',
        walkFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 6, 'south-west': 6 },
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 3, 'south-west': 3 },
    },
    {
        unitKey: 'hog_rider',
        assetFolder: 'hog_rider',
        baseFile: 'hog_rider/south-east/frame-00.png',
        walkFrameCounts: { 'north-east': 6, 'north-west': 6, 'south-east': 5, 'south-west': 5 },
        attackFrameCounts: { 'north-east': 3, 'north-west': 3, 'south-east': 4, 'south-west': 4 },
    },
] as const;

/**
 * Loading scene - loads all sprite assets before entering battle.
 */
export default class LoadingScene extends Phaser.Scene {
    private stitchedProgressFill?: Phaser.GameObjects.Image;
    private stitchedProgressGlow?: Phaser.GameObjects.Image;
    private stitchedLoadingText?: Phaser.GameObjects.Text;
    private stitchedUiCreated = false;

    constructor() {
        super({ key: 'loading' });
    }

    preload() {
        configureLogicalCamera(this);
        const { width, height, centerX: cx } = getLayout();

        createUISkinTextures(this);
        this.createLoadingBackdrop(width, height);

        this.loadUiAtlasAssets();
        const loadingKoKeys = this.loadLoadingKoAssets();
        const loadedLoadingKoKeys = new Set<string>();
        this.load.on('filecomplete', (key: string) => {
            if (!loadingKoKeys.includes(key)) return;
            loadedLoadingKoKeys.add(key);
            if (loadedLoadingKoKeys.size === loadingKoKeys.length) {
                this.createStitchedLoadingUi(width, height, cx);
            }
        });
        // React now owns non-battle app screens; only battle/loading assets are loaded here.
        this.loadBattleKoAssets();
        this.loadBattleArenaParts();
        this.load.image('battle_arena_royal_valley', 'assets/ui/battle_arena_royal_valley.png');
        this.load.once('filecomplete-image-battle_arena_royal_valley', () => {
            const bg = this.add.image(cx, height / 2, 'battle_arena_royal_valley');
            bg.setDisplaySize(width * 1.18, height * 1.18);
            bg.setAlpha(0.42);
            bg.setTint(0x9fb3d8);
            bg.setDepth(1);
            this.createLoadingVignette(width, height, 2);
        });

        const logo = this.createLogo(cx, 302);
        logo.setDepth(10);

        const progressFrame = this.add.image(cx, 580, 'ui_elixir_bar').setDepth(10);
        progressFrame.setDisplaySize(276, 34);

        const progressFill = this.add.rectangle(55, 580, 0, 12, 0x4f7dff, 1);
        progressFill.setOrigin(0, 0.5);
        progressFill.setDepth(11);

        const progressGlow = this.add.rectangle(55, 580, 0, 18, 0xb8c4ff, 0.2);
        progressGlow.setOrigin(0, 0.5);
        progressGlow.setDepth(10);

        const loadingText = this.add.text(cx, 616, ko.loading.loading, {
            fontSize: '12px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#dce2f7',
            stroke: '#000000',
            strokeThickness: 1,
        }).setOrigin(0.5).setDepth(10);

        this.tweens.add({
            targets: loadingText,
            alpha: 0.48,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const subtitle = this.add.text(cx, 644, ko.loading.preparing, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '600',
            color: '#c4c5d5',
        }).setOrigin(0.5).setAlpha(0.82).setDepth(10);

        this.load.on('progress', (value: number) => {
            const fillWidth = 250 * value;
            progressFill.width = fillWidth;
            progressGlow.width = fillWidth;
            this.stitchedProgressFill?.setDisplaySize(244 * value, 18);
            this.stitchedProgressGlow?.setDisplaySize(252 * value, 24);
        });

        // Unit sprites are generated procedurally in Unit.ts - no pre-loading needed.
        const portraitMappings: Record<string, string> = {
            chan: 'chen',
            maiev: 'Maiev',
        };
        const portraits = [
            'maiev', 'adas', 'agamemnon', 'agni', 'akasha', 'akiro', 'alien', 'azgaro',
            'berserker', 'blood_imp', 'broken_count',
            'chan',
            'darae', 'drukker', 'dudu',
            'eldin',
            'ferda', 'froad', 'furion',
            'galitos', 'garae', 'grime', 'grommash', 'gruul', 'gyros',
            'illidan', 'irea',
            'kanzel', 'karen_hoof', 'kartus', 'kelzad',
            'lady_death', 'leonik', 'lokan', 'lucifer',
            'magenda', 'medusa', 'melshid', 'mermadun', 'muradin', 'mutant',
            'naisha', 'nazgrel', 'nipi', 'nivas',
            'obli',
            'rafford', 'raiden', 'reina', 'rikian',
            'setiar', 'shakajan', 'silk', 'solvenhim', 'sparrow', 'stone_cold', 'sylvanas',
            'talon', 'troublemaker', 'tyrande',
            'venazar', 'viper',
            'zerdin', 'zodiac',
        ];

        portraits.forEach((key) => {
            const fileKey = portraitMappings[key] || key;
            this.load.image(`portrait_card_${key}`, `assets/portraits_card/${key}.png`);
            this.load.image(`portrait_hd_${key}`, `assets/portraits_hd/${key}.png`);
            this.load.image(`portrait_${key}`, `assets/portraits/${fileKey}.webp`);
        });

        this.load.image('grass_light', 'assets/tiles/grass_light.png');
        this.load.image('grass_dark', 'assets/tiles/grass_dark.png');

        this.load.image('tower_king_blue', 'assets/sprites/tower_king_blue.png');
        this.load.image('tower_king_red', 'assets/sprites/tower_king_red.png');
        this.load.image('tower_princess_blue', 'assets/sprites/tower_princess_blue.png');
        this.load.image('tower_princess_red', 'assets/sprites/tower_princess_red.png');
        this.load.image('projectile_arrow', 'assets/sprites/projectile_arrow.png');
        this.load.image('projectile_fireball', 'assets/sprites/projectile_fireball.png');
        this.load.image('projectile_magic', 'assets/sprites/projectile_magic.png');
        this.load.image('projectile_tower', 'assets/sprites/projectile_tower.png');
        this.load.image('effect_hit', 'assets/sprites/effect_hit.png');
        this.load.image('effect_spawn', 'assets/sprites/effect_spawn.png');
        this.load.image('unit_seoultech_student_blue', 'assets/sprites/seoultech_student.png');
        DUCKXEL_ASSET_PROFILES.forEach((profile) => {
            this.load.image(`unit_${profile.unitKey}_red`, `assets/sprites/duckxel/${profile.baseFile}`);
            this.load.image(`portrait_card_${profile.unitKey}`, `assets/sprites/duckxel/${profile.baseFile}`);

            DUCKXEL_BATTLE_DIRECTIONS.forEach((direction) => {
                const walkFrameCount = profile.walkFrameCounts[direction];
                for (let frame = 0; frame < walkFrameCount; frame++) {
                    this.load.image(
                        `unit_${profile.unitKey}_${direction}_${frame}`,
                        `assets/sprites/duckxel/${profile.assetFolder}/${direction}/frame-${String(frame).padStart(2, '0')}.png`
                    );
                }

                const attackFrameCount = profile.attackFrameCounts[direction];
                for (let frame = 0; frame < attackFrameCount; frame++) {
                    this.load.image(
                        `unit_${profile.unitKey}_attack_${direction}_${frame}`,
                        `assets/sprites/duckxel/${profile.assetFolder}_attack/${direction}/frame-${String(frame).padStart(2, '0')}.png`
                    );
                }
            });
        });

        this.load.on('complete', () => {
            this.ensureFallbackTextures();
            subtitle.setText(ko.loading.ready);
            this.stitchedLoadingText?.setText(ko.loading.ready);
            progressFill.width = 250;
            progressGlow.width = 250;
            this.stitchedProgressFill?.setDisplaySize(244, 18);
            this.stitchedProgressGlow?.setDisplaySize(252, 24);
            this.time.delayedCall(280, () => {
                const initialScene = this.resolveInitialScene();
                if (initialScene === 'main-scene') {
                    dispatchChaosNavigation({ route: 'battle' });
                    this.scene.start('main-scene');
                    return;
                }
                if (initialScene === 'game-over') {
                    dispatchChaosNavigation({
                        result: {
                            winner: 'blue',
                            blueCrowns: 2,
                            redCrowns: 1,
                            playerName: ko.lobby.playerName,
                            opponentName: ko.result.sentinelGuard,
                            arenaName: ko.lobby.arenaName,
                        },
                    });
                    return;
                }
                dispatchChaosNavigation({ route: initialScene });
            });
        });

        this.load.start();
    }

    private resolveInitialScene(): 'lobby' | 'deck' | 'shop' | 'clan' | 'main-scene' | 'game-over' {
        if (typeof window === 'undefined') return 'lobby';
        const scene = new URLSearchParams(window.location.search).get('scene');
        if (scene === 'lobby') return 'lobby';
        if (scene === 'deck') return 'deck';
        if (scene === 'shop') return 'shop';
        if (scene === 'clan') return 'clan';
        if (scene === 'battle') return 'main-scene';
        if (scene === 'gameover') return 'game-over';
        return 'lobby';
    }

    create() {
        // Handled by preload complete callback.
    }

    private loadUiAtlasAssets() {
        UI_ATLAS_IMAGES.forEach((key) => {
            this.load.image(key, uiAtlasPath(key));
        });
    }

    private loadLoadingKoAssets() {
        const keys = [
            'logo',
            'chest',
            'arena_background',
            'progress_frame',
            'progress_fill',
            'progress_glow',
            'text_plate_empty',
            'spark_blue',
            'spark_purple',
            'spark_white',
        ];
        keys.forEach((key) => {
            this.load.image(`loading_ko_${key}`, `assets/ui/loading_ko/${key}.png`);
        });
        return keys.map((key) => `loading_ko_${key}`);
    }

    private createStitchedLoadingUi(width: number, height: number, cx: number) {
        if (this.stitchedUiCreated) return;
        this.stitchedUiCreated = true;

        const baseDepth = 30;
        const arena = this.add.image(cx, 252, 'loading_ko_arena_background')
            .setDisplaySize(width * 1.12, 262)
            .setAlpha(0.92)
            .setDepth(baseDepth);
        arena.setTint(0xcbd7ff);

        const upperShade = this.add.rectangle(cx, 0, width, 220, 0x050912, 0.34)
            .setOrigin(0.5, 0)
            .setDepth(baseDepth + 1);
        const lowerShade = this.add.rectangle(cx, 490, width, height - 490, 0x050912, 0.7)
            .setOrigin(0.5, 0)
            .setDepth(baseDepth + 1);

        this.add.image(cx, 174, 'loading_ko_logo')
            .setDisplaySize(292, 86)
            .setDepth(baseDepth + 4);

        const chest = this.add.image(cx, 390, 'loading_ko_chest')
            .setDisplaySize(118, 132)
            .setDepth(baseDepth + 4);
        this.tweens.add({
            targets: chest,
            y: 380,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.add.image(cx, 572, 'loading_ko_progress_frame')
            .setDisplaySize(284, 39)
            .setDepth(baseDepth + 4);

        this.stitchedProgressGlow = this.add.image(cx - 122, 572, 'loading_ko_progress_glow')
            .setOrigin(0, 0.5)
            .setDisplaySize(0, 24)
            .setAlpha(0.82)
            .setDepth(baseDepth + 5);
        this.stitchedProgressFill = this.add.image(cx - 122, 572, 'loading_ko_progress_fill')
            .setOrigin(0, 0.5)
            .setDisplaySize(0, 18)
            .setDepth(baseDepth + 6);

        this.add.image(cx, 628, 'loading_ko_text_plate_empty')
            .setDisplaySize(172, 38)
            .setDepth(baseDepth + 4);
        this.stitchedLoadingText = this.add.text(cx, 628, ko.loading.loading, {
            fontSize: '12px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#eef3ff',
            stroke: '#050912',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(baseDepth + 5);

        this.tweens.add({
            targets: this.stitchedLoadingText,
            alpha: 0.56,
            duration: 820,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const particles = [
            this.add.image(cx - 98, 404, 'loading_ko_spark_blue').setScale(0.18),
            this.add.image(cx + 92, 386, 'loading_ko_spark_purple').setScale(0.18),
            this.add.image(cx + 2, 328, 'loading_ko_spark_white').setScale(0.13),
        ];
        particles.forEach((particle, index) => {
            particle.setDepth(baseDepth + 3).setAlpha(0.58);
            this.tweens.add({
                targets: particle,
                alpha: 0.18,
                scale: particle.scale + 0.04,
                duration: 900 + index * 180,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        });

        upperShade.setBlendMode(Phaser.BlendModes.MULTIPLY);
        lowerShade.setBlendMode(Phaser.BlendModes.MULTIPLY);
    }

    private loadBattleKoAssets() {
        [
            'hud_red_empty',
            'hud_blue_empty',
            'timer_empty',
            'forfeit_modal',
            'result_victory_banner',
            'result_defeat_banner',
            'result_blank_banner',
            'button_battle_again',
            'button_lobby',
        ].forEach((key) => {
            this.load.image(`battle_ko_${key}`, `assets/ui/battle_ko/${key}.png`);
        });
    }

    private loadBattleArenaParts() {
        const base = 'assets/battle/royal_valley_parts';
        [
            ['arena_base_royal_valley_parts', 'arena_base.png'],
            ['battle_tower_blue_king_idle', 'tower_blue_king_idle.png'],
            ['battle_tower_blue_princess_idle', 'tower_blue_princess_idle.png'],
            ['battle_tower_red_king_idle', 'tower_red_king_idle.png'],
            ['battle_tower_red_princess_idle', 'tower_red_princess_idle.png'],
            ['battle_tower_blue_king_damaged', 'tower_blue_king_damaged.png'],
            ['battle_tower_blue_princess_damaged', 'tower_blue_princess_damaged.png'],
            ['battle_tower_red_king_damaged', 'tower_red_king_damaged.png'],
            ['battle_tower_red_princess_damaged', 'tower_red_princess_damaged.png'],
            ['battle_rubble_blue_king', 'normalized/rubble_blue_king.png'],
            ['battle_rubble_blue_princess', 'normalized/rubble_blue_princess.png'],
            ['battle_rubble_red_king', 'normalized/rubble_red_king.png'],
            ['battle_rubble_red_princess', 'normalized/rubble_red_princess.png'],
            ['battle_vfx_muzzle_blue', 'vfx_muzzle_blue.png'],
            ['battle_vfx_muzzle_red', 'vfx_muzzle_red.png'],
            ['battle_vfx_hit_blue', 'vfx_hit_blue.png'],
            ['battle_vfx_hit_red', 'vfx_hit_red.png'],
            ['battle_vfx_dust', 'vfx_dust.png'],
            ['battle_vfx_smoke', 'vfx_smoke.png'],
        ].forEach(([key, file]) => {
            this.load.image(key, `${base}/${file}`);
        });

        const stitchBase = 'assets/battle/stitch_arena';
        [
            ['stitch_arena_river_strip', 'river_strip.png'],
            ['stitch_arena_bridge_wood', 'bridge_wood.png'],
            ['stitch_arena_bridge_stone', 'bridge_stone.png'],
            ['stitch_arena_side_wall_left', 'side_wall_left.png'],
            ['stitch_arena_side_wall_right', 'side_wall_right.png'],
            ['stitch_arena_decor_red_top', 'decor_red_top.png'],
            ['stitch_arena_decor_blue_bottom', 'decor_blue_bottom.png'],
            ['stitch_arena_river_bank_top', 'river_bank_top.png'],
            ['stitch_arena_river_bank_bottom', 'river_bank_bottom.png'],
        ].forEach(([key, file]) => {
            this.load.image(key, `${stitchBase}/${file}`);
        });
    }

    private createLoadingBackdrop(width: number, height: number) {
        const bg = this.add.graphics().setDepth(0);
        bg.fillGradientStyle(0x101827, 0x101827, 0x070e1d, 0x070e1d, 1);
        bg.fillRect(0, 0, width, height);
        bg.fillStyle(0x1e40af, 0.16);
        bg.fillCircle(64, 220, 170);
        bg.fillStyle(0x830096, 0.14);
        bg.fillCircle(width - 24, 410, 190);
        this.createLoadingVignette(width, height, 3);
    }

    private createLoadingVignette(width: number, height: number, depth: number) {
        const shade = this.add.graphics().setDepth(depth);
        shade.fillGradientStyle(0x0c1322, 0x0c1322, 0x070e1d, 0x070e1d, 0.18, 0.18, 0.98, 1);
        shade.fillRect(0, 0, width, height);
        shade.fillStyle(0x000000, 0.18);
        shade.fillRect(0, 0, width, 92);
        shade.fillRect(0, height - 120, width, 120);
    }

    private createLogo(x: number, y: number) {
        const container = this.add.container(x, y);

        const glow = this.add.graphics();
        glow.fillStyle(0xb8c4ff, 0.13);
        glow.fillEllipse(0, 12, 252, 118);
        container.add(glow);

        container.add(this.add.text(0, -24, ko.loading.logoTop, {
            fontSize: '44px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#eef3ff',
            stroke: '#050912',
            strokeThickness: 7,
        }).setOrigin(0.5));

        container.add(this.add.text(0, 22, ko.loading.logoBottom, {
            fontSize: '44px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#b8c4ff',
            stroke: '#050912',
            strokeThickness: 7,
        }).setOrigin(0.5));

        const chest = this.add.container(0, 112);
        const aura = this.add.graphics();
        aura.fillStyle(0x830096, 0.22);
        aura.fillEllipse(0, 14, 106, 46);
        chest.add(aura);

        const body = this.add.graphics();
        body.fillStyle(0x3f245f, 1);
        body.fillRoundedRect(-34, -16, 68, 42, 8);
        body.fillStyle(0x7254a8, 1);
        body.fillRoundedRect(-28, -26, 56, 22, 8);
        body.lineStyle(3, 0xfbabff, 0.72);
        body.strokeRoundedRect(-34, -16, 68, 42, 8);
        body.strokeRoundedRect(-28, -26, 56, 22, 8);
        body.fillStyle(0xfbabff, 1);
        body.fillCircle(0, 4, 8);
        chest.add(body);
        container.add(chest);

        this.tweens.add({
            targets: chest,
            y: 104,
            duration: 1300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        return container;
    }

    private ensureFallbackTextures() {
        this.createGenericUnitTexture('unit_generic_blue', 0x5fa8ff, 0x264f89);
        this.createGenericUnitTexture('unit_generic_red', 0xf27068, 0x8a2e2a);
    }

    private createGenericUnitTexture(textureKey: string, bodyColor: number, armorColor: number) {
        if (this.textures.exists(textureKey)) return;

        const g = this.add.graphics({ x: 0, y: 0 });
        g.fillStyle(armorColor, 1);
        g.fillRoundedRect(15, 20, 18, 14, 5);
        g.fillStyle(bodyColor, 1);
        g.fillRoundedRect(17, 21, 14, 12, 4);
        g.fillStyle(0xe7f2ff, 0.95);
        g.fillCircle(24, 13, 7);
        g.fillStyle(0x101826, 0.75);
        g.fillCircle(21, 12, 1.2);
        g.fillCircle(27, 12, 1.2);
        g.fillStyle(armorColor, 1);
        g.fillRect(18, 33, 4, 6);
        g.fillRect(26, 33, 4, 6);
        g.lineStyle(1.5, 0xffffff, 0.35);
        g.strokeCircle(24, 24, 18);
        g.generateTexture(textureKey, 48, 48);
        g.destroy();
    }
}
