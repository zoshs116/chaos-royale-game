import Phaser from 'phaser';
import { UNIT_TYPES, UNIT_FACTIONS } from '../data/UnitData';
import { CONSTANTS } from '../systems/Constants';
import { fitUnitNameKo } from '../i18n/ko';
import {
    cardFrameKey as getCardFrameKey,
    createCardOrnaments,
    createCostBadge,
    createFactionBadge,
    createNameplate,
    createPortraitPanel,
    fitPortraitImage,
    resolveUnitTexture,
} from './CardVisual';

export default class Card extends Phaser.GameObjects.Container {
    public unitKey: string;
    public cost: number;
    public originalX: number;
    public originalY: number;

    private bg: Phaser.GameObjects.Rectangle;
    private frame: Phaser.GameObjects.Rectangle;
    private costBg: Phaser.GameObjects.Arc;
    private costText: Phaser.GameObjects.Text;
    private nameText: Phaser.GameObjects.Text;
    private preview: Phaser.GameObjects.Image;
    private lockOverlay: Phaser.GameObjects.Rectangle;
    private factionBadge: Phaser.GameObjects.Container;
    private statusFrame: Phaser.GameObjects.Graphics;
    private usesArtFrame = false;

    constructor(scene: Phaser.Scene, x: number, y: number, unitKey: string) {
        super(scene, x, y);
        this.unitKey = unitKey;
        this.cost = UNIT_TYPES[unitKey]?.cost ?? 3;
        this.originalX = x;
        this.originalY = y;

        const cardW = 74;
        const cardH = 96;

        const frameKey = this.cardFrameKey(unitKey);
        this.usesArtFrame = scene.textures.exists(frameKey);
        if (this.usesArtFrame) {
            const frameImage = scene.add.nineslice(0, 0, frameKey, undefined, cardW + 8, cardH + 10, 18, 18, 20, 20);
            this.add(frameImage);
        }

        this.bg = scene.add.rectangle(0, 0, cardW, cardH, 0x0b1222, this.usesArtFrame ? 0 : 1);
        this.bg.setStrokeStyle(3, 0x95a8ff, this.usesArtFrame ? 0 : 0.94);
        this.add(this.bg);

        this.frame = scene.add.rectangle(0, -4, cardW - 10, cardH - 14, 0x18223a, this.usesArtFrame ? 0 : 1);
        this.frame.setStrokeStyle(1, 0xffffff, this.usesArtFrame ? 0 : 0.22);
        this.add(this.frame);

        const portrait = createPortraitPanel(scene, unitKey, 0, -9, cardW - 16, cardH - 32);
        this.preview = portrait.image;
        this.add(portrait.container);
        this.add(createCardOrnaments(scene, unitKey, cardW, cardH, true));

        const nameplate = createNameplate(scene, 0, cardH / 2 - 13, cardW - 12, unitKey, 8);
        this.nameText = nameplate.text;
        this.add(nameplate.container);

        const cost = createCostBadge(scene, -cardW / 2 + 11, -cardH / 2 + 11, this.cost, 22);
        this.costBg = cost.bg;
        this.costText = cost.text;
        this.add(cost.container);

        this.factionBadge = createFactionBadge(scene, cardW / 2 - 11, -cardH / 2 + 11, UNIT_FACTIONS[unitKey]?.faction, 18);
        this.add(this.factionBadge);

        this.lockOverlay = scene.add.rectangle(0, 0, cardW - 4, cardH - 4, 0x000000, 0);
        this.add(this.lockOverlay);

        this.statusFrame = scene.add.graphics();
        this.add(this.statusFrame);

        this.setSize(cardW, cardH);
        this.setInteractive({ draggable: true });
        this.setDepth(CONSTANTS.DEPTH.CARD);
        scene.add.existing(this);
        this.paintStatusFrame(true);
    }

    static createMiniCard(scene: Phaser.Scene, x: number, y: number, unitKey: string): Phaser.GameObjects.Container {
        const container = scene.add.container(x, y);
        const cardW = 46;
        const cardH = 58;
        const data = UNIT_TYPES[unitKey];
        const cost = data?.cost ?? 3;

        const faction = UNIT_FACTIONS[unitKey]?.faction;
        const frameKey = getCardFrameKey(faction);
        if (scene.textures.exists(frameKey)) {
            const frame = scene.add.nineslice(0, 0, frameKey, undefined, cardW + 8, cardH + 10, 14, 14, 16, 16);
            container.add(frame);
        } else {
            const shadow = scene.add.rectangle(2, 3, cardW, cardH, 0x000000, 0.42);
            container.add(shadow);
            const bg = scene.add.rectangle(0, 0, cardW, cardH, 0x0b1020, 1);
            bg.setStrokeStyle(1, 0x6f7faa, 0.82);
            container.add(bg);
        }

        const portrait = createPortraitPanel(scene, unitKey, 0, 3, cardW - 14, cardH - 20);
        container.add(portrait.container);
        container.add(createCardOrnaments(scene, unitKey, cardW, cardH, true));

        const costBadge = createCostBadge(scene, -cardW / 2 + 8, -cardH / 2 + 8, cost, 16);
        container.add(costBadge.container);

        container.setSize(cardW, cardH);
        container.setDepth(CONSTANTS.DEPTH.CARD);
        return container;
    }

    setAffordable(affordable: boolean) {
        if (affordable) {
            this.bg.setStrokeStyle(3, 0x9fb0ff, 0.98);
            this.frame.setStrokeStyle(1, 0xffffff, this.usesArtFrame ? 0 : 0.28);
            if (this.usesArtFrame) this.bg.setStrokeStyle(3, 0x9fb0ff, 0);
            this.costBg.setFillStyle(0xba19d4);
            this.lockOverlay.setAlpha(0);
            this.preview.clearTint();
            this.setAlpha(1);
            this.paintStatusFrame(true);
        } else {
            this.bg.setStrokeStyle(3, 0x3d465d, 0.9);
            this.frame.setStrokeStyle(1, 0x222a3a, this.usesArtFrame ? 0 : 0.9);
            if (this.usesArtFrame) this.bg.setStrokeStyle(3, 0x3d465d, 0);
            this.costBg.setFillStyle(0x4a4d60);
            this.lockOverlay.setAlpha(0.48);
            this.preview.setTint(0x777f91);
            this.setAlpha(0.82);
            this.paintStatusFrame(false);
        }
    }

    setUnitKey(newKey: string) {
        this.unitKey = newKey;
        this.cost = UNIT_TYPES[newKey]?.cost ?? 3;
        this.costText.setText(`${this.cost}`);
        this.nameText.setText(this.displayName(newKey));
        this.preview.setTexture(this.resolveTexture(this.scene, newKey));
        fitPortraitImage(this.preview, 45, 54);
        const frameImage = this.list.find((child) => child instanceof Phaser.GameObjects.NineSlice) as Phaser.GameObjects.NineSlice | undefined;
        const frameKey = this.cardFrameKey(newKey);
        if (frameImage && this.scene.textures.exists(frameKey)) frameImage.setTexture(frameKey);
        this.factionBadge.destroy();
        this.factionBadge = createFactionBadge(this.scene, 26, -37, UNIT_FACTIONS[newKey]?.faction, 18);
        this.addAt(this.factionBadge, Math.max(0, this.list.length - 1));
        this.preview.clearTint();
    }

    private paintStatusFrame(affordable: boolean) {
        this.statusFrame.clear();
        if (affordable) {
            this.statusFrame.lineStyle(1.6, 0xdce7ff, 0.18);
            this.statusFrame.strokeRoundedRect(-32, -43, 64, 82, 8);
            this.statusFrame.lineStyle(2.2, 0x9fb0ff, 0.34);
            this.statusFrame.strokeRoundedRect(-36, -47, 72, 92, 10);
            return;
        }

        this.statusFrame.fillStyle(0x000000, 0.2);
        this.statusFrame.fillRoundedRect(-34, -46, 68, 90, 9);
        this.statusFrame.lineStyle(2.4, 0x4f5871, 0.88);
        this.statusFrame.strokeRoundedRect(-36, -47, 72, 92, 10);
        this.statusFrame.lineStyle(2.2, 0xffd66b, 0.42);
        this.statusFrame.lineBetween(-24, 31, 24, 31);
    }

    resetPosition() {
        this.scene.tweens.add({
            targets: this,
            x: this.originalX,
            y: this.originalY,
            duration: 200,
            ease: 'Back.easeOut',
        });
        this.setDepth(CONSTANTS.DEPTH.CARD);
    }

    private resolveTexture(scene: Phaser.Scene, unitKey: string) {
        const data = UNIT_TYPES[unitKey];
        const cardPortraitKey = `portrait_card_${unitKey}`;
        const hdPortraitKey = `portrait_hd_${unitKey}`;
        const portraitKey = `portrait_${unitKey}`;
        const spriteKey = `unit_${data?.spriteKey || unitKey}_blue`;
        if (scene.textures.exists(cardPortraitKey)) return cardPortraitKey;
        if (scene.textures.exists(hdPortraitKey)) return hdPortraitKey;
        if (scene.textures.exists(portraitKey)) return portraitKey;
        if (scene.textures.exists(spriteKey)) return spriteKey;
        return resolveUnitTexture(scene, unitKey);
    }

    private displayName(unitKey: string) {
        return fitUnitNameKo(unitKey, 6);
    }

    private cardFrameKey(unitKey: string) {
        return getCardFrameKey(UNIT_FACTIONS[unitKey]?.faction);
    }
}
