import Phaser from 'phaser';
import Unit, { UnitState } from '../entities/Unit';
import Tower from '../entities/Tower';
import Projectile from '../entities/Projectile';
import type { ProjectileConfig } from '../entities/Projectile';
import { UNIT_TYPES } from '../data/UnitData';
import { CONSTANTS } from './Constants';
import GameMap from './GameMap';
import SkillSystem from './SkillSystem';
import EffectManager from './EffectManager';
import {
    getDuckxelSpawnCount,
    getDuckxelSpawnOffset,
    getDuckxelTunedAttackInterval,
    getDuckxelTunedSpeed,
    getDuckxelBattleProfile,
} from '../data/DuckxelBattleProfiles';
import type { ActiveSkillDefinition, ActiveSkillImpactWave } from '../data/ActiveSkillData';

const UNIT_MOVEMENT_SPEED_MULTIPLIER = 0.7;
const UNIT_ATTACK_INTERVAL_MULTIPLIER = 1.35;

interface AttackSlotReservation {
    targetOrder: number;
    slotIndex: number;
    lastUsedAt: number;
}

/**
 * Manages all game entities: units, towers, and projectiles.
 * Integrates with SkillSystem for matchup damage and skill triggers.
 */
export default class EntityManager {
    private scene: Phaser.Scene;
    private units: Unit[] = [];
    private towers: Tower[] = [];
    private projectiles: Projectile[] = [];
    private gameMap: GameMap;
    private skillSystem: SkillSystem;
    private effectManager: EffectManager;
    private nextSimulationOrder = 1;
    private attackSlotByAttacker = new Map<number, AttackSlotReservation>();
    private simulationTimeMs = 0;

    constructor(scene: Phaser.Scene, gameMap: GameMap) {
        this.scene = scene;
        this.gameMap = gameMap;
        this.skillSystem = new SkillSystem(scene);
        this.effectManager = new EffectManager(scene);

        // Listen for projectile events
        scene.events.on('fireProjectile', (config: ProjectileConfig) => {
            this.spawnProjectile(config);
        });

        // Listen for splash damage events
        scene.events.on('splashDamage', (data: { x: number, y: number, radius: number, damage: number, team: string, attacker?: Unit | null }) => {
            this.handleSplashDamage(data);
        });

        // Listen for melee damage events (from Unit.ts)
        scene.events.on('meleeDamage', (data: { attacker: Unit, target: Unit, baseDamage: number }) => {
            this.handleMeleeDamage(data);
        });

        // Listen for unit death events (skill triggers)
        scene.events.on('unitDeath', (data: { unit: Unit }) => {
            this.handleUnitDeath(data);
        });
    }

    spawnUnit(x: number, y: number, team: 'blue' | 'red', unitKey: string): Unit[] {
        const data = UNIT_TYPES[unitKey];
        if (!data) {
            console.warn(`Unknown unit: ${unitKey}`);
            return [];
        }

        const count = getDuckxelSpawnCount(unitKey, data.spawnCount || 1);
        const spawned: Unit[] = [];
        const tunedData = {
            ...data,
            spawnCount: count,
            speed: getDuckxelTunedSpeed(unitKey, data.speed, UNIT_MOVEMENT_SPEED_MULTIPLIER),
            attackSpeed: getDuckxelTunedAttackInterval(unitKey, data.attackSpeed, UNIT_ATTACK_INTERVAL_MULTIPLIER),
        };

        for (let i = 0; i < count; i++) {
            const formationOffset = getDuckxelSpawnOffset(unitKey, i, count, team);
            const offsetX = formationOffset.x;
            const offsetY = formationOffset.y;
            const requestedX = x + offsetX;
            const requestedY = y + offsetY;
            const spawnRadius = getDuckxelBattleProfile(unitKey)?.collisionRadius ?? 10;
            const spawnPoint = this.findValidSpawnPoint(requestedX, requestedY, spawnRadius);
            const unit = new Unit(this.scene, spawnPoint.x, spawnPoint.y, data.spriteKey, team, tunedData);
            unit.setGameMap(this.gameMap);
            unit.setSimulationOrder(this.nextSimulationOrder++);

            // Set skill data
            unit.skillType = tunedData.skill;
            unit.skillParams = { ...tunedData.skillParams };
            unit.role = tunedData.role;

            this.units.push(unit);
            spawned.push(unit);
            this.effectManager.playSummon(unit.x, unit.y, team);

            // Trigger onSpawn skills (e.g., Raiden sprint)
            this.skillSystem.onSpawn(unit);
        }

        return spawned;
    }

    spawnRemoteUnit(x: number, y: number, team: 'blue' | 'red', unitKey: string, remoteId: string): Unit | null {
        const data = UNIT_TYPES[unitKey];
        if (!data) return null;
        const tunedData = {
            ...data,
            spawnCount: 1,
            speed: getDuckxelTunedSpeed(unitKey, data.speed, UNIT_MOVEMENT_SPEED_MULTIPLIER),
            attackSpeed: getDuckxelTunedAttackInterval(unitKey, data.attackSpeed, UNIT_ATTACK_INTERVAL_MULTIPLIER),
        };
        const radius = getDuckxelBattleProfile(unitKey)?.collisionRadius ?? 10;
        const spawnPoint = this.findValidSpawnPoint(x, y, radius);
        const unit = new Unit(this.scene, spawnPoint.x, spawnPoint.y, data.spriteKey, team, tunedData);
        unit.id = remoteId;
        unit.setGameMap(this.gameMap);
        unit.setSimulationOrder(this.nextSimulationOrder++);
        unit.skillType = tunedData.skill;
        unit.skillParams = { ...tunedData.skillParams };
        unit.role = tunedData.role;
        this.units.push(unit);
        this.skillSystem.onSpawn(unit);
        return unit;
    }

    spawnTower(x: number, y: number, team: 'blue' | 'red', type: 'king' | 'princess'): Tower {
        const tower = new Tower(this.scene, x, y, team, type);
        tower.setGameMap(this.gameMap);
        tower.setSimulationOrder(this.nextSimulationOrder++);
        tower.role = 'tank'; // Towers are treated as tank role for matchup
        this.towers.push(tower);
        this.units.push(tower); // Towers are also targetable units
        return tower;
    }

    private spawnProjectile(config: ProjectileConfig) {
        if (!config.target?.active || config.target.state === UnitState.DIE || config.target.stats.hp <= 0) {
            return;
        }
        if (config.attacker && (!config.attacker.active || config.attacker.state === UnitState.DIE || config.attacker.stats.hp <= 0)) {
            return;
        }

        let damage = config.damage;

        if (config.attacker) {
            damage = this.skillSystem.calculateDamage(
                config.damage,
                config.attacker.role,
                config.target.role
            );
            damage = this.skillSystem.onAttack(
                config.attacker,
                config.target,
                damage,
                config.attacker.hitCount
            );
        }

        const proj = new Projectile(this.scene, { ...config, damage });
        this.projectiles.push(proj);
    }

    private handleSplashDamage(data: { x: number, y: number, radius: number, damage: number, team: string, attacker?: Unit | null }) {
        const hitColor = data.team === 'blue' ? 0x8fd0ff : 0xff9f87;
        for (const unit of this.units) {
            if (!unit.active || unit.state === UnitState.DIE) continue;
            if (unit.team === data.team) continue;

            const dist = Phaser.Math.Distance.Between(data.x, data.y, unit.x, unit.y);
            if (dist <= data.radius) {
                unit.takeDamage(data.damage, data.attacker ?? null);
                this.effectManager.playHit(unit.x, unit.y, 'splash', hitColor, data.damage);
                unit.showHitReaction('splash', hitColor);
            }
        }
    }

    private handleMeleeDamage(data: { attacker: Unit, target: Unit, baseDamage: number }) {
        // Apply matchup bonus
        let damage = this.skillSystem.calculateDamage(data.baseDamage, data.attacker.role, data.target.role);

        // Apply skill modifications (lifesteal, siege bonus, etc.)
        damage = this.skillSystem.onAttack(data.attacker, data.target, damage, data.attacker.hitCount);

        data.target.takeDamage(damage, data.attacker);
        const hitColor = data.attacker.team === 'blue' ? 0x8fd0ff : 0xff9f87;
        this.effectManager.playHit(data.target.x, data.target.y, 'melee', hitColor, damage);
    }

    private handleUnitDeath(data: { unit: Unit }) {
        this.releaseAttackSlotsForUnit(data.unit);
        const team = data.unit.team;
        for (const projectile of this.projectiles) {
            if (projectile.active && projectile.involvesUnit(data.unit) && !projectile.isResolvingHit()) {
                projectile.destroy();
            }
        }
        this.effectManager.playDeath(data.unit.x, data.unit.y, team, data.unit.isTower);
        this.skillSystem.onDeath(data.unit, () => {
            return this.units.filter(u =>
                u.active && u.state !== UnitState.DIE && u.team !== team
            );
        });
    }

    getUnits(): Unit[] {
        return this.units;
    }

    getTowers(): Tower[] {
        return this.towers;
    }

    getTowersByTeam(team: 'blue' | 'red'): Tower[] {
        return this.towers.filter(t => t.team === team && t.active);
    }

    public getActiveSkillUnits(team: 'blue' | 'red'): Unit[] {
        return this.units.filter(unit =>
            unit.team === team
            && unit.active
            && unit.state !== UnitState.DIE
            && Boolean(unit.activeSkillDefinition)
        );
    }

    public castActiveSkill(unit: Unit): boolean {
        if (!this.units.includes(unit) || !unit.active || unit.state === UnitState.DIE) return false;
        return unit.castActiveSkill((caster, definition, x, y) => {
            this.resolveActiveSkillImpact(caster, definition, x, y);
        });
    }

    public playRemoteActiveSkillCast(unit: Unit, castSerial: number): boolean {
        if (!this.units.includes(unit) || !unit.active || unit.state === UnitState.DIE) return false;
        return unit.playRemoteActiveSkillCast(castSerial, (caster, definition, x, y) => {
            this.playActiveSkillImpactSequence(caster.x, caster.y, x, y, caster.team, definition, undefined, undefined, false);
        });
    }

    private resolveActiveSkillImpact(caster: Unit, definition: ActiveSkillDefinition, impactX: number, impactY: number) {
        if (!caster.active || caster.state === UnitState.DIE) return;
        this.playActiveSkillImpactSequence(
            caster.x,
            caster.y,
            impactX,
            impactY,
            caster.team,
            definition,
            (wave, waveIndex) => {
                this.applyActiveSkillWaveDamage(caster, impactX, impactY, definition, wave);
                this.scene.events.emit('activeSkillImpact', {
                    caster,
                    skillKey: definition.key,
                    waveIndex,
                    x: impactX,
                    y: impactY,
                });
            },
            (elapsedMs) => this.applyActiveSkillZoneTick(caster, impactX, impactY, definition, elapsedMs),
        );
    }

    private applyActiveSkillWaveDamage(
        caster: Unit,
        impactX: number,
        impactY: number,
        definition: ActiveSkillDefinition,
        wave: ActiveSkillImpactWave,
    ) {
        for (const target of this.units) {
            if (!target.active || target.state === UnitState.DIE || target.team === caster.team || target === caster) continue;
            if (target.isTower && !definition.targetMask.towers) continue;
            if (!target.isTower && !definition.targetMask.units) continue;
            if (target.stats.movementType === 'air' && !definition.targetMask.air) continue;
            if (target.stats.movementType === 'ground' && !definition.targetMask.ground) continue;

            const distance = Phaser.Math.Distance.Between(impactX, impactY, target.x, target.y);
            const targetRadius = Math.max(0, target.getCollisionRadius());
            if (distance > wave.radius + targetRadius) continue;

            const damage = Math.max(1, Math.round(
                wave.damage * (target.isTower ? wave.towerDamageMultiplier : 1)
            ));
            target.takeDamage(damage, caster);
            if (definition.persistentZone?.root && !target.isTower && target.active && target.state !== UnitState.DIE) {
                target.addDebuff({ type: 'stun', duration: definition.persistentZone.durationMs });
            }
            if (target.active && target.state !== UnitState.DIE) {
                target.showHitReaction('splash', caster.team === 'blue' ? 0x8fcfff : 0xff8b76);
            }
        }
    }

    private applyActiveSkillZoneTick(
        caster: Unit,
        impactX: number,
        impactY: number,
        definition: ActiveSkillDefinition,
        elapsedMs: number,
    ) {
        const zone = definition.persistentZone;
        if (!zone || !caster.active || caster.state === UnitState.DIE) return;
        const remainingMs = Math.max(0, zone.durationMs - elapsedMs);
        for (const target of this.units) {
            if (!target.active || target.state === UnitState.DIE || target.team === caster.team || target.isTower) continue;
            if (target.stats.movementType === 'air' && !definition.targetMask.air) continue;
            if (target.stats.movementType === 'ground' && !definition.targetMask.ground) continue;
            const distance = Phaser.Math.Distance.Between(impactX, impactY, target.x, target.y);
            if (distance > definition.radius + target.getCollisionRadius()) continue;
            target.takeDamage(zone.damagePerTick, caster);
            if (zone.root && remainingMs > 0 && target.active && target.state !== UnitState.DIE) {
                target.addDebuff({ type: 'stun', duration: Math.max(zone.tickIntervalMs + 120, remainingMs) });
            }
        }
    }

    private playActiveSkillImpactSequence(
        originX: number,
        originY: number,
        x: number,
        y: number,
        team: 'blue' | 'red',
        definition: ActiveSkillDefinition,
        onWave?: (wave: ActiveSkillImpactWave, waveIndex: number) => void,
        onZoneTick?: (elapsedMs: number) => void,
        renderPersistentZone = true,
    ) {
        const persistentEffects: Phaser.GameObjects.GameObject[] = [];
        const frameDuration = Math.max(40, Math.round(1000 / definition.vfx.fps));
        const lastWaveDelay = Math.max(...definition.impactWaves.map((wave) => wave.delayAfterLandingMs));
        if (definition.projectileVfx) {
            this.playActiveSkillProjectileVfx(originX, originY, x, y, definition);
        }
        for (const [waveIndex, wave] of definition.impactWaves.entries()) {
            const playWave = () => {
                onWave?.(wave, waveIndex);
                if (!definition.persistentZone || renderPersistentZone) {
                    this.playActiveSkillImpactWave(x, y, team, definition, wave, persistentEffects);
                }
            };
            if (wave.delayAfterLandingMs <= 0) playWave();
            else this.scene.time.delayedCall(wave.delayAfterLandingMs, playWave);
        }

        if (definition.persistentZone && onZoneTick) {
            const { durationMs, tickIntervalMs } = definition.persistentZone;
            for (let elapsedMs = tickIntervalMs; elapsedMs <= durationMs; elapsedMs += tickIntervalMs) {
                this.scene.time.delayedCall(elapsedMs, () => onZoneTick(elapsedMs));
            }
        }

        const fadeDelay = definition.persistentZone?.durationMs
            ?? (lastWaveDelay + frameDuration * definition.vfx.frameCount + 80);
        this.scene.time.delayedCall(fadeDelay, () => {
            for (const effect of persistentEffects) {
                if (!effect.active) continue;
                this.scene.tweens.add({
                    targets: effect,
                    alpha: 0,
                    duration: definition.effectFadeMs,
                    ease: 'Sine.In',
                    onComplete: () => effect.destroy(),
                });
            }
        });
    }

    private playActiveSkillProjectileVfx(
        originX: number,
        originY: number,
        targetX: number,
        targetY: number,
        definition: ActiveSkillDefinition,
    ) {
        const projectile = definition.projectileVfx;
        if (!projectile) return;
        const firstTexture = `${projectile.texturePrefix}_0`;
        if (!this.scene.textures.exists(firstTexture)) return;
        const distance = Phaser.Math.Distance.Between(originX, originY, targetX, targetY);
        const angle = Phaser.Math.Angle.Between(originX, originY, targetX, targetY);
        const line = this.scene.add.image(originX, originY, firstTexture)
            .setOrigin(0, 0.5)
            .setRotation(angle)
            .setDisplaySize(Math.max(18, distance), projectile.thickness)
            .setDepth(CONSTANTS.DEPTH.PROJECTILE + 7);
        const targetScaleX = line.scaleX;
        const targetScaleY = line.scaleY;
        line.setScale(targetScaleX * 0.08, targetScaleY);
        this.scene.tweens.add({
            targets: line,
            scaleX: targetScaleX,
            duration: projectile.travelMs,
            ease: 'Cubic.Out',
        });
        const frameDuration = Math.max(40, Math.round(1000 / projectile.fps));
        for (let frame = 1; frame < projectile.frameCount; frame += 1) {
            this.scene.time.delayedCall(frame * frameDuration, () => {
                const texture = `${projectile.texturePrefix}_${frame}`;
                if (line.active && this.scene.textures.exists(texture)) line.setTexture(texture);
            });
        }
        this.scene.time.delayedCall(projectile.travelMs + 90, () => {
            if (!line.active) return;
            this.scene.tweens.add({
                targets: line,
                alpha: 0,
                duration: 120,
                onComplete: () => line.destroy(),
            });
        });
    }

    private playActiveSkillImpactWave(
        x: number,
        y: number,
        team: 'blue' | 'red',
        definition: ActiveSkillDefinition,
        wave: ActiveSkillImpactWave,
        persistentEffects: Phaser.GameObjects.GameObject[],
    ) {
        const color = team === 'blue' ? 0x78cfff : 0xff866f;
        const depth = definition.persistentZone
            ? CONSTANTS.DEPTH.UNIT_SHADOW + 1
            : CONSTANTS.DEPTH.PROJECTILE + 4;
        const frameDuration = Math.max(40, Math.round(1000 / definition.vfx.fps));
        const firstTexture = `${definition.vfx.texturePrefix}_0`;

        if (this.scene.textures.exists(firstTexture)) {
            const impact = this.scene.add.image(x, y, firstTexture);
            impact.setDepth(depth + 2);
            impact.setDisplaySize(
                definition.vfx.displaySize * wave.vfxScale,
                definition.vfx.displaySize * wave.vfxScale,
            );
            impact.setBlendMode(Phaser.BlendModes.NORMAL);
            persistentEffects.push(impact);
            let frame = 0;
            const timer = this.scene.time.addEvent({
                delay: frameDuration,
                repeat: Math.max(0, definition.vfx.frameCount - 2),
                callback: () => {
                    frame += 1;
                    const texture = `${definition.vfx.texturePrefix}_${frame}`;
                    if (impact.active && this.scene.textures.exists(texture)) impact.setTexture(texture);
                },
            });
            this.scene.time.delayedCall(frameDuration * definition.vfx.frameCount, () => timer.remove(false));
        }

        if (definition.persistentZone) {
            this.scene.cameras.main.shake(wave.shakeDurationMs, wave.shakeIntensity);
            return;
        }

        const ring = this.scene.add.ellipse(x, y + 5, wave.radius * 2, wave.radius * 0.86, color, 0.22);
        ring.setDepth(depth);
        ring.setStrokeStyle(3, 0xffffff, 0.58);
        persistentEffects.push(ring);
        this.scene.tweens.add({
            targets: ring,
            alpha: 0.13,
            scaleX: 1.22,
            scaleY: 1.22,
            duration: 310,
            ease: 'Quad.Out',
        });

        const dustCount = Math.round(12 * wave.vfxScale);
        for (let index = 0; index < dustCount; index += 1) {
            const angle = (Math.PI * 2 * index) / dustCount + Math.PI / dustCount;
            const dust = this.scene.add.circle(x, y + 5, 2.6 + (index % 3) * 0.45, 0xd8c39a, 0.82);
            dust.setDepth(depth + 1);
            this.scene.tweens.add({
                targets: dust,
                x: x + Math.cos(angle) * (wave.radius * 0.55 + (index % 3) * 8),
                y: y + 5 + Math.sin(angle) * (wave.radius * 0.2 + (index % 4) * 3) - 7,
                alpha: 0,
                scaleX: 0.35,
                scaleY: 0.35,
                duration: 300 + (index % 4) * 34,
                ease: 'Quad.Out',
                onComplete: () => dust.destroy(),
            });
        }

        this.scene.cameras.main.shake(wave.shakeDurationMs, wave.shakeIntensity);
    }

    public getAttackApproachPoint(attacker: Unit, target: Unit): { x: number; y: number } | null {
        if (attacker.isTower || attacker.stats.attackType !== 'melee') return null;
        if (attacker.simulationOrder <= 0 || target.simulationOrder <= 0) return null;

        let reservation = this.attackSlotByAttacker.get(attacker.simulationOrder);
        if (reservation && reservation.targetOrder !== target.simulationOrder) {
            this.attackSlotByAttacker.delete(attacker.simulationOrder);
            reservation = undefined;
        }

        const attackerRadius = Math.max(3, attacker.getCollisionRadius());
        const targetRadius = Math.max(6, target.getCollisionRadius());
        const ringDistance = targetRadius + attackerRadius + 3;
        const slotCount = Phaser.Math.Clamp(
            Math.floor((Math.PI * 2 * ringDistance) / Math.max(7, attackerRadius * 2.05)),
            6,
            target.isTower ? 16 : 12
        );
        const currentAngle = Phaser.Math.Angle.Between(target.x, target.y, attacker.x, attacker.y);
        const getSlotPoint = (slotIndex: number) => {
            const angle = (slotIndex / slotCount) * Math.PI * 2;
            return {
                angle,
                x: target.x + Math.cos(angle) * ringDistance,
                y: target.y + Math.sin(angle) * ringDistance,
            };
        };
        const isReachableSlot = (slotIndex: number) => {
            const point = getSlotPoint(slotIndex);
            const angleDelta = Math.abs(Phaser.Math.Angle.Wrap(point.angle - currentAngle));
            return angleDelta <= Math.PI * 0.72 && this.gameMap.isWalkable(point.x, point.y);
        };

        if (reservation && (!isReachableSlot(reservation.slotIndex) || this.simulationTimeMs - reservation.lastUsedAt > 1100)) {
            this.attackSlotByAttacker.delete(attacker.simulationOrder);
            reservation = undefined;
        }

        if (!reservation || reservation.slotIndex >= slotCount) {
            const occupied = new Set<number>();
            for (const current of this.attackSlotByAttacker.values()) {
                if (current.targetOrder === target.simulationOrder && current.slotIndex < slotCount) {
                    occupied.add(current.slotIndex);
                }
            }

            const normalized = Phaser.Math.Angle.Normalize(currentAngle);
            const preferred = Math.round((normalized / (Math.PI * 2)) * slotCount) % slotCount;
            let chosen = -1;
            for (let offset = 0; offset < slotCount; offset++) {
                const clockwise = (preferred + offset) % slotCount;
                if (!occupied.has(clockwise) && isReachableSlot(clockwise)) {
                    chosen = clockwise;
                    break;
                }
                const counterClockwise = (preferred - offset + slotCount) % slotCount;
                if (!occupied.has(counterClockwise) && isReachableSlot(counterClockwise)) {
                    chosen = counterClockwise;
                    break;
                }
            }
            if (chosen < 0) return null;
            reservation = { targetOrder: target.simulationOrder, slotIndex: chosen, lastUsedAt: this.simulationTimeMs };
            this.attackSlotByAttacker.set(attacker.simulationOrder, reservation);
        }

        reservation.lastUsedAt = this.simulationTimeMs;
        const point = getSlotPoint(reservation.slotIndex);
        return {
            x: point.x,
            y: point.y,
        };
    }

    public releaseAttackSlot(attacker: Unit) {
        if (attacker.simulationOrder > 0) {
            this.attackSlotByAttacker.delete(attacker.simulationOrder);
        }
    }

    private releaseAttackSlotsForUnit(unit: Unit) {
        this.releaseAttackSlot(unit);
        for (const [attackerOrder, reservation] of this.attackSlotByAttacker) {
            if (reservation.targetOrder === unit.simulationOrder) {
                this.attackSlotByAttacker.delete(attackerOrder);
            }
        }
    }

    update(time: number, delta: number) {
        this.simulationTimeMs += delta;
        this.skillSystem.update(delta);
        // Process debuffs and auras first
        for (const unit of this.units) {
            if (unit.active && unit.state !== UnitState.DIE) {
                this.skillSystem.processDebuffs(unit, delta);
            }
        }

        // Apply defense auras
        for (const unit of this.units) {
            if (unit.active && unit.skillType === 'defense_aura') {
                this.skillSystem.applyAura(unit, this.units);
            }
        }

        // Update units
        for (const unit of this.units) {
            if (unit.active) {
                unit.update(time, delta, this);
            }
        }

        this.resolveEntityCollisions();

        // Update projectiles
        for (const proj of this.projectiles) {
            if (proj.active) {
                proj.update(time, delta);
            }
        }

        // Cleanup destroyed entities
        this.units = this.units.filter(u => u.active);
        this.towers = this.towers.filter(t => t.active);
        this.projectiles = this.projectiles.filter(p => p.active);
        this.cleanupAttackSlots();
    }

    private cleanupAttackSlots() {
        const activeOrders = new Set(
            this.units
                .filter(unit => unit.active && unit.state !== UnitState.DIE)
                .map(unit => unit.simulationOrder)
        );
        for (const [attackerOrder, reservation] of this.attackSlotByAttacker) {
            if (!activeOrders.has(attackerOrder)
                || !activeOrders.has(reservation.targetOrder)
                || this.simulationTimeMs - reservation.lastUsedAt > 1100) {
                this.attackSlotByAttacker.delete(attackerOrder);
            }
        }
    }

    private resolveEntityCollisions() {
        const collidables = this.units.filter(unit =>
            unit.active
            && unit.state !== UnitState.DIE
            && unit.getCollisionRadius() > 0
        ).sort((a, b) => a.simulationOrder - b.simulationOrder);

        for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i < collidables.length; i++) {
                const a = collidables[i];
                const radiusA = a.getCollisionRadius();
                if (radiusA <= 0) continue;

                for (let j = i + 1; j < collidables.length; j++) {
                    const b = collidables[j];
                    const radiusB = b.getCollisionRadius();
                    if (radiusB <= 0) continue;

                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let distSq = dx * dx + dy * dy;
                    if (distSq < 0.0001) {
                        dx = 0.01;
                        dy = 0;
                        distSq = 0.0001;
                    }

                    const bothOnBridge = this.gameMap.isOnBridge(a.x, a.y) && this.gameMap.isOnBridge(b.x, b.y);
                    const towerContact = a.isTower || b.isTower;
                    const minDist = (radiusA + radiusB) * (bothOnBridge ? 0.78 : 1);
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;
                    if (overlap <= 0) continue;

                    if (a.team !== b.team && !a.isTower && !b.isTower) {
                        a.requestCombatScan();
                        b.requestCombatScan();
                    }

                    const massA = a.getCollisionMass();
                    const massB = b.getCollisionMass();
                    const invA = Number.isFinite(massA) ? 1 / Math.max(0.1, massA) : 0;
                    const invB = Number.isFinite(massB) ? 1 / Math.max(0.1, massB) : 0;
                    const invTotal = invA + invB;
                    if (invTotal <= 0) continue;

                    let nx = dx / dist;
                    let ny = dy / dist;
                    if (bothOnBridge) {
                        nx = 0;
                        ny = Math.abs(dy) > 0.01
                            ? Math.sign(dy)
                            : (a.simulationOrder < b.simulationOrder ? 1 : -1);
                    }
                    const push = overlap * (towerContact ? 0.9 : 0.66);

                    if (invA > 0) {
                        a.applyCollisionOffset(-nx * push * (invA / invTotal), -ny * push * (invA / invTotal));
                    }
                    if (invB > 0) {
                        b.applyCollisionOffset(nx * push * (invB / invTotal), ny * push * (invB / invTotal));
                    }
                }
            }
        }
    }

    private findValidSpawnPoint(x: number, y: number, radius: number) {
        const projected = this.gameMap.projectToWalkable(x, y);
        const isFree = (px: number, py: number) => {
            if (!this.gameMap.isWalkable(px, py)) return false;
            return this.units.every(unit => {
                if (!unit.active || unit.state === UnitState.DIE) return true;
                const required = radius + Math.max(0, unit.getCollisionRadius()) + 2;
                return Phaser.Math.Distance.Between(px, py, unit.x, unit.y) >= required;
            });
        };
        if (isFree(projected.x, projected.y)) return projected;

        for (let ring = 1; ring <= 6; ring++) {
            const distance = ring * Math.max(7, radius * 0.8);
            for (let step = 0; step < 12; step++) {
                const angle = (step / 12) * Math.PI * 2;
                const candidate = this.gameMap.projectToWalkable(
                    projected.x + Math.cos(angle) * distance,
                    projected.y + Math.sin(angle) * distance
                );
                if (isFree(candidate.x, candidate.y)) return candidate;
            }
        }
        return projected;
    }

    /**
     * Spawn all 6 towers for both teams.
     */
    spawnAllTowers() {
        const T = CONSTANTS.TOWERS;
        // Blue team
        this.spawnTower(T.BLUE_KING.x, T.BLUE_KING.y, 'blue', 'king');
        this.spawnTower(T.BLUE_PRINCESS_L.x, T.BLUE_PRINCESS_L.y, 'blue', 'princess');
        this.spawnTower(T.BLUE_PRINCESS_R.x, T.BLUE_PRINCESS_R.y, 'blue', 'princess');
        // Red team
        this.spawnTower(T.RED_KING.x, T.RED_KING.y, 'red', 'king');
        this.spawnTower(T.RED_PRINCESS_L.x, T.RED_PRINCESS_L.y, 'red', 'princess');
        this.spawnTower(T.RED_PRINCESS_R.x, T.RED_PRINCESS_R.y, 'red', 'princess');
    }
}
