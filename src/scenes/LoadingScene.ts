import Phaser from 'phaser';
import { configureLogicalCamera, getLayout } from '../core/Resolution';
import { createUISkinTextures } from '../ui/UISkinFactory';
import { UI_ATLAS_IMAGES, uiAtlasPath } from '../ui/UIAssetManifest';
import { GAME_FONT, GAME_TITLE_FONT, ko } from '../i18n/ko';
import { dispatchChaosNavigation } from '../app/bridge';
import {
    DUCKXEL_ASSET_PROFILES,
    DUCKXEL_BATTLE_DIRECTIONS,
    resolveDuckxelDirectionAnimation,
} from '../data/DuckxelAnimationCatalog';

const UI_FONT = GAME_FONT;
const TITLE_FONT = GAME_TITLE_FONT;

/**
 * Loading scene - loads all sprite assets before entering battle.
 */
export default class LoadingScene extends Phaser.Scene {
    constructor() {
        super({ key: 'loading' });
    }

    preload() {
        configureLogicalCamera(this);
        const { width, height, centerX: cx } = getLayout();

        createUISkinTextures(this);
        this.createLoadingBackdrop(width, height);

        this.loadUiAtlasAssets();
        // React now owns non-battle app screens; only battle/loading assets are loaded here.
        this.loadBattleKoAssets();
        this.loadBattleArenaParts();
        this.load.image('battle_arena_royal_valley', 'assets/ui/battle_arena_royal_valley.png');

        const logo = this.createLogo(cx, 286);
        logo.setDepth(10);

        this.add.rectangle(cx, 500, 268, 12, 0x111a2b, 1)
            .setStrokeStyle(2, 0x5f7190, 0.9)
            .setDepth(10);

        const progressFill = this.add.rectangle(cx - 132, 500, 0, 8, 0x71a7ff, 1);
        progressFill.setOrigin(0, 0.5);
        progressFill.setDepth(11);

        const progressGlow = this.add.rectangle(cx - 132, 500, 0, 14, 0xa9c8ff, 0.14);
        progressGlow.setOrigin(0, 0.5);
        progressGlow.setDepth(10);

        const loadingText = this.add.text(cx, 532, ko.loading.loading, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#dce2f7',
        }).setOrigin(0.5).setDepth(10);

        const subtitle = this.add.text(cx, 558, ko.loading.preparing, {
            fontSize: '11px',
            fontFamily: UI_FONT,
            fontStyle: '600',
            color: '#8796b0',
        }).setOrigin(0.5).setDepth(10);

        const percentText = this.add.text(cx, 474, '0%', {
            fontSize: '11px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#9fb6db',
        }).setOrigin(0.5).setDepth(10);

        this.load.on('progress', (value: number) => {
            const fillWidth = 264 * value;
            progressFill.width = fillWidth;
            progressGlow.width = fillWidth;
            percentText.setText(`${Math.round(value * 100)}%`);
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
        Object.values(DUCKXEL_ASSET_PROFILES).forEach((profile) => {
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

                const skillDefinition = profile.previewActions.skill;
                const resolvedSkill = skillDefinition
                    ? resolveDuckxelDirectionAnimation(profile, 'skill', direction)
                    : null;
                if (skillDefinition && resolvedSkill) {
                    for (let frame = 0; frame < resolvedSkill.directionDefinition.frameCount; frame++) {
                        this.load.image(
                            `unit_${profile.unitKey}_skill_${direction}_${frame}`,
                            `assets/sprites/duckxel/${skillDefinition.folder}/${resolvedSkill.sourceDirection}/frame-${String(frame).padStart(2, '0')}.png`
                        );
                    }
                }
            });
        });
        for (let frame = 0; frame < 4; frame++) {
            this.load.image(
                `vfx_earthbreaker_impact_${frame}`,
                `assets/sprites/duckxel/muradin_vfx/impact/frame-${String(frame).padStart(2, '0')}.png`
            );
        }

        this.load.on('complete', () => {
            this.ensureFallbackTextures();
            loadingText.setText(ko.loading.ready);
            subtitle.setText(ko.loading.starting);
            percentText.setText('100%');
            progressFill.width = 264;
            progressGlow.width = 264;
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

    private resolveInitialScene(): 'lobby' | 'deck' | 'clan' | 'main-scene' | 'game-over' {
        if (typeof window === 'undefined') return 'lobby';
        const scene = new URLSearchParams(window.location.search).get('scene');
        if (scene === 'lobby') return 'lobby';
        if (scene === 'deck') return 'deck';
        if (scene === 'shop') return 'lobby';
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
        bg.fillGradientStyle(0x111827, 0x111827, 0x070b13, 0x070b13, 1);
        bg.fillRect(0, 0, width, height);
        bg.fillStyle(0xffffff, 0.025);
        for (let y = 96; y < height - 96; y += 48) {
            bg.fillRect(24, y, width - 48, 1);
        }
        bg.lineStyle(1, 0x6f82a6, 0.22);
        bg.strokeRoundedRect(12, 12, width - 24, height - 24, 14);
    }

    private createLogo(x: number, y: number) {
        const container = this.add.container(x, y);

        container.add(this.add.text(0, -16, `${ko.loading.logoTop} ${ko.loading.logoBottom}`, {
            fontSize: '30px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#eef3ff',
            stroke: '#0a101c',
            strokeThickness: 3,
        }).setOrigin(0.5));

        container.add(this.add.text(0, 24, 'TACTICAL ARENA', {
            fontSize: '10px',
            fontFamily: UI_FONT,
            fontStyle: '700',
            color: '#8796b0',
        }).setOrigin(0.5));

        const divider = this.add.graphics();
        divider.lineStyle(1, 0x7183a5, 0.5);
        divider.lineBetween(-86, 52, 86, 52);
        container.add(divider);

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
