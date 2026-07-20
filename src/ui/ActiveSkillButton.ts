import Phaser from 'phaser';
import Unit, { UnitState } from '../entities/Unit';
import EntityManager from '../systems/EntityManager';
import { CONSTANTS } from '../systems/Constants';
import { GAME_FONT } from '../i18n/ko';
import { resolveUnitTexture } from './CardVisual';

export default class ActiveSkillButton {
    private readonly scene: Phaser.Scene;
    private readonly entityManager: EntityManager;
    private readonly onCast: (unit: Unit) => void;
    private readonly container: Phaser.GameObjects.Container;
    private readonly progress: Phaser.GameObjects.Graphics;
    private readonly portrait: Phaser.GameObjects.Image;
    private readonly cooldownText: Phaser.GameObjects.Text;
    private readonly countText: Phaser.GameObjects.Text;
    private selectedUnit: Unit | null = null;

    constructor(scene: Phaser.Scene, entityManager: EntityManager, onCast: (unit: Unit) => void) {
        this.scene = scene;
        this.entityManager = entityManager;
        this.onCast = onCast;
        this.container = scene.add.container(CONSTANTS.SCREEN_WIDTH - 38, CONSTANTS.ARENA.UI_START - 43);
        this.container.setDepth(CONSTANTS.DEPTH.HUD + 18);
        this.container.setVisible(false);

        const shadow = scene.add.circle(2, 3, 29, 0x000000, 0.48);
        const rim = scene.add.circle(0, 0, 28, 0x17243a, 0.98);
        rim.setStrokeStyle(3, 0xd8bc6a, 0.92);
        const well = scene.add.circle(0, 0, 23, 0x070c15, 1);
        well.setStrokeStyle(1.5, 0x6d86b9, 0.75);
        this.portrait = scene.add.image(0, 0, 'unit_generic_blue');
        this.portrait.setDisplaySize(40, 40);
        const shade = scene.add.circle(0, 0, 22, 0x050812, 0);
        this.progress = scene.add.graphics();
        this.cooldownText = scene.add.text(0, 0, '', {
            fontFamily: GAME_FONT,
            fontSize: '15px',
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#080b13',
            strokeThickness: 4,
        }).setOrigin(0.5).setResolution(2);
        this.countText = scene.add.text(22, -22, '', {
            fontFamily: GAME_FONT,
            fontSize: '9px',
            fontStyle: '900',
            color: '#ffffff',
            backgroundColor: '#17233a',
            padding: { x: 4, y: 2 },
        }).setOrigin(0.5).setResolution(2);

        this.container.add([shadow, rim, well, this.portrait, shade, this.progress, this.cooldownText, this.countText]);
        this.container.setSize(62, 62);
        this.container.setInteractive({ useHandCursor: true });
        this.container.on('pointerdown', () => {
            this.container.setScale(0.94);
        });
        this.container.on('pointerup', () => {
            this.container.setScale(1);
            const candidate = this.pickCastCandidate();
            if (candidate) this.onCast(candidate);
        });
        this.container.on('pointerout', () => this.container.setScale(1));
    }

    public update() {
        const units = this.getCandidates();
        if (units.length === 0) {
            this.selectedUnit = null;
            this.container.setVisible(false);
            return;
        }

        this.container.setVisible(true);
        const selectedStillValid = this.selectedUnit && units.includes(this.selectedUnit);
        if (!selectedStillValid) this.selectedUnit = units[0];
        const ready = units.find(unit => unit.canCastActiveSkill());
        if (ready && !this.selectedUnit?.canCastActiveSkill()) this.selectedUnit = ready;

        const unit = this.selectedUnit ?? units[0];
        const runtime = unit.getActiveSkillRuntime();
        const texture = resolveUnitTexture(this.scene, unit.unitKey);
        if (this.portrait.texture.key !== texture) this.portrait.setTexture(texture);
        this.portrait.setDisplaySize(40, 40);
        this.countText.setText(units.length > 1 ? String(units.length) : '');
        this.countText.setVisible(units.length > 1);

        this.progress.clear();
        if (!runtime || runtime.phase === 'ready') {
            this.portrait.setTint(0xffffff);
            this.cooldownText.setText('');
            this.progress.lineStyle(3, 0x70e5ff, 0.95);
            this.progress.strokeCircle(0, 0, 25);
            return;
        }

        this.portrait.setTint(0x7d8799);
        this.progress.fillStyle(0x02050b, 0.58);
        this.progress.fillCircle(0, 0, 22);
        this.progress.lineStyle(3, 0x67d6ff, 0.95);
        this.progress.beginPath();
        this.progress.arc(0, 0, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * runtime.cooldownProgress, false);
        this.progress.strokePath();
        this.cooldownText.setText(runtime.phase === 'casting'
            ? '시전'
            : String(Math.max(1, Math.ceil(runtime.cooldownRemainingMs / 1000))));
    }

    public destroy() {
        this.container.destroy(true);
        this.selectedUnit = null;
    }

    private getCandidates(): Unit[] {
        return this.entityManager.getActiveSkillUnits('blue')
            .filter(unit => unit.active && unit.state !== UnitState.DIE)
            .sort((a, b) => b.simulationOrder - a.simulationOrder);
    }

    private pickCastCandidate(): Unit | null {
        const candidates = this.getCandidates();
        const selected = this.selectedUnit;
        if (selected && candidates.includes(selected) && selected.canCastActiveSkill()) return selected;
        const ready = candidates.find(unit => unit.canCastActiveSkill()) ?? null;
        if (ready) this.selectedUnit = ready;
        return ready;
    }
}
