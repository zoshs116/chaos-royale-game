import Phaser from 'phaser';
import Unit, { UnitState } from '../entities/Unit';
import type { SkillParams, UnitRole } from '../data/UnitData';
import { CONSTANTS } from './Constants';
import { GAME_FONT } from '../i18n/ko';

/**
 * Skill System - handles unique character abilities and related visual effects.
 */

/** Active debuff on a unit */
export interface Debuff {
    type: 'stun' | 'slow' | 'petrify' | 'poison';
    duration: number;
    value?: number;
    tickTimer?: number;
}

export default class SkillSystem {
    private scene: Phaser.Scene;
    private sprintBoosts: Array<{ unit: Unit; originalSpeed: number; remaining: number }> = [];
    private fireZones: Array<{
        x: number;
        y: number;
        radius: number;
        dps: number;
        team: string;
        remaining: number;
        tickTimer: number;
        visual: Phaser.GameObjects.Arc;
    }> = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    // Roles remain metadata for behavior/UI; they no longer alter combat damage.
    calculateDamage(baseDamage: number, _attackerRole: UnitRole, _defenderRole: UnitRole): number {
        return baseDamage;
    }

    // ===== SKILL TRIGGERS =====
    onAttack(attacker: Unit, target: Unit, baseDamage: number, hitCount: number): number {
        const skill = attacker.skillType;
        const params = attacker.skillParams;
        let damage = baseDamage;

        switch (skill) {
            case 'stun_hit':
                if (params.hitInterval && hitCount % params.hitInterval === 0) {
                    this.applyStun(target, params.stunDuration || 500);
                    this.showSkillEffect(target.x, target.y, 'stun');
                }
                break;

            case 'sprint_ambush':
                if (hitCount === 1 && params.firstHitMultiplier) {
                    damage = Math.floor(damage * params.firstHitMultiplier);
                    this.showSkillEffect(target.x, target.y, 'crit');
                }
                break;

            case 'poison_dot':
                this.applyPoison(target, params.dotDamagePerSec || 15, params.dotDuration || 3000);
                this.showSkillEffect(target.x, target.y, 'poison');
                break;

            case 'petrify':
                if (params.hitInterval && hitCount % params.hitInterval === 0) {
                    this.applyPetrify(target, params.petrifyDuration || 1000);
                    this.showSkillEffect(target.x, target.y, 'petrify');
                }
                break;

            case 'lifesteal':
                if (params.lifestealRatio) {
                    const healAmount = Math.floor(damage * params.lifestealRatio);
                    attacker.heal(healAmount);
                    this.showSkillEffect(attacker.x, attacker.y, 'lifesteal');
                }
                break;

            case 'fire_zone':
                if (params.fireZoneRadius && params.fireZoneDuration && params.fireZoneDps) {
                    this.createFireZone(target.x, target.y, params, attacker.team);
                }
                break;

            case 'siege_mode':
                if (target.isTower && params.siegeBonus) {
                    damage = Math.floor(damage * (1 + params.siegeBonus));
                    this.showSkillEffect(target.x, target.y, 'siege');
                }
                break;
        }

        return damage;
    }

    onSpawn(unit: Unit) {
        const skill = unit.skillType;
        const params = unit.skillParams;

        if (skill === 'sprint_ambush' && params.speedMultiplier && params.sprintDuration) {
            const originalSpeed = unit.stats.speed;
            unit.stats.speed = Math.floor(originalSpeed * params.speedMultiplier);
            this.showSkillEffect(unit.x, unit.y, 'sprint');

            this.sprintBoosts.push({ unit, originalSpeed, remaining: params.sprintDuration });
        }
    }

    onDeath(unit: Unit, getEnemyUnits: () => Unit[]) {
        const skill = unit.skillType;
        const params = unit.skillParams;

        switch (skill) {
            case 'death_explode':
                if (params.explodeDamage && params.explodeRadius) {
                    const enemies = getEnemyUnits();
                    const explodeColor = unit.team === 'blue' ? 0x8fd0ff : 0xff9f87;
                    for (const enemy of enemies) {
                        if (!enemy.active || enemy.state === UnitState.DIE) continue;
                        const dist = Phaser.Math.Distance.Between(unit.x, unit.y, enemy.x, enemy.y);
                        if (dist <= params.explodeRadius) {
                            enemy.takeDamage(params.explodeDamage);
                            enemy.showHitReaction('splash', explodeColor);
                        }
                    }
                    this.showSkillEffect(unit.x, unit.y, 'explode');
                }
                break;

            case 'death_curse':
                if (params.curseRadius && params.curseDuration && params.slowRatio) {
                    const enemies = getEnemyUnits();
                    for (const enemy of enemies) {
                        if (!enemy.active || enemy.state === UnitState.DIE) continue;
                        const dist = Phaser.Math.Distance.Between(unit.x, unit.y, enemy.x, enemy.y);
                        if (dist <= params.curseRadius) {
                            this.applySlow(enemy, params.slowRatio, params.curseDuration);
                        }
                    }
                    this.showSkillEffect(unit.x, unit.y, 'curse');
                }
                break;
        }
    }

    applyAura(unit: Unit, alliedUnits: Unit[]) {
        if (unit.skillType !== 'defense_aura') return;
        const params = unit.skillParams;
        const radius = params.auraRadius || 80;

        for (const ally of alliedUnits) {
            if (ally === unit) continue;
            if (ally.team !== unit.team) continue;
            if (!ally.active || ally.state === UnitState.DIE) continue;

            const dist = Phaser.Math.Distance.Between(unit.x, unit.y, ally.x, ally.y);
            if (dist <= radius) {
                ally.hasDefenseAura = true;
                ally.defenseAuraReduction = params.damageReduction || 0.15;
            }
        }
    }

    // ===== DEBUFF APPLICATION =====
    private applyStun(target: Unit, duration: number) {
        target.addDebuff({ type: 'stun', duration });
    }

    private applyPetrify(target: Unit, duration: number) {
        target.addDebuff({ type: 'petrify', duration });
    }

    private applySlow(target: Unit, ratio: number, duration: number) {
        target.addDebuff({ type: 'slow', duration, value: ratio });
    }

    private applyPoison(target: Unit, dps: number, duration: number) {
        target.addDebuff({ type: 'poison', duration, value: dps, tickTimer: 0 });
    }

    // ===== FIRE ZONE =====
    private createFireZone(x: number, y: number, params: SkillParams, team: string) {
        const radius = params.fireZoneRadius || 40;
        const duration = params.fireZoneDuration || 3000;
        const dps = params.fireZoneDps || 25;

        const zone = this.scene.add.circle(x, y, radius, 0xff4a1f, 0.27);
        zone.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        zone.setBlendMode(Phaser.BlendModes.ADD);

        this.scene.tweens.add({
            targets: zone,
            alpha: { from: 0.27, to: 0.12 },
            scaleX: { from: 1, to: 1.12 },
            scaleY: { from: 1, to: 1.12 },
            duration: 380,
            yoyo: true,
            repeat: Math.floor(duration / 760),
        });

        this.fireZones.push({ x, y, radius, dps, team, remaining: duration, tickTimer: 500, visual: zone });
    }

    update(delta: number) {
        for (let index = this.sprintBoosts.length - 1; index >= 0; index--) {
            const boost = this.sprintBoosts[index];
            boost.remaining -= delta;
            if (!boost.unit.active || boost.unit.state === UnitState.DIE || boost.remaining <= 0) {
                if (boost.unit.active && boost.unit.state !== UnitState.DIE) boost.unit.stats.speed = boost.originalSpeed;
                this.sprintBoosts.splice(index, 1);
            }
        }

        for (let index = this.fireZones.length - 1; index >= 0; index--) {
            const zone = this.fireZones[index];
            zone.remaining -= delta;
            zone.tickTimer -= delta;
            while (zone.tickTimer <= 0 && zone.remaining > -500) {
                zone.tickTimer += 500;
                this.scene.events.emit('splashDamage', {
                    x: zone.x,
                    y: zone.y,
                    radius: zone.radius,
                    damage: Math.floor(zone.dps * 0.5),
                    team: zone.team,
                });
            }
            if (zone.remaining > 0) continue;
            if (zone.visual.active) {
                this.scene.tweens.add({
                    targets: zone.visual,
                    alpha: 0,
                    duration: 260,
                    onComplete: () => zone.visual.active && zone.visual.destroy(),
                });
            }
            this.fireZones.splice(index, 1);
        }
    }

    // ===== VISUAL EFFECTS =====
    private showSkillEffect(x: number, y: number, effectType: string) {
        const depth = CONSTANTS.DEPTH.PROJECTILE + 5;

        switch (effectType) {
            case 'stun': {
                for (let i = 0; i < 3; i++) {
                    const angle = Phaser.Math.DegToRad(210 + i * 65);
                    const sx = x + Math.cos(angle) * 12;
                    const sy = y - 10 + Math.sin(angle) * 10;
                    const star = this.scene.add.triangle(sx, sy, 0, -4, 2, 0, -2, 0, 0xffe26f, 0.95);
                    star.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                    this.scene.tweens.add({
                        targets: star,
                        y: sy - 10,
                        alpha: 0,
                        scaleX: 1.5,
                        scaleY: 1.5,
                        duration: 360,
                        delay: i * 35,
                        onComplete: () => star.destroy(),
                    });
                }
                break;
            }
            case 'petrify': {
                const shard = this.scene.add.polygon(x, y - 8, [0, -10, 8, 0, 0, 10, -8, 0], 0xb8bcc6, 0.7);
                shard.setDepth(depth);
                const ring = this.scene.add.circle(x, y - 6, 10, 0xc8d1dd, 0.2);
                ring.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: shard,
                    alpha: 0,
                    scaleX: 1.6,
                    scaleY: 1.6,
                    duration: 480,
                    onComplete: () => shard.destroy(),
                });
                this.scene.tweens.add({
                    targets: ring,
                    alpha: 0,
                    scaleX: 2,
                    scaleY: 2,
                    duration: 520,
                    onComplete: () => ring.destroy(),
                });
                break;
            }
            case 'poison': {
                const drop = this.scene.add.circle(x, y - 10, 5, 0x65d36f, 0.7);
                drop.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: drop,
                    y: y - 22,
                    alpha: 0,
                    scaleX: 0.8,
                    scaleY: 1.8,
                    duration: 420,
                    onComplete: () => drop.destroy(),
                });
                break;
            }
            case 'lifesteal': {
                const orb = this.scene.add.circle(x, y - 10, 6, 0xff6784, 0.72);
                orb.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: orb,
                    y: y - 24,
                    alpha: 0,
                    duration: 520,
                    onComplete: () => orb.destroy(),
                });
                break;
            }
            case 'crit': {
                const txt = this.scene.add.text(x, y - 20, '치명!', {
                    fontSize: '12px',
                    fontFamily: GAME_FONT,
                    fontStyle: '900',
                    color: '#ff5d52',
                    stroke: '#2b0d0d',
                    strokeThickness: 2,
                });
                txt.setOrigin(0.5).setDepth(depth);
                this.scene.tweens.add({
                    targets: txt,
                    y: y - 40,
                    alpha: 0,
                    scaleX: 1.5,
                    scaleY: 1.5,
                    duration: 600,
                    onComplete: () => txt.destroy(),
                });
                break;
            }
            case 'sprint': {
                const streak = this.scene.add.ellipse(x, y, 20, 6, 0x9fd2ff, 0.45);
                streak.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: streak,
                    scaleX: 2.1,
                    alpha: 0,
                    duration: 340,
                    onComplete: () => streak.destroy(),
                });
                break;
            }
            case 'explode': {
                const circle = this.scene.add.circle(x, y, 6, 0xff6b2e, 0.82);
                circle.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                this.scene.tweens.add({
                    targets: circle,
                    scaleX: 4,
                    scaleY: 4,
                    alpha: 0,
                    duration: 400,
                    onComplete: () => circle.destroy(),
                });
                break;
            }
            case 'curse': {
                const ring = this.scene.add.circle(x, y, 10, 0x7a36a6, 0.26);
                ring.setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
                const core = this.scene.add.circle(x, y - 8, 5, 0x9a4bd6, 0.5);
                core.setDepth(depth);
                this.scene.tweens.add({
                    targets: ring,
                    scaleX: 5,
                    scaleY: 5,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => ring.destroy(),
                });
                this.scene.tweens.add({
                    targets: core,
                    y: y - 26,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => core.destroy(),
                });
                break;
            }
            case 'siege': {
                const marker = this.scene.add.rectangle(x, y - 10, 12, 12, 0xffb34d, 0.38);
                marker.setDepth(depth).setStrokeStyle(2, 0xffd58a, 0.95);
                this.scene.tweens.add({
                    targets: marker,
                    y: y - 22,
                    alpha: 0,
                    scaleX: 1.5,
                    scaleY: 1.5,
                    duration: 500,
                    onComplete: () => marker.destroy(),
                });
                break;
            }
        }
    }

    // ===== DEBUFF PROCESSING =====
    processDebuffs(unit: Unit, delta: number) {
        let isStunned = false;
        let slowFactor = 1;
        const sprite = unit.getSprite();
        const hadDebuffs = unit.debuffs.length > 0;

        for (let i = unit.debuffs.length - 1; i >= 0; i--) {
            const debuff = unit.debuffs[i];
            debuff.duration -= delta;

            if (debuff.duration <= 0) {
                unit.debuffs.splice(i, 1);
                continue;
            }

            switch (debuff.type) {
                case 'stun':
                case 'petrify':
                    isStunned = true;
                    sprite?.setTint(debuff.type === 'stun' ? 0xffff66 : 0x9a9a9a);
                    break;

                case 'slow':
                    slowFactor = Math.min(slowFactor, debuff.value || 0.5);
                    sprite?.setTint(0x88a3ff);
                    break;

                case 'poison':
                    debuff.tickTimer = (debuff.tickTimer || 0) + delta;
                    if (debuff.tickTimer >= 500) {
                        debuff.tickTimer -= 500;
                        const dps = debuff.value || 15;
                        unit.takeDamage(Math.floor(dps * 0.5));
                        sprite?.setTint(0x68d87b);
                    }
                    break;
            }
        }

        if (hadDebuffs && unit.debuffs.length === 0) {
            sprite?.clearTint();
        }

        unit.applyCombatControlState(isStunned, slowFactor);
    }
}
