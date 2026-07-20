import Phaser from 'phaser';
import { configureLogicalCamera, getLayout, getPointerLogicalPosition } from '../core/Resolution';
import { UNIT_TYPES, UNIT_FACTIONS, FACTION_COLORS, CATEGORY_COLORS } from '../data/UnitData';
import type { Faction, UnitCategory } from '../data/UnitData';
import { addBottomNav, addButton, addGameBackground, addHeaderBar, addSlotFrame, addToastPanel, playScreenIntro, UI_FONT, TITLE_FONT } from '../ui/GameSkin';
import { ko } from '../i18n/ko';
import {
    cardFrameKey as getCardFrameKey,
    createCardOrnaments,
    createCostBadge,
    createFactionBadge,
    createNameplate,
    createPortraitPanel,
    createShardBar,
} from '../ui/CardVisual';

interface DeckCard {
    unitKey: string;
    selected: boolean;
}

const COLLECTION_COLS = 3;
const COLLECTION_CARD_W = 96;
const COLLECTION_CARD_H = 112;
const COLLECTION_GAP = 12;

const FACTION_LABELS: Record<Faction | 'all', string> = {
    all: ko.filters.factions.all,
    sentinel: ko.filters.factions.sentinel,
    scourge: ko.filters.factions.scourge,
    neutral: ko.filters.factions.neutral,
};

const CATEGORY_LABELS: Record<UnitCategory | 'all', string> = {
    all: ko.filters.categories.all,
    tank: ko.filters.categories.tank,
    magic: ko.filters.categories.magic,
    assassin: ko.filters.categories.assassin,
    dealer: ko.filters.categories.dealer,
    summon: ko.filters.categories.summon,
    terror: ko.filters.categories.terror,
};

export default class DeckScene extends Phaser.Scene {
    private selectedDeck: string[] = [];
    private cards: DeckCard[] = [];
    private deckSlots: Phaser.GameObjects.Container[] = [];
    private currentFactionFilter: Faction | 'all' = 'all';
    private currentCategoryFilter: UnitCategory | 'all' = 'all';
    private scrollContainer!: Phaser.GameObjects.Container;
    private scrollY = 0;
    private maxScrollY = 0;
    private isDragging = false;
    private dragStartY = 0;
    private dragStartScrollY = 0;
    private popupContainer: Phaser.GameObjects.Container | null = null;
    private factionTabs: Phaser.GameObjects.Container[] = [];
    private categoryTabs: Phaser.GameObjects.Container[] = [];
    private selectedCountText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'deck-scene' });
    }

    create() {
        configureLogicalCamera(this);
        playScreenIntro(this);
        this.resetState();
        this.createBackground();
        this.createHeader();
        this.createDeckPanel();
        this.createFilters();
        this.createCollectionGrid();
        this.createBattleButton();
        this.createBottomNav();
        this.initCards();
        this.setupScrolling();
    }

    private resetState() {
        this.input.off('pointerdown');
        this.input.off('pointermove');
        this.input.off('pointerup');
        this.input.off('wheel');
        this.deckSlots = [];
        this.factionTabs = [];
        this.categoryTabs = [];
        this.popupContainer = null;
        this.scrollY = 0;
        this.maxScrollY = 0;
        this.isDragging = false;
    }

    private createBackground() {
        const { width, height } = getLayout();
        addGameBackground(this, width, height);
    }

    private createHeader() {
        const { width } = getLayout();

        if (this.textures.exists('deck_ko_header_title')) {
            const back = this.add.image(34, 34, 'deck_ko_back_button').setDisplaySize(34, 34);
            back.setInteractive({ useHandCursor: true });
            back.on('pointerdown', () => this.scene.start('lobby-scene'));

            this.add.image(170, 31, 'deck_ko_header_title').setDisplaySize(132, 38);
            this.add.image(width - 62, 32, 'deck_ko_avg_elixir_capsule').setDisplaySize(92, 25);
            this.add.text(width - 68, 48, '3.8', {
                fontSize: '12px',
                fontFamily: TITLE_FONT,
                fontStyle: '900',
                color: '#fbabff',
                stroke: '#02050d',
                strokeThickness: 2,
            }).setOrigin(0.5);
            return;
        }

        addHeaderBar(this, width, 70);

        const back = this.add.container(26, 34);
        const backBg = this.roundedRect(-18, -18, 36, 36, 9, 0x141b2b, 1, 0x6273ac, 0.86, 1.5);
        back.add(backBg);
        back.add(this.centerText(0, -1, '<', 20, '#dce7ff'));
        back.setSize(36, 36);
        back.setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('lobby-scene'));

        this.add.text(134, 36, ko.deck.title, {
            fontSize: '14px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#edf3ff',
            stroke: '#02050d',
            strokeThickness: 2,
        }).setOrigin(0, 0.5);

        this.add.text(136, 49, ko.deck.active, {
            fontSize: '7px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#9facce',
        }).setOrigin(0, 0.5);

        this.roundedRect(width - 111, 21, 84, 32, 8, 0x07101f, 0.82, 0x31405d, 0.78, 1);
        this.add.text(width - 72, 30, ko.deck.avgElixir, {
            fontSize: '6px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#9facce',
        }).setOrigin(0.5).setResolution(2);
        this.add.text(width - 72, 45, '3.8', {
            fontSize: '17px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#fbabff',
            stroke: '#02050d',
            strokeThickness: 2,
        }).setOrigin(0.5);

        const gem = this.add.rectangle(width - 29, 36, 22, 22, 0x9b18ba, 1);
        gem.setAngle(45);
        gem.setStrokeStyle(2, 0xfbabff, 0.9);
        this.add.text(width - 29, 36, 'A', {
            fontSize: '8px',
            fontFamily: TITLE_FONT,
            fontStyle: '700',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);
    }

    private createDeckPanel() {
        if (this.textures.exists('deck_ko_selected_deck_panel')) {
            this.add.image(180, 158, 'deck_ko_selected_deck_panel').setDisplaySize(310, 154);
        } else {
            this.roundedRect(16, 82, 328, 170, 12, 0x111827, 0.92, 0x4a5a82, 0.88, 1.5);
            this.roundedRect(26, 92, 308, 8, 4, 0xffffff, 0.055);
        }

        const slotW = 74;
        const slotH = 74;
        const stitchedDeck = this.textures.exists('deck_ko_selected_deck_panel');
        const startX = stitchedDeck ? 69 : 56;
        const startY = stitchedDeck ? 122 : 122;
        const stitchedSlotOffsets = [
            { x: -9, y: 5 },
            { x: -7, y: 5 },
            { x: -3, y: 7 },
            { x: 8, y: 7 },
            { x: -4, y: 0 },
            { x: -7, y: -4 },
            { x: -3, y: -5 },
            { x: 8, y: -5 },
        ];
        for (let i = 0; i < 8; i++) {
            const offset = stitchedDeck ? stitchedSlotOffsets[i] : { x: 0, y: 0 };
            const x = startX + (i % 4) * (stitchedDeck ? 69 : 82) + offset.x;
            const y = startY + Math.floor(i / 4) * (stitchedDeck ? 75 : 82) + offset.y;
            const slot = this.add.container(x, y);
            slot.setSize(slotW, slotH);
            slot.setInteractive({ useHandCursor: true });
            slot.on('pointerdown', () => this.removeFromDeck(i));
            this.deckSlots.push(slot);
        }

        this.selectedCountText = this.add.text(32, 256, ko.deck.selected(8), {
            fontSize: '9px',
            fontFamily: UI_FONT,
            fontStyle: '800',
            color: '#9facce',
        });
        this.selectedCountText.setVisible(false);
    }

    private createFilters() {
        const factions: (Faction | 'all')[] = ['all', 'sentinel', 'scourge', 'neutral'];
        factions.forEach((faction, i) => {
            const stitchedDeck = this.textures.exists('deck_ko_selected_deck_panel');
            const x = stitchedDeck ? 62 + i * 78 : 42 + i * 82;
            const tab = this.createFilterTab(x, stitchedDeck ? 268 : 274, stitchedDeck ? 66 : 74, stitchedDeck ? 22 : 24, FACTION_LABELS[faction], this.currentFactionFilter === faction, () => {
                this.currentFactionFilter = faction;
                this.updateFilterStyles();
                this.renderCards();
            }, stitchedDeck ? 9 : 10);
            this.factionTabs.push(tab);
        });

        const categories: (UnitCategory | 'all')[] = ['all', 'tank', 'magic', 'assassin', 'dealer', 'summon', 'terror'];
        categories.forEach((category, i) => {
            const stitchedDeck = this.textures.exists('deck_ko_selected_deck_panel');
            const x = stitchedDeck ? 40 + i * 47 : 26 + i * 51;
            const tab = this.createFilterTab(x, stitchedDeck ? 296 : 304, stitchedDeck ? 40 : 46, stitchedDeck ? 17 : 18, CATEGORY_LABELS[category], this.currentCategoryFilter === category, () => {
                this.currentCategoryFilter = category;
                this.updateFilterStyles();
                this.renderCards();
            }, stitchedDeck ? 7 : 8);
            this.categoryTabs.push(tab);
        });
    }

    private createCollectionGrid() {
        const { width } = getLayout();
        const stitchedDeck = this.textures.exists('deck_ko_collection_panel');
        const gridY = stitchedDeck ? 319 : 325;
        const gridH = stitchedDeck ? 306 : 290;

        if (this.textures.exists('deck_ko_collection_panel')) {
            this.add.image(width / 2, gridY + gridH / 2, 'deck_ko_collection_panel').setDisplaySize(width - 32, gridH + 16);
        } else {
            this.roundedRect(16, gridY - 8, width - 32, gridH + 16, 12, 0x0b1020, 0.58, 0x3e4d75, 0.72, 1.5);
            this.roundedRect(26, gridY, width - 52, 6, 3, 0xffffff, 0.04);
        }
        this.scrollContainer = this.add.container(0, gridY);

        const maskShape = this.make.graphics({});
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(16, gridY, width - 32, gridH);
        const mask = maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);
    }

    private createBattleButton() {
        const { width } = getLayout();
        if (this.textures.exists('deck_ko_battle_button_normal')) {
            const button = this.add.image(width / 2, 690, 'deck_ko_battle_button_normal').setDisplaySize(146, 51);
            button.setInteractive({ useHandCursor: true });
            button.on('pointerdown', () => {
                button.setAlpha(0.88);
                this.time.delayedCall(80, () => {
                    button.setAlpha(1);
                    this.startBattle();
                });
            });
            button.on('pointerup', () => button.setAlpha(1));
            button.on('pointerout', () => button.setAlpha(1));
            return;
        }
        addButton(this, width / 2, 674, 280, 58, ko.common.battle, 'primary', () => this.startBattle(), 20, {
            labelY: 5,
        });
    }

    private createBottomNav() {
        addBottomNav(this, 'deck', (key) => this.onNavClick(key));
    }

    private initCards() {
        const unitKeys = Object.keys(UNIT_TYPES).filter((key) => UNIT_FACTIONS[key] && !UNIT_FACTIONS[key].isHidden);
        const pinnedUnits = ['skeleton_swordsman', 'spear_goblin', 'royal_giant', 'hog_rider', 'duckxel_barbarian', 'duckxel_sword_man', 'duckxel_muradin'].filter((key) => unitKeys.includes(key));
        this.selectedDeck = [
            ...pinnedUnits,
            ...unitKeys.filter((key) => !pinnedUnits.includes(key)),
        ].slice(0, 8);
        this.cards = unitKeys.map((key) => ({
            unitKey: key,
            selected: this.selectedDeck.includes(key),
        }));
        this.updateDeckSlots();
        this.renderCards();
    }

    private renderCards() {
        this.scrollContainer.removeAll(true);
        const filteredCards = this.cards.filter((card) => {
            if (card.selected) return false;
            const factionData = UNIT_FACTIONS[card.unitKey];
            if (!factionData) return false;
            if (this.currentFactionFilter !== 'all' && factionData.faction !== this.currentFactionFilter) return false;
            if (this.currentCategoryFilter !== 'all' && factionData.category !== this.currentCategoryFilter) return false;
            return true;
        });

        filteredCards.sort((a, b) => (UNIT_TYPES[a.unitKey]?.cost ?? 0) - (UNIT_TYPES[b.unitKey]?.cost ?? 0));

        const startX = 68;
        const startY = COLLECTION_CARD_H / 2 + 38;
        filteredCards.forEach((card, index) => {
            const col = index % COLLECTION_COLS;
            const row = Math.floor(index / COLLECTION_COLS);
            const x = startX + col * (COLLECTION_CARD_W + COLLECTION_GAP);
            const y = startY + row * (COLLECTION_CARD_H + COLLECTION_GAP);
            const cardElement = this.createCollectionCard(card.unitKey, x, y);
            this.scrollContainer.add(cardElement);
        });

        const totalRows = Math.ceil(filteredCards.length / COLLECTION_COLS);
        const totalHeight = totalRows * (COLLECTION_CARD_H + COLLECTION_GAP);
        this.maxScrollY = Math.max(0, totalHeight - 290);
    }

    private createCollectionCard(unitKey: string, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);
        const data = UNIT_TYPES[unitKey];
        const factionData = UNIT_FACTIONS[unitKey] || { faction: 'neutral' as Faction, category: 'dealer' as UnitCategory };
        const factionColor = FACTION_COLORS[factionData.faction];
        const categoryColor = CATEGORY_COLORS[factionData.category];

        const frameKey = getCardFrameKey(factionData.faction);
        if (this.textures.exists(frameKey)) {
            const frame = this.add.nineslice(0, 0, frameKey, undefined, COLLECTION_CARD_W + 8, COLLECTION_CARD_H + 10, 22, 22, 24, 24);
            container.add(frame);
        } else {
            container.add(this.roundedRect(-COLLECTION_CARD_W / 2, -COLLECTION_CARD_H / 2, COLLECTION_CARD_W, COLLECTION_CARD_H, 9, 0x101725, 1, categoryColor, 0.9, 2));
        }

        const portrait = createPortraitPanel(this, unitKey, 0, -17, 78, 70, factionColor);
        container.add(portrait.container);
        container.add(createCardOrnaments(this, unitKey, COLLECTION_CARD_W, COLLECTION_CARD_H, false));

        const cost = createCostBadge(this, -COLLECTION_CARD_W / 2 + 14, -COLLECTION_CARD_H / 2 + 15, data.cost, 23);
        container.add(cost.container);
        container.add(createFactionBadge(this, COLLECTION_CARD_W / 2 - 14, -COLLECTION_CARD_H / 2 + 15, factionData.faction, 19));

        const nameplate = createNameplate(this, 0, COLLECTION_CARD_H / 2 - 18, COLLECTION_CARD_W - 14, unitKey, 9);
        container.add(nameplate.container);

        const pct = Phaser.Math.Clamp(((data.cost % 5) + 1) / 5, 0.2, 1);
        container.add(createShardBar(this, 0, COLLECTION_CARD_H / 2 - 3, COLLECTION_CARD_W - 18, pct, categoryColor));

        container.setSize(COLLECTION_CARD_W, COLLECTION_CARD_H);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event.stopPropagation();
            this.tweens.add({
                targets: container,
                scaleX: 0.94,
                scaleY: 0.94,
                duration: 70,
                yoyo: true,
                ease: 'Sine.easeOut',
            });
            this.addToDeck(unitKey);
        });
        return container;
    }

    private updateDeckSlots() {
        const stitchedDeck = this.textures.exists('deck_ko_selected_deck_panel');
        this.deckSlots.forEach((slot, i) => {
            slot.removeAll(true);
            const unitKey = this.selectedDeck[i];
            if (unitKey) {
                const data = UNIT_TYPES[unitKey];
                const factionData = UNIT_FACTIONS[unitKey] || { faction: 'neutral' as Faction, category: 'dealer' as UnitCategory };
                const frameKey = getCardFrameKey(factionData.faction);
                if (!stitchedDeck && this.textures.exists(frameKey)) {
                    const frame = this.add.nineslice(0, 0, frameKey, undefined, 78, 80, 18, 18, 20, 20);
                    slot.add(frame);
                } else if (!stitchedDeck) {
                    slot.add(this.roundedRect(-37, -37, 74, 74, 9, 0x101725, 1, FACTION_COLORS[factionData.faction], 0.95, 2));
                }
                const portrait = createPortraitPanel(this, unitKey, 0, stitchedDeck ? -6 : -4, stitchedDeck ? 56 : 62, stitchedDeck ? 52 : 58, FACTION_COLORS[factionData.faction]);
                slot.add(portrait.container);
                if (!stitchedDeck) slot.add(createCardOrnaments(this, unitKey, 74, 74, true));
                const cost = createCostBadge(this, -25, -24, data.cost, 20);
                slot.add(cost.container);
            } else {
                if (!stitchedDeck) slot.add(addSlotFrame(this, 0, 0, 74, 74, false));
                slot.add(this.centerText(0, 0, '+', 24, '#8e99bd'));
            }
        });
        this.selectedCountText.setText(ko.deck.selected(this.selectedDeck.length));
    }

    private addToDeck(unitKey: string) {
        if (this.selectedDeck.length >= 8) {
            this.showMessage(ko.deck.full);
            return;
        }
        const card = this.cards.find((item) => item.unitKey === unitKey);
        if (!card || card.selected) return;
        card.selected = true;
        this.selectedDeck.push(unitKey);
        this.updateDeckSlots();
        this.renderCards();
        const slot = this.deckSlots[this.selectedDeck.length - 1];
        if (slot) {
            slot.setScale(0.82);
            this.tweens.add({ targets: slot, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
        }
    }

    private removeFromDeck(index: number) {
        const unitKey = this.selectedDeck[index];
        if (!unitKey) return;
        this.selectedDeck.splice(index, 1);
        const card = this.cards.find((item) => item.unitKey === unitKey);
        if (card) card.selected = false;
        this.updateDeckSlots();
        this.renderCards();
        this.showMessage(ko.deck.removed);
    }

    private setupScrolling() {
        const stitchedDeck = this.textures.exists('deck_ko_collection_panel');
        const gridTop = stitchedDeck ? 319 : 325;
        const gridBottom = stitchedDeck ? 625 : 615;
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const p = getPointerLogicalPosition(pointer);
            if (p.y >= gridTop && p.y <= gridBottom) {
                this.isDragging = true;
                this.dragStartY = p.y;
                this.dragStartScrollY = this.scrollY;
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.isDragging) return;
            const p = getPointerLogicalPosition(pointer);
            const deltaY = p.y - this.dragStartY;
            this.scrollY = Phaser.Math.Clamp(this.dragStartScrollY - deltaY, 0, this.maxScrollY);
            this.scrollContainer.y = gridTop - this.scrollY;
        });

        this.input.on('pointerup', () => {
            this.isDragging = false;
        });

        this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
            this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.45, 0, this.maxScrollY);
            this.scrollContainer.y = gridTop - this.scrollY;
        });
    }

    private updateFilterStyles() {
        const stitchedDeck = this.textures.exists('deck_ko_selected_deck_panel');
        const factions: (Faction | 'all')[] = ['all', 'sentinel', 'scourge', 'neutral'];
        this.factionTabs.forEach((tab, i) => this.paintFilterTab(tab, this.currentFactionFilter === factions[i], stitchedDeck ? 66 : 74, stitchedDeck ? 22 : 24, stitchedDeck ? 9 : 10));

        const categories: (UnitCategory | 'all')[] = ['all', 'tank', 'magic', 'assassin', 'dealer', 'summon', 'terror'];
        this.categoryTabs.forEach((tab, i) => this.paintFilterTab(tab, this.currentCategoryFilter === categories[i], stitchedDeck ? 40 : 46, stitchedDeck ? 17 : 18, stitchedDeck ? 7 : 8));
    }

    private createFilterTab(x: number, y: number, w: number, h: number, label: string, active: boolean, onClick: () => void, fontSize = 10) {
        const container = this.add.container(x, y);
        this.paintFilterTab(container, active, w, h, fontSize, label);
        container.setSize(w, h);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerdown', onClick);
        return container;
    }

    private paintFilterTab(container: Phaser.GameObjects.Container, active: boolean, w: number, h: number, fontSize: number, label?: string) {
        const existingLabel = container.getByName('label') as Phaser.GameObjects.Text | undefined;
        const text = label ?? existingLabel?.text ?? '';
        container.removeAll(true);
        container.add(this.roundedRect(-w / 2, -h / 2, w, h, 6, active ? 0x2f3a52 : 0x141b2b, 1, active ? 0xdce7ff : 0x52648f, active ? 0.95 : 0.74, active ? 1.5 : 1));
        if (active) container.add(this.roundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, 4, 2, 0xffffff, 0.09));
        const textObj = this.centerText(0, 0, text, fontSize, active ? '#dde1ff' : '#9facce');
        textObj.setName('label');
        container.add(textObj);
    }

    private onNavClick(key: string) {
        if (key === 'lobby') this.scene.start('lobby-scene');
        if (key === 'shop') this.scene.start('shop-scene');
        if (key === 'social') this.showMessage(ko.lobby.clanSoon);
    }

    private startBattle() {
        if (this.selectedDeck.length < 1) {
            this.showMessage(ko.deck.selectEight);
            return;
        }
        this.scene.start('main-scene', { deck: this.selectedDeck });
    }

    private showMessage(text: string) {
        const { width, height } = getLayout();
        const bg = addToastPanel(this, width / 2, height / 2, 224, 40).setDepth(1000);
        const msg = this.add.text(width / 2, height / 2, text, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
        }).setOrigin(0.5).setDepth(1001);
        this.tweens.add({
            targets: [bg, msg],
            alpha: 0,
            y: height / 2 - 46,
            duration: 1200,
            onComplete: () => {
                bg.destroy();
                msg.destroy();
            },
        });
    }

    private centerText(x: number, y: number, text: string, size: number, color: string, family = UI_FONT) {
        return this.add.text(x, y, text, {
            fontSize: `${size}px`,
            fontFamily: family,
            fontStyle: '800',
            color,
            stroke: '#000000',
            strokeThickness: size >= 13 ? 2 : 1,
        }).setOrigin(0.5).setResolution(2);
    }

    private roundedRect(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        fill: number,
        alpha = 1,
        stroke?: number,
        strokeAlpha = 1,
        strokeWidth = 1
    ) {
        const g = this.add.graphics();
        g.fillStyle(fill, alpha);
        g.fillRoundedRect(x, y, width, height, radius);
        if (stroke !== undefined) {
            g.lineStyle(strokeWidth, stroke, strokeAlpha);
            g.strokeRoundedRect(x, y, width, height, radius);
        }
        return g;
    }

    shutdown() {
        this.input.off('pointerdown');
        this.input.off('pointermove');
        this.input.off('pointerup');
        this.input.off('wheel');
        if (this.popupContainer) this.popupContainer.destroy();
    }
}
