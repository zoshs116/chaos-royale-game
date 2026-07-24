import Phaser from 'phaser';
import Unit, { UnitState } from '../entities/Unit';
import EntityManager from '../systems/EntityManager';
import { CONSTANTS } from '../systems/Constants';
import { GAME_FONT } from '../i18n/ko';
import { resolveUnitTexture } from './CardVisual';

type SkillButtonSlot = {
    container: Phaser.GameObjects.Container;
    progress: Phaser.GameObjects.Graphics;
    portrait: Phaser.GameObjects.Image;
    cooldownText: Phaser.GameObjects.Text;
};

const SLOT_SPACING_X = 58;
const SLOT_SPACING_Y = 58;
const SLOTS_PER_ROW = 4;

export default class ActiveSkillButton {
    private readonly scene: Phaser.Scene;
    private readonly entityManager: EntityManager;
    private readonly onCast: (unit: Unit) => void;
    private readonly slots = new Map<Unit, SkillButtonSlot>();

    constructor(scene: Phaser.Scene, entityManager: EntityManager, onCast: (unit: Unit) => void) {
        this.scene = scene;
        this.entityManager = entityManager;
        this.onCast = onCast;
    }

    public update() {
        const units = this.getCandidates();
        const activeUnits = new Set(units);

        for (const [unit, slot] of this.slots) {
            if (activeUnits.has(unit)) continue;
            slot.container.destroy(true);
            this.slots.delete(unit);
        }

        units.forEach((unit, index) => {
            const slot = this.slots.get(unit) ?? this.createSlot(unit);
            this.layoutSlot(slot, index);
            this.updateSlot(slot, unit);
        });
    }

    public destroy() {
        for (const slot of this.slots.values()) slot.container.destroy(true);
        this.slots.clear();
    }

    private createSlot(unit: Unit): SkillButtonSlot {
        const container = this.scene.add.container(0, 0);
        container.setDepth(CONSTANTS.DEPTH.HUD + 18);

        const shadow = this.scene.add.circle(2, 3, 29, 0x000000, 0.48);
        const rim = this.scene.add.circle(0, 0, 28, 0x17243a, 0.98);
        rim.setStrokeStyle(3, 0xd8bc6a, 0.92);
        const well = this.scene.add.circle(0, 0, 23, 0x070c15, 1);
        well.setStrokeStyle(1.5, 0x6d86b9, 0.75);
        const portrait = this.scene.add.image(0, 0, 'unit_generic_blue');
        portrait.setDisplaySize(40, 40);
        const shade = this.scene.add.circle(0, 0, 22, 0x050812, 0);
        const progress = this.scene.add.graphics();
        const cooldownText = this.scene.add.text(0, 0, '', {
            fontFamily: GAME_FONT,
            fontSize: '15px',
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#080b13',
            strokeThickness: 4,
        }).setOrigin(0.5).setResolution(2);

        container.add([shadow, rim, well, portrait, shade, progress, cooldownText]);
        container.setSize(62, 62);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerdown', () => container.setScale(0.94));
        container.on('pointerup', () => {
            container.setScale(1);
            if (unit.active && unit.state !== UnitState.DIE && unit.canCastActiveSkill()) {
                this.onCast(unit);
            }
        });
        container.on('pointerout', () => container.setScale(1));

        const slot = { container, progress, portrait, cooldownText };
        this.slots.set(unit, slot);
        return slot;
    }

    private layoutSlot(slot: SkillButtonSlot, index: number) {
        const column = index % SLOTS_PER_ROW;
        const row = Math.floor(index / SLOTS_PER_ROW);
        slot.container.setPosition(
            CONSTANTS.SCREEN_WIDTH - 38 - column * SLOT_SPACING_X,
            CONSTANTS.ARENA.UI_START - 43 - row * SLOT_SPACING_Y,
        );
    }

    private updateSlot(slot: SkillButtonSlot, unit: Unit) {
        const runtime = unit.getActiveSkillRuntime();
        const texture = resolveUnitTexture(this.scene, unit.unitKey);
        if (slot.portrait.texture.key !== texture) slot.portrait.setTexture(texture);
        slot.portrait.setDisplaySize(40, 40);

        slot.progress.clear();
        if (!runtime || runtime.phase === 'ready') {
            slot.portrait.clearTint();
            slot.cooldownText.setText('');
            slot.progress.lineStyle(3, 0x70e5ff, 0.95);
            slot.progress.strokeCircle(0, 0, 25);
            return;
        }

        slot.portrait.setTint(0x7d8799);
        slot.progress.fillStyle(0x02050b, 0.58);
        slot.progress.fillCircle(0, 0, 22);
        slot.progress.lineStyle(3, 0x67d6ff, 0.95);
        slot.progress.beginPath();
        slot.progress.arc(
            0,
            0,
            25,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * runtime.cooldownProgress,
            false,
        );
        slot.progress.strokePath();
        slot.cooldownText.setText(runtime.phase === 'casting'
            ? '시전'
            : String(Math.max(1, Math.ceil(runtime.cooldownRemainingMs / 1000))));
    }

    private getCandidates(): Unit[] {
        return this.entityManager.getActiveSkillUnits('blue')
            .filter(unit => unit.active && unit.state !== UnitState.DIE)
            .sort((a, b) => a.simulationOrder - b.simulationOrder);
    }
}
