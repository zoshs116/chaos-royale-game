import Phaser from 'phaser';
import { CONSTANTS } from './Constants';
import { GAME_FONT } from '../i18n/ko';

type Team = 'blue' | 'red';
type HitStyle = 'melee' | 'ranged' | 'splash';

export default class EffectManager {
    private readonly scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    playSummon(x: number, y: number, team: Team) {
        const color = team === 'blue' ? 0x76c8ff : 0xff7c6e;
        const depth = CONSTANTS.DEPTH.UNIT - 2;

        if (this.scene.textures.exists('effect_spawn')) {
            const sprite = this.scene.add.image(x, y - 2, 'effect_spawn');
            sprite.setDepth(depth + 1);
            sprite.setDisplaySize(76, 76);
            sprite.setTint(color);
            sprite.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: sprite,
                alpha: 0,
                scaleX: 1.28,
                scaleY: 1.28,
                y: y - 11,
                duration: 500,
                ease: 'Sine.Out',
                onComplete: () => sprite.destroy(),
            });
        }

        const shadow = this.scene.add.ellipse(x, y + 11, 34, 12, 0x000000, 0.32);
        shadow.setDepth(CONSTANTS.DEPTH.UNIT_SHADOW - 1);
        this.scene.tweens.add({
            targets: shadow,
            alpha: 0,
            scaleX: 1.7,
            scaleY: 1.2,
            duration: 360,
            ease: 'Quad.Out',
            onComplete: () => shadow.destroy(),
        });

        const ring = this.scene.add.circle(x, y + 4, 13, color, 0.34);
        ring.setDepth(depth);
        ring.setStrokeStyle(3, 0xffffff, 0.5);
        ring.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 3.1,
            scaleY: 1.45,
            duration: 520,
            ease: 'Quad.Out',
            onComplete: () => ring.destroy(),
        });

        const pillar = this.scene.add.rectangle(x, y - 6, 18, 48, color, 0.24);
        pillar.setDepth(CONSTANTS.DEPTH.UNIT - 1);
        pillar.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: pillar,
            alpha: 0,
            y: y - 22,
            scaleX: 2.1,
            duration: 420,
            ease: 'Sine.Out',
            onComplete: () => pillar.destroy(),
        });

        this.scatterSparks(x, y + 4, color, 9, 20, 380);
    }

    playHit(x: number, y: number, style: HitStyle, color: number, _amount?: number) {
        const radius = style === 'splash' ? 11 : style === 'melee' ? 5.5 : 6.5;
        const depth = CONSTANTS.DEPTH.PROJECTILE + 5;

        if (this.scene.textures.exists('effect_hit')) {
            const sprite = this.scene.add.image(x, y - 4, 'effect_hit');
            sprite.setDepth(depth + 2);
            sprite.setDisplaySize(style === 'splash' ? 36 : 24, style === 'splash' ? 36 : 24);
            sprite.setTint(color);
            sprite.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: sprite,
                alpha: 0,
                scaleX: style === 'splash' ? 1.18 : 1.06,
                scaleY: style === 'splash' ? 1.18 : 1.06,
                duration: style === 'splash' ? 150 : 88,
                ease: 'Quad.Out',
                onComplete: () => sprite.destroy(),
            });
        }

        const burst = this.scene.add.circle(x, y - 4, radius, color, style === 'splash' ? 0.2 : 0.14);
        burst.setDepth(depth);
        burst.setStrokeStyle(1, 0xffffff, style === 'splash' ? 0.16 : 0.1);
        burst.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: burst,
            alpha: 0,
            scaleX: style === 'splash' ? 1.55 : 1.28,
            scaleY: style === 'splash' ? 1.55 : 1.28,
            duration: style === 'splash' ? 135 : 84,
            ease: 'Quad.Out',
            onComplete: () => burst.destroy(),
        });

        const core = this.scene.add.circle(x, y - 4, style === 'splash' ? 3 : 2, 0xffffff, 0.3);
        core.setDepth(depth + 1);
        core.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: core,
            alpha: 0,
            scaleX: 1.35,
            scaleY: 1.35,
            duration: 65,
            ease: 'Sine.Out',
            onComplete: () => core.destroy(),
        });

        this.playImpactStreaks(x, y - 4, style, color);
        this.scatterSparks(x, y - 4, style === 'splash' ? 0xffd18a : color, style === 'splash' ? 3 : 2, style === 'splash' ? 10 : 5, 110);
    }

    playDeath(x: number, y: number, team: Team, large = false) {
        const color = team === 'blue' ? 0x7ec6ff : 0xff9d86;
        const depth = CONSTANTS.DEPTH.PROJECTILE + 4;
        const radius = large ? 30 : 17;

        const wave = this.scene.add.circle(x, y - 2, radius, color, 0.38);
        wave.setDepth(depth);
        wave.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: wave,
            alpha: 0,
            scaleX: large ? 3.1 : 2.4,
            scaleY: large ? 3.1 : 2.4,
            duration: large ? 420 : 260,
            ease: 'Quad.Out',
            onComplete: () => wave.destroy(),
        });

        const dust = this.scene.add.ellipse(x, y + 8, large ? 48 : 30, large ? 15 : 10, 0x1d2434, 0.55);
        dust.setDepth(CONSTANTS.DEPTH.UNIT_SHADOW);
        this.scene.tweens.add({
            targets: dust,
            alpha: 0,
            scaleX: 1.5,
            duration: large ? 520 : 340,
            ease: 'Sine.Out',
            onComplete: () => dust.destroy(),
        });

        this.scatterSparks(x, y - 4, color, large ? 12 : 7, large ? 30 : 18, large ? 440 : 280);
    }

    playInvalidPlacement(x: number, y: number) {
        const marker = this.scene.add.circle(x, y, 20, 0xff4f6e, 0.2);
        marker.setDepth(CONSTANTS.DEPTH.OVERLAY);
        marker.setStrokeStyle(3, 0xff6f87, 0.92);
        marker.setBlendMode(Phaser.BlendModes.ADD);

        const slashA = this.scene.add.rectangle(x, y, 36, 4, 0xffb3c0, 0.92);
        const slashB = this.scene.add.rectangle(x, y, 36, 4, 0xffb3c0, 0.92);
        slashA.setRotation(Math.PI / 4);
        slashB.setRotation(-Math.PI / 4);
        slashA.setDepth(CONSTANTS.DEPTH.OVERLAY + 1);
        slashB.setDepth(CONSTANTS.DEPTH.OVERLAY + 1);

        this.scene.tweens.add({
            targets: [marker, slashA, slashB],
            alpha: 0,
            scaleX: 1.45,
            scaleY: 1.45,
            duration: 260,
            ease: 'Quad.Out',
            onComplete: () => {
                marker.destroy();
                slashA.destroy();
                slashB.destroy();
            },
        });
    }

    playUiText(x: number, y: number, text: string, color = '#ffd6df') {
        const bg = this.scene.add.graphics();
        bg.setDepth(CONSTANTS.DEPTH.OVERLAY + 1);
        bg.fillStyle(0x050912, 0.82);
        bg.fillRoundedRect(x - 78, y - 18, 156, 32, 9);
        bg.lineStyle(1.5, 0xffffff, 0.16);
        bg.strokeRoundedRect(x - 78, y - 18, 156, 32, 9);

        const label = this.scene.add.text(x, y - 2, text, {
            fontSize: '12px',
            fontFamily: GAME_FONT,
            fontStyle: '900',
            color,
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);
        label.setDepth(CONSTANTS.DEPTH.OVERLAY + 2);
        label.setResolution(2);

        this.scene.tweens.add({
            targets: [bg, label],
            y: '-=26',
            alpha: 0,
            duration: 760,
            ease: 'Cubic.Out',
            onComplete: () => {
                bg.destroy();
                label.destroy();
            },
        });
    }

    playPlacementPulse(x: number, y: number, team: Team) {
        const color = team === 'blue' ? 0x76c8ff : 0xff7c6e;
        const ring = this.scene.add.circle(x, y + 2, 17, color, 0.18);
        ring.setDepth(CONSTANTS.DEPTH.OVERLAY);
        ring.setStrokeStyle(3, 0xffffff, 0.42);
        ring.setBlendMode(Phaser.BlendModes.ADD);

        const beam = this.scene.add.rectangle(x, y - 10, 18, 56, color, 0.18);
        beam.setDepth(CONSTANTS.DEPTH.OVERLAY - 1);
        beam.setBlendMode(Phaser.BlendModes.ADD);

        this.scene.tweens.add({
            targets: [ring, beam],
            alpha: 0,
            scaleX: 2.35,
            scaleY: 1.45,
            duration: 360,
            ease: 'Quad.Out',
            onComplete: () => {
                ring.destroy();
                beam.destroy();
            },
        });
    }

    private playImpactStreaks(x: number, y: number, style: HitStyle, color: number) {
        const depth = CONSTANTS.DEPTH.PROJECTILE + 7;
        const count = style === 'splash' ? 4 : style === 'melee' ? 2 : 1;
        const length = style === 'splash' ? 18 : style === 'melee' ? 12 : 10;

        for (let i = 0; i < count; i += 1) {
            const angle = style === 'ranged'
                ? Phaser.Math.FloatBetween(-0.55, 0.55)
                : Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            const streak = this.scene.add.rectangle(
                x + Math.cos(angle) * 3,
                y + Math.sin(angle) * 3,
                length,
                style === 'splash' ? 2 : 1.5,
                i === 0 ? 0xffffff : color,
                i === 0 ? 0.72 : 0.58
            );
            streak.setRotation(angle);
            streak.setDepth(depth);
            streak.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: streak,
                x: streak.x + Math.cos(angle) * (style === 'splash' ? 10 : 6),
                y: streak.y + Math.sin(angle) * (style === 'splash' ? 6 : 4),
                alpha: 0,
                scaleX: 0.35,
                duration: style === 'splash' ? 150 : 105,
                ease: 'Quad.Out',
                onComplete: () => streak.destroy(),
            });
        }
    }

    private scatterSparks(x: number, y: number, color: number, count: number, distance: number, duration: number) {
        for (let i = 0; i < count; i += 1) {
            const angle = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.22, 0.22);
            const spark = this.scene.add.circle(x, y, Phaser.Math.FloatBetween(1.4, 2.8), color, 0.72);
            spark.setDepth(CONSTANTS.DEPTH.PROJECTILE + 6);
            spark.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: spark,
                x: x + Math.cos(angle) * Phaser.Math.FloatBetween(distance * 0.45, distance),
                y: y + Math.sin(angle) * Phaser.Math.FloatBetween(distance * 0.35, distance) - 4,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: duration + Phaser.Math.Between(-40, 70),
                ease: 'Quad.Out',
                onComplete: () => spark.destroy(),
            });
        }
    }
}
