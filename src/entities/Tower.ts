import Phaser from 'phaser';
import Unit, { UnitState } from './Unit';
import type { UnitStats } from './Unit';
import { CONSTANTS } from '../systems/Constants';

/**
 * Tower entity - static ranged structure.
 * King towers start inactive and activate when:
 * 1) A princess tower on that team is destroyed
 * 2) The king tower itself takes damage
 */
export default class Tower extends Unit {
    private readonly towerType: 'king' | 'princess';
    private damagedArtApplied = false;
    private targetScanTimer = 0;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        team: 'blue' | 'red',
        towerType: 'king' | 'princess'
    ) {
        const config = towerType === 'king' ? CONSTANTS.TOWERS.KING : CONSTANTS.TOWERS.PRINCESS;

        const stats: UnitStats = {
            hp: config.hp,
            damage: config.damage,
            speed: 0,
            range: config.range,
            attackSpeed: config.attackSpeed,
            movementType: 'ground',
            targetPriority: 'any',
            attackType: 'ranged',
            projectileKey: 'projectile_tower',
            sightRange: config.range + 50,
        };

        super(scene, x, y, `tower_${towerType}`, team, stats);

        this.isTower = true;
        this.isKingTower = towerType === 'king';
        this.towerType = towerType;
        this.towerActive = towerType === 'princess';
        this.state = UnitState.IDLE;
        this.spawnTimer = 0;

        const textureKey = Tower.getTowerTextureKey(towerType, team, 'idle');
        if (!scene.textures.exists(textureKey)) {
            Tower.ensureTowerTexture(scene, textureKey, towerType, team);
        }
        this.setSpriteTexture(
            textureKey,
            this.isKingTower ? 58 : 44,
            this.isKingTower ? 106 : 75
        );
        if (this.getSprite() && scene.textures.exists('arena_base_royal_valley_parts')) {
            this.getSprite()!.y = this.isKingTower ? -28 : -20;
        }

        this.shadow.setSize(this.isKingTower ? 50 : 42, this.isKingTower ? 14 : 12);
        this.shadow.y = 14;

        this.hpBarBg.scaleX = 1.7;
        this.hpBarFill.scaleX = 1.7;
        this.hpBarHighlight.scaleX = 1.7;
        this.hpBarBg.y = -28;
        this.hpBarFill.y = -28;
        this.hpBarHighlight.y = -29.5;
        this.applyTowerHpBarOffset();
        this.hpBarBg.setAlpha(0.96);

        this.updateSortDepth();

        if (this.isKingTower && !this.towerActive) {
            this.applyDormantKingStyle();
        }
        this.applyArenaArtOverlayStyle();

        const onKingActivated = (data: { team: string }) => {
            if (!this.active || !this.isKingTower) return;
            if (data.team !== this.team) return;
            this.applyActiveKingStyle();
        };
        scene.events.on('kingTowerActivated', onKingActivated);
        this.once(Phaser.GameObjects.Events.DESTROY, () => {
            scene.events.off('kingTowerActivated', onKingActivated);
        });
    }

    // Towers don't move.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(_time: number, delta: number, entityManager?: any) {
        if (this.state === UnitState.DIE || !this.active) return;

        // Web/root effects use Unit's common stun state. A bound tower stays visible and
        // targetable, but must not acquire a target or fire until the debuff expires.
        if (this.isStunned) {
            this.target = null;
            this.updateTowerHpBar();
            this.updateSortDepth();
            return;
        }

        if (!this.towerActive) {
            this.updateTowerHpBar();
            this.updateSortDepth();
            return;
        }

        if (this.attackTimer > 0) {
            this.attackTimer -= delta;
        }
        if (this.targetScanTimer > 0) {
            this.targetScanTimer -= delta;
        }

        if (!this.isCurrentTargetValid()) {
            this.target = null;
        }
        if (!this.target && this.targetScanTimer <= 0) {
            this.findTargetTower(entityManager);
            this.targetScanTimer = 120;
        }

        if (this.target && this.target.active && this.target.stats.hp > 0 && this.target.state !== UnitState.DIE && this.isInRange()) {
            if (this.attackTimer <= 0) {
                this.fireProjectile();
                this.attackTimer = this.stats.attackSpeed;
            }
        }

        if (!this.scene.textures.exists('arena_base_royal_valley_parts') && this.getSprite() && !this.scene.tweens.isTweening(this.getSprite()!)) {
            this.getSprite()!.rotation = Math.sin(this.scene.time.now * 0.002 + this.x * 0.01) * 0.01;
        }

        this.updateTowerHpBar();
        this.updateSortDepth();
    }

    private isCurrentTargetValid(): boolean {
        if (!this.target || !this.target.active) return false;
        if (this.target.state === UnitState.DIE || this.target.stats.hp <= 0) return false;
        if (this.target.isTower || this.target.team === this.team) return false;
        if (!this.canAttackAcrossRiver(this.target)) return false;
        return this.isInRange();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private findTargetTower(entityManager: any) {
        if (!entityManager) return;
        const units = entityManager.getUnits() as Unit[];
        let closest: Unit | null = null;
        let minDist = Infinity;

        for (const unit of units) {
            if (unit === (this as Unit)) continue;
            if (unit.team === this.team) continue;
            if (!unit.active || unit.state === UnitState.DIE) continue;
            if (unit.isTower) continue;
            if (unit.stats.hp <= 0) continue;
            if (!this.canAttackAcrossRiver(unit)) continue;

            const dist = Phaser.Math.Distance.Between(this.x, this.y, unit.x, unit.y);
            const isCloser = dist < minDist - 0.01;
            const isStableTie = Math.abs(dist - minDist) <= 0.01
                && (closest === null || unit.simulationOrder < closest.simulationOrder);

            if (dist < this.stats.range && (isCloser || isStableTie)) {
                minDist = dist;
                closest = unit;
            }
        }

        this.target = closest;
    }

    private canAttackAcrossRiver(unit: Unit): boolean {
        const riverTop = CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const riverBottom = CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const bridgeMargin = 12;

        if (this.team === 'blue') {
            return unit.y >= riverTop - bridgeMargin;
        }

        return unit.y <= riverBottom + bridgeMargin;
    }

    private isInRange(): boolean {
        if (!this.target) return false;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
        const edgeDistance = Math.max(0, dist - this.getCollisionRadius() - this.target.getCollisionRadius());
        return edgeDistance <= this.stats.range;
    }

    private fireProjectile() {
        if (!this.target) return;
        const muzzle = this.getMuzzlePosition();
        this.scene.events.emit('fireProjectile', {
            fromX: muzzle.x,
            fromY: muzzle.y,
            target: this.target,
            damage: this.stats.damage,
            projectileKey: 'projectile_tower',
            splash: 0,
            team: this.team,
            attacker: this,
            attackType: 'ranged',
        });

        const muzzleColor = this.team === 'blue' ? 0x95d7ff : 0xffae8c;
        const flash = this.scene.add.circle(muzzle.x, muzzle.y, 6, muzzleColor, 0.8);
        flash.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
        flash.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: flash,
            scaleX: 2.3,
            scaleY: 2.3,
            alpha: 0,
            duration: 120,
            onComplete: () => flash.destroy(),
        });

        if (!this.scene.textures.exists('arena_base_royal_valley_parts') && this.getSprite()) {
            this.scene.tweens.add({
                targets: this.getSprite(),
                scaleX: 1.07,
                scaleY: 0.96,
                duration: 90,
                yoyo: true,
            });
        }
    }

    private getMuzzlePosition() {
        if (!this.scene.textures.exists('arena_base_royal_valley_parts') && !this.scene.textures.exists('battle_arena_royal_valley')) {
            return { x: this.x, y: this.y - 18 };
        }

        const yOffset = this.towerType === 'king'
            ? -68
            : -47;
        return { x: this.x, y: this.y + yOffset };
    }

    private updateTowerHpBar() {
        const pct = Math.max(0, this.stats.hp / this.maxHp);
        this.updateDamageArt(pct);
        this.hpBarFill.scaleX = pct * 1.7;
        if (pct > 0.75) {
            this.hpBarFill.setFillStyle(CONSTANTS.COLORS.HP_GREEN);
        } else if (pct > 0.5) {
            this.hpBarFill.setFillStyle(0xdddd44);
        } else {
            this.hpBarFill.setFillStyle(CONSTANTS.COLORS.HP_RED);
        }
    }

    private applyDormantKingStyle() {
        const sprite = this.getSprite();
        if (!sprite) return;
        // Keep team readability while still signaling "inactive".
        sprite.setTint(this.team === 'blue' ? 0x9fb8d8 : 0xd7a79f);
        sprite.setAlpha(this.scene.textures.exists('arena_base_royal_valley_parts') ? 0.76 : this.scene.textures.exists('battle_arena_royal_valley') ? 0 : 0.9);
    }

    private applyActiveKingStyle() {
        const sprite = this.getSprite();
        if (!sprite) return;
        sprite.clearTint();
        sprite.setAlpha(this.scene.textures.exists('battle_arena_royal_valley') && !this.scene.textures.exists('arena_base_royal_valley_parts') ? 0 : 1);

        const wake = this.scene.add.circle(this.x, this.y - 6, 10, 0xffd796, 0.34);
        wake.setDepth(CONSTANTS.DEPTH.PROJECTILE + 4);
        wake.setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
            targets: wake,
            scaleX: 2.8,
            scaleY: 2.8,
            alpha: 0,
            duration: 360,
            onComplete: () => wake.destroy(),
        });
    }

    private applyArenaArtOverlayStyle() {
        if (!this.scene.textures.exists('battle_arena_royal_valley') && !this.scene.textures.exists('arena_base_royal_valley_parts')) return;

        const sprite = this.getSprite();
        if (sprite) {
            if (this.scene.textures.exists('arena_base_royal_valley_parts')) {
                sprite.setAlpha(this.isKingTower && !this.towerActive ? 0.76 : 1);
                sprite.clearTint();
            } else {
                sprite.setAlpha(0);
                sprite.setTint(this.team === 'blue' ? 0x9ec4ff : 0xffaaa0);
            }
        }

        this.shadow.setAlpha(this.scene.textures.exists('arena_base_royal_valley_parts') ? 0.16 : 0);
        this.shadow.y = this.isKingTower ? 15 : 11;
        this.hpBarBg.y = this.isKingTower ? -76 : -56;
        this.hpBarFill.y = this.hpBarBg.y;
        this.hpBarHighlight.y = this.hpBarBg.y - 1.5;
        this.applyTowerHpBarOffset();
    }

    private applyTowerHpBarOffset() {
        const baseXOffset = this.isKingTower ? -5 : -4;
        const xOffset = baseXOffset - this.hpBarBg.displayWidth * 0.15;
        this.hpBarBg.x = xOffset - this.hpBarBg.width / 2;
        this.hpBarFill.x = xOffset - this.hpBarFill.width / 2;
        this.hpBarHighlight.x = xOffset - this.hpBarHighlight.width / 2;
    }

    private updateDamageArt(pct: number) {
        if (this.damagedArtApplied || pct > 0.45) return;
        const damagedKey = Tower.getTowerTextureKey(this.towerType, this.team, 'damaged');
        if (!this.scene.textures.exists(damagedKey)) return;
        this.damagedArtApplied = true;
        this.setSpriteTexture(damagedKey, this.isKingTower ? 58 : 44, this.isKingTower ? 106 : 75);
        if (this.getSprite()) {
            this.getSprite()!.y = this.isKingTower ? -28 : -20;
        }
    }

    private static getTowerTextureKey(towerType: 'king' | 'princess', team: 'blue' | 'red', state: 'idle' | 'damaged' = 'idle') {
        const assetKey = `battle_tower_${team}_${towerType}_${state}`;
        return assetKey;
    }

    private static ensureTowerTexture(
        scene: Phaser.Scene,
        textureKey: string,
        towerType: 'king' | 'princess',
        team: 'blue' | 'red'
    ) {
        if (scene.textures.exists(textureKey)) return;

        const g = scene.add.graphics({ x: 0, y: 0 });
        const size = towerType === 'king' ? 96 : 80;
        const centerX = size / 2;
        const centerY = size / 2;

        const teamRoof = team === 'blue' ? 0x5d8fd8 : 0xb35656;
        const teamRoofDark = team === 'blue' ? 0x395f9f : 0x823b3b;
        const stone = 0xc8b89c;
        const stoneDark = 0x95866f;
        const trim = team === 'blue' ? 0xa8d5ff : 0xffc0b6;

        const bodyW = towerType === 'king' ? 48 : 38;
        const bodyH = towerType === 'king' ? 44 : 34;
        const bodyX = centerX - bodyW / 2;
        const bodyY = centerY - 6;

        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(centerX, centerY + 26, bodyW + 10, 14);

        g.fillStyle(stoneDark, 1);
        g.fillRoundedRect(bodyX - 2, bodyY - 2, bodyW + 4, bodyH + 4, 5);
        g.fillStyle(stone, 1);
        g.fillRoundedRect(bodyX, bodyY, bodyW, bodyH, 5);
        g.lineStyle(1.5, 0x6f6351, 0.75);
        g.strokeRoundedRect(bodyX, bodyY, bodyW, bodyH, 5);

        // Roof + top frame
        g.fillStyle(teamRoofDark, 1);
        g.fillRoundedRect(bodyX - 3, bodyY - 12, bodyW + 6, 12, 4);
        g.fillStyle(teamRoof, 1);
        g.fillRoundedRect(bodyX - 1, bodyY - 10, bodyW + 2, 9, 4);

        // Battlements
        const battlementCount = towerType === 'king' ? 4 : 3;
        const battlementW = (bodyW + 4) / battlementCount;
        for (let i = 0; i < battlementCount; i++) {
            const bx = bodyX - 2 + i * battlementW + 1;
            g.fillStyle(stoneDark, 1);
            g.fillRect(bx, bodyY - 16, battlementW - 2, 6);
            g.fillStyle(stone, 1);
            g.fillRect(bx + 0.6, bodyY - 15, battlementW - 3.2, 4.6);
        }

        // Door / opening
        g.fillStyle(0x4a3625, 1);
        g.fillRoundedRect(centerX - 6, bodyY + bodyH - 14, 12, 12, 2);
        g.fillStyle(0x7c5a3a, 1);
        g.fillRect(centerX - 0.5, bodyY + bodyH - 10, 1, 8);

        // Team trim
        g.fillStyle(trim, 0.95);
        g.fillRect(bodyX + 4, bodyY + 8, bodyW - 8, 2);

        if (towerType === 'king') {
            g.fillStyle(0xe6c35d, 1);
            g.fillTriangle(centerX - 6, bodyY - 18, centerX, bodyY - 26, centerX + 6, bodyY - 18);
            g.fillStyle(0xffec9b, 1);
            g.fillCircle(centerX, bodyY - 22, 1.8);
        }

        g.generateTexture(textureKey, size, size);
        g.destroy();

        if (!scene.textures.exists(textureKey)) {
            const fallback = scene.add.graphics({ x: 0, y: 0 });
            fallback.fillStyle(team === 'blue' ? 0x5d8fd8 : 0xb35656, 1);
            fallback.fillRoundedRect(size * 0.25, size * 0.3, size * 0.5, size * 0.45, 6);
            fallback.lineStyle(2, 0xe8d5b4, 0.9);
            fallback.strokeRoundedRect(size * 0.25, size * 0.3, size * 0.5, size * 0.45, 6);
            fallback.generateTexture(textureKey, size, size);
            fallback.destroy();
        }
    }
}
