import Phaser from 'phaser';
import { configureLogicalCamera, getLayout, getPointerLogicalPosition } from '../core/Resolution';
import { UNIT_TYPES, UNIT_FACTIONS, CATEGORY_COLORS, FACTION_COLORS } from '../data/UnitData';
import type { Faction, UnitCategory } from '../data/UnitData';
import { addBottomNav, addButton, addGameBackground, addHeaderBar, addToastPanel, playScreenIntro, UI_FONT, TITLE_FONT } from '../ui/GameSkin';
import { ko, unitName } from '../i18n/ko';
import {
    cardFrameKey as getCardFrameKey,
    createCostBadge,
    createFactionBadge,
    createNameplate,
    createPortraitPanel,
} from '../ui/CardVisual';

interface ShopItem {
    unitKey: string;
    price: number;
    currency: 'gold' | 'gems';
    discount?: number;
    isNew?: boolean;
}

interface ChestPack {
    name: string;
    subtitle: string;
    price: number;
    currency: 'gold' | 'gems';
    tint: number;
    accent: number;
}

interface PlayerResources {
    gold: number;
    gems: number;
}

const SHOP_HEADER_HEIGHT = 64;
const SHOP_NAV_SAFE_TOP = 704;
const SHOP_SCROLL_HEIGHT = SHOP_NAV_SAFE_TOP - SHOP_HEADER_HEIGHT;
const SHOP_BOTTOM_PADDING = 112;

export default class ShopScene extends Phaser.Scene {
    private resources: PlayerResources = { gold: 12500, gems: 320 };
    private dailyDeals: ShopItem[] = [];
    private featuredItems: ShopItem[] = [];
    private chestPacks: ChestPack[] = [];
    private scrollContainer!: Phaser.GameObjects.Container;
    private scrollY = 0;
    private maxScrollY = 0;
    private isDragging = false;
    private dragStartY = 0;
    private dragStartScrollY = 0;
    private goldText!: Phaser.GameObjects.Text;
    private gemText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'shop-scene' });
    }

    create() {
        configureLogicalCamera(this);
        playScreenIntro(this);
        this.resetInput();
        this.createBackground();
        this.generateShopItems();
        this.createHeader();
        this.createScrollArea();
        this.createContent();
        this.setupScrolling();
        this.createBottomNav();
    }

    private resetInput() {
        this.input.off('pointerdown');
        this.input.off('pointermove');
        this.input.off('pointerup');
        this.input.off('wheel');
        this.scrollY = 0;
        this.maxScrollY = 0;
        this.isDragging = false;
    }

    private createBackground() {
        const { width, height } = getLayout();
        addGameBackground(this, width, height);
    }

    private generateShopItems() {
        const units = Object.keys(UNIT_TYPES).filter((key) => UNIT_FACTIONS[key] && !UNIT_FACTIONS[key].isHidden);
        const preferredDaily = ['stone_cold', 'lucifer', 'obli', 'darae', 'grommash', 'nipi'];
        const preferredFeatured = ['medusa', 'maiev', 'agamemnon', 'akasha'];

        this.dailyDeals = preferredDaily
            .filter((key) => UNIT_TYPES[key])
            .map((key, i) => ({
                unitKey: key,
                price: [450, 400, 500, 480, 650, 520][i],
                currency: 'gold' as const,
                discount: i < 2 ? 20 : undefined,
            }));

        if (this.dailyDeals.length < 6) {
            for (const key of units) {
                if (this.dailyDeals.some((item) => item.unitKey === key)) continue;
                this.dailyDeals.push({ unitKey: key, price: 500 + this.dailyDeals.length * 80, currency: 'gold' });
                if (this.dailyDeals.length === 6) break;
            }
        }

        this.featuredItems = preferredFeatured
            .filter((key) => UNIT_TYPES[key])
            .map((key, i) => ({
                unitKey: key,
                price: [250, 350, 500, 650][i],
                currency: 'gems' as const,
                isNew: i < 2,
            }));

        this.chestPacks = [
            { name: ko.shop.silverPack, subtitle: ko.shop.silverSubtitle, price: 500, currency: 'gold', tint: 0x8ca0bd, accent: 0xb8c4ff },
            { name: ko.shop.goldPack, subtitle: ko.shop.goldSubtitle, price: 1500, currency: 'gold', tint: 0xd6a626, accent: 0xffd66b },
            { name: ko.shop.magicalPack, subtitle: ko.shop.magicalSubtitle, price: 250, currency: 'gems', tint: 0x9b18ba, accent: 0xfbabff },
            { name: ko.shop.chaosPack, subtitle: ko.shop.chaosSubtitle, price: 500, currency: 'gems', tint: 0x93000a, accent: 0xffb4ac },
        ];
    }

    private createHeader() {
        const { width } = getLayout();
        addHeaderBar(this, width, 64);

        const back = this.add.container(26, 32);
        back.add(this.roundedRect(-18, -18, 36, 36, 9, 0x141b2b, 1, 0x6273ac, 0.86, 1.5));
        back.add(this.centerText(0, -1, '<', 20, '#dce7ff'));
        back.setSize(36, 36);
        back.setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('lobby-scene'));

        this.add.text(54, 37, ko.shop.title, {
            fontSize: '16px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#edf3ff',
            stroke: '#02050d',
            strokeThickness: 2,
        }).setOrigin(0, 0.5);

        this.roundedRect(224, 23, 124, 25, 8, 0x07101f, 0.78, 0x31405d, 0.78, 1);
        this.createCurrencyPill(268, 35, 'gold', 58, 24);
        this.createCurrencyPill(328, 35, 'gems', 48, 24);
    }

    private createScrollArea() {
        const { width } = getLayout();
        const startY = SHOP_HEADER_HEIGHT;
        this.scrollContainer = this.add.container(0, startY);

        const maskShape = this.make.graphics({});
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(0, startY, width, SHOP_SCROLL_HEIGHT);
        const mask = maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);

        const topFade = this.add.graphics();
        topFade.fillGradientStyle(0x06101e, 0x06101e, 0x06101e, 0x06101e, 0.82, 0.82, 0, 0);
        topFade.fillRect(0, startY, width, 18);
        topFade.setDepth(20);

        const bottomFade = this.add.graphics();
        bottomFade.fillGradientStyle(0x06101e, 0x06101e, 0x06101e, 0x06101e, 0, 0, 0.9, 0.9);
        bottomFade.fillRect(0, SHOP_NAV_SAFE_TOP - 34, width, 34);
        bottomFade.setDepth(20);
    }

    private createContent() {
        let y = 26;
        y = this.createSectionHeader(y, ko.shop.dailyDeals, 0xb8c4ff, ko.shop.refresh);
        y = this.createDailyDeals(y);
        y += 34;
        y = this.createSectionHeader(y, ko.shop.featuredUnits, 0xfbabff);
        y = this.createFeaturedItems(y);
        y += 34;
        y = this.createSectionHeader(y, ko.shop.chestShop, 0xb8c4ff);
        y = this.createChestShop(y);
        y += SHOP_BOTTOM_PADDING;
        this.maxScrollY = Math.max(0, y - SHOP_SCROLL_HEIGHT);
    }

    private createSectionHeader(y: number, title: string, color: number, rightLabel?: string) {
        const c = this.add.container(0, y);
        const accent = this.add.rectangle(22, 0, 5, 26, color, 1);
        c.add(accent);
        const titleText = this.leftText(35, 0, title, 19, this.colorToHex(color), TITLE_FONT);
        titleText.setStroke('#000000', 3);
        c.add(titleText);
        if (rightLabel) {
            c.add(this.centerText(292, 0, rightLabel, 9, '#9facce'));
        }
        this.scrollContainer.add(c);
        return y + 34;
    }

    private createDailyDeals(y: number) {
        const cardW = 152;
        const cardH = 152;
        this.dailyDeals.forEach((item, i) => {
            const x = i % 2 === 0 ? 94 : 266;
            const row = Math.floor(i / 2);
            const card = this.createUnitShopCard(item, x, y + row * (cardH + 12) + cardH / 2, cardW, cardH, false);
            this.scrollContainer.add(card);
        });
        return y + Math.ceil(this.dailyDeals.length / 2) * (cardH + 12);
    }

    private createFeaturedItems(y: number) {
        const cardW = 152;
        const cardH = 160;
        this.featuredItems.forEach((item, i) => {
            const x = i % 2 === 0 ? 94 : 266;
            const row = Math.floor(i / 2);
            const card = this.createUnitShopCard(item, x, y + row * (cardH + 12) + cardH / 2, cardW, cardH, true);
            this.scrollContainer.add(card);
        });
        return y + Math.ceil(this.featuredItems.length / 2) * (cardH + 12);
    }

    private createChestShop(y: number) {
        this.chestPacks.forEach((pack, i) => {
            const card = this.createChestCard(pack, 180, y + i * 82 + 36);
            this.scrollContainer.add(card);
        });
        return y + this.chestPacks.length * 82;
    }

    private createUnitShopCard(item: ShopItem, x: number, y: number, width: number, height: number, featured: boolean) {
        const container = this.add.container(x, y);
        const factionData = UNIT_FACTIONS[item.unitKey] || { faction: 'neutral' as Faction, category: 'dealer' as UnitCategory };
        const factionColor = FACTION_COLORS[factionData.faction];
        const categoryColor = CATEGORY_COLORS[factionData.category];

        const frameKey = featured ? 'ui_asset_card_purple' : getCardFrameKey(factionData.faction);
        if (this.textures.exists(frameKey)) {
            const frame = this.add.nineslice(0, 0, frameKey, undefined, width, height, 22, 22, 24, 24);
            container.add(frame);
        } else {
            container.add(this.roundedRect(-width / 2, -height / 2, width, height, 12, featured ? 0x1b2233 : 0x141b2b, 0.98, featured ? 0xfbabff : categoryColor, featured ? 0.7 : 0.85, 1.5));
        }

        const contentOffset = this.getShopCardContentOffset(item.unitKey, featured);
        const portrait = createPortraitPanel(this, item.unitKey, contentOffset.x, -height / 2 + 48 + contentOffset.y, 92, 72, featured ? 0xfbabff : factionColor);
        container.add(portrait.container);
        container.add(createFactionBadge(this, -width / 2 + 19 + contentOffset.x, -height / 2 + 20 + contentOffset.y, factionData.faction, 18));

        if (item.discount) {
            container.add(this.roundedRect(width / 2 - 50, -height / 2 + 10, 42, 18, 5, 0x93000a, 1, 0xffb4ac, 0.45, 1));
            container.add(this.centerText(width / 2 - 29, -height / 2 + 19, ko.shop.discount, 9, '#ffffff'));
        }
        const labelY = featured ? height / 2 - 69 : height / 2 - 70;
        const priceY = featured ? height / 2 - 50 : height / 2 - 54;
        const buttonCenterY = featured ? height / 2 - 29 : height / 2 - 29;

        if (item.isNew) {
            container.add(this.roundedRect(width / 2 - 42 + contentOffset.x, -height / 2 + 10 + contentOffset.y, 34, 18, 5, 0x921517, 1, 0xffb4ac, 0.45, 1));
            container.add(this.centerText(width / 2 - 25 + contentOffset.x, -height / 2 + 19 + contentOffset.y, ko.shop.new, 9, '#ffffff'));
        }

        const nameplate = createNameplate(this, contentOffset.x, labelY + contentOffset.y, width - 26, item.unitKey, 10, featured ? '#fbabff' : '#edf3ff');
        container.add(nameplate.container);
        const displayPrice = item.discount ? Math.floor(item.price * (1 - item.discount / 100)) : item.price;
        container.add(this.centerText(8 + contentOffset.x, priceY + contentOffset.y, `${displayPrice}`, 13, item.currency === 'gold' ? '#ffd66b' : '#fbabff', TITLE_FONT));
        const currency = createCostBadge(this, -26 + contentOffset.x, priceY + contentOffset.y, item.currency === 'gold' ? 0 : 1, 14);
        currency.text.setText(item.currency === 'gold' ? 'G' : 'D');
        currency.bg.setFillStyle(item.currency === 'gold' ? 0xd6a626 : 0xc75cff);
        container.add(currency.container);

        const buy = addButton(this, contentOffset.x, buttonCenterY + contentOffset.y, width - 30, 26, ko.common.buy, 'green', () => this.buyCard(item, container.x, container.y), 10, {
            labelY: 0,
        });
        container.add(buy);

        container.setSize(width, height);
        return container;
    }

    private getShopCardContentOffset(unitKey: string, featured = false) {
        if (featured) return { x: -16, y: -5 };
        if (unitKey === 'darae' || unitKey === 'nipi') return { x: 0, y: 0 };
        if (unitKey === 'stone_cold' || unitKey === 'lucifer' || unitKey === 'obli' || unitKey === 'grommash') return { x: -2, y: -5 };
        return { x: 0, y: 0 };
    }

    private createChestCard(pack: ChestPack, x: number, y: number) {
        const container = this.add.container(x, y);
        container.add(this.roundedRect(-164, -34, 328, 72, 12, 0x141b2b, 0.99, pack.accent, 0.58, 1.5));
        container.add(this.roundedRect(-154, -26, 308, 6, 3, 0xffffff, 0.055));

        container.add(this.createPackIcon(-124, 0, pack));

        container.add(this.leftText(-88, -12, pack.name, 14, this.colorToHex(pack.accent), TITLE_FONT));
        container.add(this.leftText(-88, 10, pack.subtitle, 10, '#9facce'));

        const buy = addButton(this, 112, 0, 82, 36, String(pack.price), pack.currency === 'gold' ? 'primary' : 'purple', () => this.buyChest(pack), 11, {
            labelY: 0,
        });
        container.add(buy);
        container.add(this.currencyDot(140, 0, pack.currency));

        container.setSize(328, 72);
        return container;
    }

    private setupScrolling() {
        const startY = SHOP_HEADER_HEIGHT;
        const endY = SHOP_NAV_SAFE_TOP;
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const p = getPointerLogicalPosition(pointer);
            if (p.y >= startY && p.y <= endY) {
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
            this.scrollContainer.y = startY - this.scrollY;
        });

        this.input.on('pointerup', () => {
            this.isDragging = false;
        });

        this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
            this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.45, 0, this.maxScrollY);
            this.scrollContainer.y = startY - this.scrollY;
        });
    }

    private createBottomNav() {
        addBottomNav(this, 'shop', (key) => this.onNavClick(key));
    }

    private createCurrencyPill(x: number, y: number, type: 'gold' | 'gems', width = 72, height = 28) {
        const color = type === 'gold' ? 0xd6a626 : 0xc75cff;
        const value = type === 'gold' ? this.formatNumber(this.resources.gold) : String(this.resources.gems);
        this.roundedRect(x - width / 2, y - height / 2, width, height, 8, 0x101725, 0.99, color, 0.76, 1.25);
        this.roundedRect(x - width / 2 + 6, y - height / 2 + 4, width - 12, 4, 2, 0xffffff, 0.07);
        const iconKey = type === 'gold' ? 'ui_coin' : 'ui_gem';
        if (this.textures.exists(iconKey)) {
            this.add.image(x - width / 2 + 11, y, iconKey).setDisplaySize(14, 14);
        } else {
            this.add.circle(x - width / 2 + 11, y, 6, color, 1);
        }
        const text = this.add.text(x - width / 2 + 23, y, value, {
            fontSize: '8px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
        }).setOrigin(0, 0.5);
        if (type === 'gold') this.goldText = text;
        else this.gemText = text;
    }

    private currencyDot(x: number, y: number, type: 'gold' | 'gems') {
        const iconKey = type === 'gold' ? 'ui_coin' : 'ui_gem';
        if (this.textures.exists(iconKey)) {
            return this.add.image(x, y, iconKey).setDisplaySize(13, 13);
        }
        const c = this.add.circle(x, y, 5, type === 'gold' ? 0xd6a626 : 0xc75cff, 1);
        c.setStrokeStyle(1, 0xffffff, 0.18);
        return c;
    }

    private createPackIcon(x: number, y: number, pack: ChestPack) {
        const c = this.add.container(x, y);
        const glow = this.add.circle(0, 2, 25, pack.accent, 0.14);
        const back = this.roundedRect(-28, -25, 56, 50, 11, 0x060b14, 0.96, pack.accent, 0.58, 1.5);
        const inner = this.roundedRect(-22, -20, 44, 40, 8, 0x121a2b, 0.98, 0xdce7ff, 0.18, 1);
        const body = this.roundedRect(-18, -10, 36, 25, 6, pack.tint, 0.98, pack.accent, 0.95, 1.5);
        const lid = this.roundedRect(-20, -18, 40, 14, 6, 0x26314a, 0.98, pack.accent, 0.82, 1.3);
        const leftTrim = this.roundedRect(-21, -16, 5, 31, 2, 0xd6a626, 0.86, 0xfff0aa, 0.32, 1);
        const rightTrim = this.roundedRect(16, -16, 5, 31, 2, 0xd6a626, 0.86, 0xfff0aa, 0.32, 1);
        const band = this.roundedRect(-3, -20, 6, 36, 3, 0xffd66b, 0.96, 0xfff0aa, 0.42, 1);
        const shine = this.roundedRect(-14, -7, 28, 4, 2, 0xffffff, 0.17);
        const lock = this.roundedRect(-8, 4, 16, 12, 3, 0x0b1020, 0.94, 0xfff0aa, 0.58, 1);
        const gem = this.add.rectangle(0, 1, 8, 8, pack.accent, 1);
        gem.setAngle(45);
        gem.setStrokeStyle(1, 0xffffff, 0.32);
        const rivets = [
            this.add.circle(-20, -18, 2, pack.accent, 0.8),
            this.add.circle(20, -18, 2, pack.accent, 0.8),
            this.add.circle(-20, 18, 2, pack.accent, 0.62),
            this.add.circle(20, 18, 2, pack.accent, 0.62),
        ];
        c.add([glow, back, inner, body, lid, leftTrim, rightTrim, band, shine, lock, gem, ...rivets]);
        return c;
    }

    private buyCard(item: ShopItem, x?: number, y?: number) {
        const price = item.discount ? Math.floor(item.price * (1 - item.discount / 100)) : item.price;
        if (!this.spend(item.currency, price)) return;
        if (x !== undefined && y !== undefined) this.createPurchaseBurst(x, y);
        this.showMessage(ko.shop.purchased(unitName(item.unitKey)));
    }

    private buyChest(pack: ChestPack) {
        if (!this.spend(pack.currency, pack.price)) return;
        this.showMessage(ko.shop.packPurchased(pack.name));
    }

    private spend(currency: 'gold' | 'gems', price: number) {
        if (this.resources[currency] < price) {
            this.showMessage(ko.shop.insufficient);
            return false;
        }
        this.resources[currency] -= price;
        this.updateCurrencyDisplay();
        return true;
    }

    private updateCurrencyDisplay() {
        this.goldText?.setText(this.formatNumber(this.resources.gold));
        this.gemText?.setText(String(this.resources.gems));
        this.tweens.add({
            targets: [this.goldText, this.gemText].filter(Boolean),
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 90,
            yoyo: true,
            ease: 'Sine.easeOut',
        });
    }

    private createPurchaseBurst(x: number, y: number) {
        const burst = this.add.container(x, y).setDepth(1002);
        for (let i = 0; i < 8; i++) {
            const dot = this.add.circle(0, 0, 3, i % 2 === 0 ? 0x86efac : 0xffd83f, 1);
            burst.add(dot);
            const angle = (Math.PI * 2 * i) / 8;
            this.tweens.add({
                targets: dot,
                x: Math.cos(angle) * 42,
                y: Math.sin(angle) * 34,
                alpha: 0,
                duration: 420,
                ease: 'Cubic.easeOut',
            });
        }
        this.time.delayedCall(460, () => burst.destroy());
    }

    private onNavClick(key: string) {
        if (key === 'lobby') this.scene.start('lobby-scene');
        if (key === 'deck') this.scene.start('deck-scene');
        if (key === 'social') this.showMessage(ko.lobby.clanSoon);
    }

    private showMessage(text: string) {
        const { width, height } = getLayout();
        const bg = addToastPanel(this, width / 2, height / 2, 232, 40).setDepth(1000);
        const msg = this.add.text(width / 2, height / 2, text, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '800',
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

    private leftText(x: number, y: number, text: string, size: number, color: string, family = UI_FONT) {
        return this.add.text(x, y, text, {
            fontSize: `${size}px`,
            fontFamily: family,
            fontStyle: '800',
            color,
            stroke: '#000000',
            strokeThickness: size >= 14 ? 2 : 1,
        }).setOrigin(0, 0.5).setResolution(2);
    }

    private colorToHex(color: number) {
        return `#${color.toString(16).padStart(6, '0')}`;
    }

    private formatNumber(num: number): string {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return String(num);
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
    }
}
