import Phaser from 'phaser';
import Unit from './Unit';
import { CONSTANTS } from '../systems/Constants';
import EffectManager from '../systems/EffectManager';

interface ProjectileConfig {
    fromX: number;
    fromY: number;
    target: Unit;
    damage: number;
    projectileKey: string;
    splash: number;
    team: string;
    attackType?: 'melee' | 'ranged' | 'splash';
    attacker?: Unit;
}

type ProjectileStyle = 'arrow' | 'magic' | 'fireball' | 'tower' | 'cannonball' | 'spear';

/**
 * Projectile entity - flies from attacker to target, deals damage on arrival.
 */
export default class Projectile extends Phaser.GameObjects.Container {
    private target: Unit;
    private damage: number;
    private splash: number;
    private speed: number;
    private team: string;
    private style: ProjectileStyle;
    private effectManager: EffectManager;
    private attacker: Unit | null;
    private age: number = 0;
    private lastDistance: number = Infinity;
    private noProgressTimer: number = 0;
    private readonly maxLifetime: number;
    private readonly auxiliaryEffects = new Set<Phaser.GameObjects.GameObject>();
    private resolvingHit: boolean = false;

    constructor(scene: Phaser.Scene, config: ProjectileConfig) {
        super(scene, config.fromX, config.fromY);
        this.target = config.target;
        this.damage = config.damage;
        this.splash = config.splash;
        this.team = config.team;
        this.attacker = config.attacker ?? null;
        this.style = this.resolveStyle(config.projectileKey, config.attackType);
        this.speed = this.resolveSpeed(this.style);
        this.maxLifetime = this.style === 'cannonball' ? 2600 : this.style === 'spear' ? 1900 : 2200;
        this.effectManager = new EffectManager(scene);

        scene.add.existing(this);
        this.setDepth(CONSTANTS.DEPTH.PROJECTILE);

        this.buildVisuals();

        const angle = Phaser.Math.Angle.Between(config.fromX, config.fromY, config.target.x, config.target.y);
        this.setRotation(angle);
    }

    update(_time: number, delta: number) {
        if (!this.active) return;
        this.age += delta;

        if (this.age > this.maxLifetime) {
            this.destroy();
            return;
        }

        if (this.attacker && (!this.attacker.active || this.attacker.state === 5 || this.attacker.stats.hp <= 0)) {
            this.destroy();
            return;
        }

        if (!this.target || !this.target.active || this.target.stats.hp <= 0) {
            this.destroy();
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10) {
            this.onHit();
            return;
        }

        if (dist >= this.lastDistance - 0.4) {
            this.noProgressTimer += delta;
        } else {
            this.noProgressTimer = 0;
        }
        this.lastDistance = dist;

        if (this.noProgressTimer > 620) {
            this.destroy();
            return;
        }

        const step = (this.speed * delta) / 1000;
        if (step >= dist) {
            this.x = this.target.x;
            this.y = this.target.y;
            this.onHit();
            return;
        }

        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;

        const angle = Math.atan2(dy, dx);
        this.setRotation(angle);

        if (this.style === 'magic') {
            this.rotation += 0.04;
        } else if (this.style === 'fireball') {
            this.rotation += 0.03;
        }

        this.spawnTrail();
    }

    involvesUnit(unit: Unit): boolean {
        return this.target === unit || this.attacker === unit;
    }

    isResolvingHit(): boolean {
        return this.resolvingHit;
    }

    destroy(fromScene?: boolean) {
        this.scene?.tweens?.killTweensOf(this);
        this.each((child: Phaser.GameObjects.GameObject) => {
            this.scene?.tweens?.killTweensOf(child);
        });
        this.auxiliaryEffects.forEach((effect) => {
            this.scene?.tweens?.killTweensOf(effect);
            if (effect.active) effect.destroy();
        });
        this.auxiliaryEffects.clear();
        super.destroy(fromScene);
    }

    private onHit() {
        if (!this.active || this.resolvingHit) return;

        const scene = this.scene;
        const target = this.target;
        if (!scene || !target?.active || target.stats.hp <= 0) {
            this.destroy();
            return;
        }

        this.resolvingHit = true;
        const fxColor = this.getFxColor();
        if (this.splash > 0) {
            scene.events.emit('splashDamage', {
                x: target.x,
                y: target.y,
                radius: this.splash,
                damage: this.damage,
                team: this.team,
                attacker: this.attacker,
            });
        } else {
            target.takeDamage(this.damage, this.attacker);
            if (target.active) {
                this.effectManager.playHit(target.x, target.y, 'ranged', fxColor, this.damage);
                target.showHitReaction('ranged', fxColor);
            }
        }

        if (this.active) {
            this.showHitEffect(scene, this.x, this.y);
            this.destroy();
        }
    }

    private resolveStyle(projectileKey: string, attackType?: 'melee' | 'ranged' | 'splash'): ProjectileStyle {
        if (projectileKey.includes('spear')) return 'spear';
        if (projectileKey.includes('cannon')) return 'cannonball';
        if (projectileKey.includes('fire') || attackType === 'splash') return 'fireball';
        if (projectileKey.includes('magic')) return 'magic';
        if (projectileKey.includes('tower')) return 'tower';
        return 'arrow';
    }

    private resolveSpeed(style: ProjectileStyle) {
        switch (style) {
            case 'arrow': return 360;
            case 'spear': return 390;
            case 'tower': return 320;
            case 'magic': return 280;
            case 'fireball': return 240;
            case 'cannonball': return 260;
            default: return 300;
        }
    }

    private getFxColor() {
        if (this.style === 'spear') return this.team === 'blue' ? 0xb8f2ff : 0xffd0aa;
        if (this.style === 'cannonball') return this.team === 'blue' ? 0xffd88a : 0xff9b66;
        if (this.style === 'magic') return this.team === 'blue' ? 0x9bc2ff : 0xd8b4ff;
        if (this.style === 'fireball') return this.team === 'blue' ? 0x7ecbff : 0xff8c52;
        return this.team === 'blue' ? 0x8fd0ff : 0xff9f87;
    }

    private buildVisuals() {
        const teamCore = this.getFxColor();
        const isBlue = this.team === 'blue';
        const spriteKey = this.getSpriteKey();
        if (spriteKey && this.scene.textures.exists(spriteKey)) {
            const sprite = this.scene.add.image(0, 0, spriteKey);
            const size = this.style === 'arrow' ? { w: 30, h: 30 } :
                this.style === 'spear' ? { w: 34, h: 34 } :
                this.style === 'cannonball' ? { w: 18, h: 18 } :
                this.style === 'fireball' ? { w: 24, h: 24 } :
                    this.style === 'magic' ? { w: 22, h: 22 } :
                        { w: 24, h: 24 };
            sprite.setDisplaySize(size.w, size.h);
            sprite.setBlendMode(this.style === 'arrow' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
            this.add(sprite);
            return;
        }

        if (this.style === 'arrow' || this.style === 'spear') {
            const shaftLength = this.style === 'spear' ? 22 : 9;
            const shaft = this.scene.add.rectangle(this.style === 'spear' ? -2 : -3, 0, shaftLength, this.style === 'spear' ? 2.4 : 2, this.style === 'spear' ? 0xb78a52 : 0xd7c5a0, 1);
            const tip = this.scene.add.triangle(this.style === 'spear' ? 11 : 4.5, 0, 0, -3.2, 7.2, 0, 0, 3.2, isBlue ? 0xf0fbff : 0xffefe3, 1);
            tip.setStrokeStyle(1, 0x31415a, 0.55);
            const feather = this.scene.add.triangle(this.style === 'spear' ? -14 : -6.3, 0, 0, -2.8, -4.2, 0, 0, 2.8, this.style === 'spear' ? (isBlue ? 0x4fa0ff : 0xff5a4f) : 0x9f7a52, 1);
            const glint = this.style === 'spear' ? this.scene.add.circle(8, -1.3, 1.2, 0xffffff, 0.72) : null;
            if (glint) glint.setBlendMode(Phaser.BlendModes.ADD);
            this.add([shaft, tip, feather]);
            if (glint) this.add(glint);
        } else if (this.style === 'tower') {
            const core = this.scene.add.rectangle(0, 0, 8, 3, teamCore, 1);
            const spark = this.scene.add.circle(4.5, 0, 2, 0xffffff, 0.85);
            spark.setBlendMode(Phaser.BlendModes.ADD);
            this.add([core, spark]);
        } else if (this.style === 'cannonball') {
            const shadow = this.scene.add.circle(-1, 1.4, 6.5, 0x120d12, 0.82);
            const shell = this.scene.add.circle(0, 0, 6, 0x2b2f39, 1);
            shell.setStrokeStyle(1.5, 0x11131a, 0.9);
            const shine = this.scene.add.circle(-2.2, -2.2, 1.6, 0xaeb5c7, 0.82);
            const ember = this.scene.add.circle(3.8, 0.5, 2.2, teamCore, 0.78);
            ember.setBlendMode(Phaser.BlendModes.ADD);
            this.add([shadow, shell, shine, ember]);
        } else if (this.style === 'magic') {
            const aura = this.scene.add.circle(0, 0, 6, teamCore, 0.24);
            aura.setBlendMode(Phaser.BlendModes.ADD);
            const core = this.scene.add.circle(0, 0, 3.6, teamCore, 1);
            const shine = this.scene.add.circle(-1.2, -1.2, 1.2, 0xffffff, 0.8);
            this.add([aura, core, shine]);
        } else {
            const aura = this.scene.add.circle(0, 0, 7, 0xff9a5f, 0.24);
            aura.setBlendMode(Phaser.BlendModes.ADD);
            const core = this.scene.add.circle(0, 0, 4.6, 0xff6c2f, 1);
            const ember = this.scene.add.circle(-1.2, -1.3, 1.3, 0xffdf9e, 0.92);
            this.add([aura, core, ember]);
        }
    }

    private getSpriteKey() {
        if (this.style === 'arrow') return 'projectile_arrow';
        if (this.style === 'tower') return 'projectile_tower';
        if (this.style === 'magic') return 'projectile_magic';
        if (this.style === 'fireball') return 'projectile_fireball';
        return null;
    }

    private spawnTrail() {
        if (this.style === 'arrow') return;

        const color = this.getFxColor();
        const size = this.style === 'fireball' || this.style === 'cannonball' ? 4 : this.style === 'spear' ? 2.4 : 3;
        const alpha = this.style === 'fireball' || this.style === 'cannonball' ? 0.28 : this.style === 'spear' ? 0.16 : 0.22;
        const trail = this.scene.add.circle(this.x, this.y, size, color, alpha);
        trail.setDepth(CONSTANTS.DEPTH.PROJECTILE - 1);
        trail.setBlendMode(Phaser.BlendModes.ADD);
        this.trackAuxiliaryEffect(trail);
        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 1.6,
            scaleY: 1.6,
            duration: this.style === 'fireball' ? 180 : 120,
            onComplete: () => this.destroyAuxiliaryEffect(trail),
        });
    }

    private trackAuxiliaryEffect(effect: Phaser.GameObjects.GameObject) {
        effect.setData?.('battleProjectileAuxiliary', true);
        this.auxiliaryEffects.add(effect);
        this.scene.time.delayedCall(320, () => {
            this.destroyAuxiliaryEffect(effect);
        });
    }

    private destroyAuxiliaryEffect(effect: Phaser.GameObjects.GameObject) {
        this.auxiliaryEffects.delete(effect);
        if (!effect.active) return;
        this.scene?.tweens?.killTweensOf(effect);
        effect.destroy();
    }

    private showHitEffect(scene: Phaser.Scene, x: number, y: number) {
        void scene;
        void x;
        void y;
        return;

        const color = this.getFxColor();
        const radius = this.style === 'fireball' ? 18 : this.style === 'cannonball' ? 20 : this.style === 'spear' ? 13 : this.style === 'magic' ? 14 : 12;
        const ring = scene.add.circle(x, y, radius, color, 0.48);
        ring.setDepth(CONSTANTS.DEPTH.PROJECTILE + 2);
        ring.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 2.2,
            scaleY: 2.2,
            duration: 200,
            ease: 'Quad.Out',
            onComplete: () => ring.destroy(),
        });

        const core = scene.add.circle(x, y, 5, 0xffffff, 0.7);
        core.setDepth(CONSTANTS.DEPTH.PROJECTILE + 3);
        core.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: core,
            alpha: 0,
            scaleX: 1.6,
            scaleY: 1.6,
            duration: 100,
            onComplete: () => core.destroy(),
        });

        if (this.style === 'fireball') {
            const blast = this.scene.add.circle(this.x, this.y, 12, 0xffc170, 0.7);
            blast.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
            blast.setBlendMode(Phaser.BlendModes.ADD);
            this.scene.tweens.add({
                targets: blast,
                alpha: 0,
                scaleX: 2.8,
                scaleY: 2.8,
                duration: 220,
                ease: 'Quad.Out',
                onComplete: () => blast.destroy(),
            });
        }
    }
}

export type { ProjectileConfig };
