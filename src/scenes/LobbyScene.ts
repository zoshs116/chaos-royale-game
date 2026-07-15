import Phaser from 'phaser';
import { configureLogicalCamera, getLayout } from '../core/Resolution';
import {
    addBottomNav,
    addButton,
    addCurrencyPill as addSkinCurrencyPill,
    addGameBackground,
    addHeaderBar,
    addNavIcon,
    addToastPanel,
    playScreenIntro,
    UI_FONT,
    TITLE_FONT,
} from '../ui/GameSkin';
import { createPortraitPanel } from '../ui/CardVisual';
import { ko } from '../i18n/ko';

interface PlayerData {
    name: string;
    level: number;
    trophies: number;
    gold: number;
    gems: number;
    wins: number;
    losses: number;
}

const DEFAULT_PLAYER: PlayerData = {
    name: ko.lobby.playerName,
    level: 12,
    trophies: 4580,
    gold: 12500,
    gems: 320,
    wins: 142,
    losses: 38,
};

export default class LobbyScene extends Phaser.Scene {
    private playerData: PlayerData;
    private dailyRewardClaimed = false;

    constructor() {
        super({ key: 'lobby-scene' });
        this.playerData = { ...DEFAULT_PLAYER };
    }

    create() {
        configureLogicalCamera(this);
        playScreenIntro(this);
        this.createBackground();
        this.createHeader();
        this.createPlayerPanel();
        this.createArenaPreview();
        this.createBattleButton();
        this.createDeckPreview();
        this.createDailyReward();
        this.createShortcuts();
        this.createBottomNav();
    }

    private createBackground() {
        const { width, height } = getLayout();
        addGameBackground(this, width, height);

        const rng = new Phaser.Math.RandomDataGenerator(['lobby-stars']);
        for (let i = 0; i < 28; i++) {
            this.add.circle(
                rng.between(14, width - 14),
                rng.between(70, height - 95),
                rng.realInRange(0.8, 1.8),
                0xdde8ff,
                rng.realInRange(0.08, 0.28)
            );
        }
    }

    private createHeader() {
        const { width } = getLayout();

        if (this.textures.exists('lobby_ko_header_bar_no_logo')) {
            this.add.image(width / 2, 41, 'lobby_ko_header_bar_no_logo').setDisplaySize(344, 42).setDepth(2);
            this.add.text(219, 39, this.formatNumber(this.playerData.gold), {
                fontSize: '10px',
                fontFamily: UI_FONT,
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#001124',
                strokeThickness: 2,
            }).setOrigin(0.5).setResolution(2).setDepth(3);
            this.add.text(317, 39, String(this.playerData.gems), {
                fontSize: '10px',
                fontFamily: UI_FONT,
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#1a0030',
                strokeThickness: 2,
            }).setOrigin(0.5).setResolution(2).setDepth(3);
            return;
        }

        if (this.textures.exists('lobby_ko_header_bar')) {
            this.add.image(width / 2, 41, 'lobby_ko_header_bar').setDisplaySize(344, 42).setDepth(2);
            this.add.text(219, 39, this.formatNumber(this.playerData.gold), {
                fontSize: '10px',
                fontFamily: UI_FONT,
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#001124',
                strokeThickness: 2,
            }).setOrigin(0.5).setResolution(2).setDepth(3);
            this.add.text(317, 39, String(this.playerData.gems), {
                fontSize: '10px',
                fontFamily: UI_FONT,
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#1a0030',
                strokeThickness: 2,
            }).setOrigin(0.5).setResolution(2).setDepth(3);
            return;
        }

        addHeaderBar(this, width, 64);

        this.add.text(16, 39, ko.common.gameTitle, {
            fontSize: '12px',
            fontFamily: TITLE_FONT,
            fontStyle: '900',
            color: '#edf3ff',
            stroke: '#02050d',
            strokeThickness: 2,
        }).setOrigin(0, 0.5);

        this.roundedRect(222, 22, 132, 27, 9, 0x07101f, 0.72, 0x31405d, 0.88, 1);
        addSkinCurrencyPill(this, 269, 35, this.formatNumber(this.playerData.gold), 'ui_coin', 0xd6a626, 58, 26);
        addSkinCurrencyPill(this, 329, 35, String(this.playerData.gems), 'ui_gem', 0xc75cff, 52, 26);
    }

    private createPlayerPanel() {
        const { width } = getLayout();
        const panel = this.add.container(width / 2, 101);

        if (this.textures.exists('lobby_ko_profile_panel')) {
            panel.add(this.add.image(0, 0, 'lobby_ko_profile_panel').setDisplaySize(332, 72));
        } else {
            panel.add(this.softPanel(-166, -36, 332, 72, 10, 0x141b2b, 0x52648f));
        }

        const avatarUnit = this.textures.exists('portrait_lucifer') ? 'lucifer' : 'maiev';
        const avatar = createPortraitPanel(this, avatarUnit, -116, -2, 46, 46, 0xfbabff);
        panel.add(avatar.container);

        if (!this.textures.exists('lobby_ko_profile_panel')) {
            const levelBg = this.roundedRect(-133, 16, 34, 16, 4, 0x1e40af, 1, 0xb8c4ff, 0.8, 1);
            panel.add(levelBg);
        }
        panel.add(this.centerText(-116, 20, `${this.playerData.level}`, 8, '#ffffff'));

        panel.add(this.leftText(-58, -14, this.playerData.name, 13, '#eaf2ff', TITLE_FONT));
        panel.add(this.leftText(-58, 15, ko.lobby.winsLosses(this.playerData.wins, this.playerData.losses), 8, '#b9c8ee'));

        const usesProfileArt = this.textures.exists('lobby_ko_profile_panel');
        if (!usesProfileArt) {
            const trophy = this.roundedRect(76, -22, 76, 24, 7, 0x101725, 0.95, 0x7f9cff, 0.85, 1);
            panel.add(trophy);
        }
        if (usesProfileArt) {
            panel.add(this.centerText(70, -10, String(this.playerData.trophies), 11, '#dce7ff'));
        } else if (this.textures.exists('ui_trophy')) {
            const trophyIcon = this.add.image(88, -3, 'ui_trophy').setDisplaySize(18, 18);
            panel.add(trophyIcon);
            panel.add(this.leftText(104, -3, String(this.playerData.trophies), 11, '#dce7ff'));
        } else {
            panel.add(this.centerText(114, -3, `T ${this.playerData.trophies}`, 11, '#dce7ff'));
        }

    }

    private createArenaPreview() {
        const { width } = getLayout();
        const x = width / 2;
        const y = 202;

        this.roundedRect(x - 166, y - 66, 332, 132, 10, 0x0b1020, 1, 0x86a2ff, 0.78, 2);

        if (this.textures.exists('battle_arena_royal_valley')) {
            const arena = this.add.image(x, y + 114, 'battle_arena_royal_valley');
            arena.setDisplaySize(332, 594);
            const maskShape = this.add.graphics();
            maskShape.fillStyle(0xffffff, 1);
            maskShape.fillRoundedRect(x - 166, y - 66, 332, 132, 10);
            maskShape.setVisible(false);
            arena.setMask(maskShape.createGeometryMask());
        } else {
            const fallback = this.add.graphics();
            fallback.fillGradientStyle(0x6e2d22, 0x6e2d22, 0x174d59, 0x174d59, 1);
            fallback.fillRect(x - 166, y - 66, 332, 132);
        }

        const shade = this.add.rectangle(x, y + 35, 332, 62, 0x07101f, 0.42);
        shade.setOrigin(0.5);

        this.add.text(30, y + 16, ko.lobby.currentArena, {
            fontSize: '9px',
            fontFamily: UI_FONT,
            fontStyle: '700',
            color: '#b8c4ff',
            stroke: '#000000',
            strokeThickness: 2,
        });
        this.add.text(30, y + 28, ko.lobby.arenaName, {
            fontSize: '17px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#07101f',
            strokeThickness: 3,
        });
        this.add.text(30, y + 49, ko.lobby.arenaLevel, {
            fontSize: '10px',
            fontFamily: UI_FONT,
            fontStyle: '700',
            color: '#d7def8',
        });

        const info = this.add.circle(width - 36, y + 44, 15, 0x1b2437, 0.9);
        info.setStrokeStyle(1, 0xcbd8ff, 0.7);
        this.add.text(width - 36, y + 44, 'i', {
            fontSize: '14px',
            fontFamily: TITLE_FONT,
            fontStyle: '700',
            color: '#ffffff',
        }).setOrigin(0.5).setResolution(2);
    }

    private createBattleButton() {
        const { width } = getLayout();
        if (this.textures.exists('lobby_ko_battle_button_normal')) {
            const button = this.add.image(width / 2, 309, 'lobby_ko_battle_button_normal').setDisplaySize(184, 51);
            button.setInteractive({ useHandCursor: true });
            button.on('pointerdown', () => {
                button.setAlpha(0.88);
                this.time.delayedCall(80, () => this.startBattle());
            });
            button.on('pointerup', () => button.setAlpha(1));
            button.on('pointerout', () => button.setAlpha(1));
            return;
        }
        addButton(this, width / 2, 311, 260, 58, ko.common.battle, 'primary', () => this.startBattle(), 20, {
            labelY: 5,
        });
    }

    private createDeckPreview() {
        const { width } = getLayout();
        const panel = this.add.container(width / 2, 409);

        const usesDeckArt = this.textures.exists('lobby_ko_deck_panel');
        if (usesDeckArt) {
            panel.add(this.add.image(0, 0, 'lobby_ko_deck_panel').setDisplaySize(292, 124));
        } else {
            panel.add(this.softPanel(-166, -41, 332, 82, 10, 0x111827, 0x46577e));
            panel.add(this.leftText(-156, -30, ko.lobby.currentDeck, 10, '#91a0c7'));
            const edit = this.leftText(108, -30, ko.lobby.editAll, 10, '#b8c4ff');
            panel.add(edit);
        }

        const cards = ['obli', 'froad', 'maiev'];
        for (let i = 0; i < 4; i++) {
            const x = usesDeckArt ? -96 + i * 63 : -114 + i * 76;
            const slotY = usesDeckArt ? 4 : 12;
            const slotSize = usesDeckArt ? 45 : 54;
            const slot = this.roundedRect(x - slotSize / 2, slotY - slotSize / 2, slotSize, slotSize, 8, 0x090d17, 1, i < 3 ? 0x596b9a : 0x444653, i < 3 ? 0.9 : 0.65, 2);
            panel.add(slot);

            if (i < 3) {
                const portrait = createPortraitPanel(this, cards[i], x, slotY, usesDeckArt ? 40 : 48, usesDeckArt ? 40 : 48, 0xb8c4ff);
                panel.add(portrait.container);
            } else {
                panel.add(this.centerText(x, slotY, '+', usesDeckArt ? 20 : 22, '#8794bc'));
            }
        }
    }

    private createDailyReward() {
        const { width } = getLayout();
        const panel = this.add.container(width / 2, 518);

        if (this.textures.exists('lobby_ko_daily_bonus_panel')) {
            panel.add(this.add.image(0, 0, 'lobby_ko_daily_bonus_panel').setDisplaySize(304, 68));
            const claimZone = this.add.zone(106, 0, 84, 30);
            claimZone.setInteractive({ useHandCursor: true });
            claimZone.on('pointerdown', () => this.claimDailyReward());
            panel.add(claimZone);
            return;
        }

        panel.add(this.softPanel(-166, -29, 332, 58, 10, 0x141b2b, 0xba19d4, 0.56));
        const accent = this.roundedRect(-166, -29, 5, 58, 4, 0xba19d4, 1);
        panel.add(accent);

        const chest = this.roundedRect(-157, -19, 38, 38, 9, 0x232a3a, 1, 0xfbabff, 0.9, 1);
        panel.add(chest);
        if (this.textures.exists('ui_chest')) {
            panel.add(this.add.image(-138, -1, 'ui_chest').setDisplaySize(31, 31));
        } else {
            panel.add(this.centerText(-138, -1, '[]', 12, '#fbabff'));
        }

        panel.add(this.leftText(-108, -10, ko.lobby.dailyBonus, 11, '#ffffff'));
        panel.add(this.leftText(-108, 9, this.dailyRewardClaimed ? ko.lobby.alreadyClaimed : ko.lobby.rareChestReady, 10, '#fbabff'));

        const claim = addButton(
            this,
            116,
            0,
            76,
            30,
            this.dailyRewardClaimed ? ko.common.done : ko.common.claim,
            this.dailyRewardClaimed ? 'dark' : 'purple',
            () => this.claimDailyReward(),
            10,
            { labelY: 0 }
        );
        panel.add(claim);
    }

    private createShortcuts() {
        const items = [
            { key: 'shop', label: ko.common.shop, icon: '$' },
            { key: 'deck', label: ko.common.deck, icon: '#' },
            { key: 'collection', label: ko.common.cards, icon: 'C' },
            { key: 'clan', label: ko.common.clan, icon: '@' },
        ];

        items.forEach((item, index) => {
            const x = index % 2 === 0 ? 96 : 264;
            const y = index < 2 ? 584 : 644;
            this.createShortcutButton(x, y, item.label, item.icon, () => this.onMenuClick(item.key));
        });
    }

    private createBottomNav() {
        addBottomNav(this, 'lobby', (key) => this.onNavClick(key));
    }

    private createShortcutButton(x: number, y: number, label: string, icon: string, onClick: () => void) {
        const container = this.add.container(x, y);
        const keyByLabel: Record<string, string> = {
            [ko.common.shop]: 'lobby_ko_shortcut_shop',
            [ko.common.deck]: 'lobby_ko_shortcut_deck',
            [ko.common.cards]: 'lobby_ko_shortcut_cards',
            [ko.common.clan]: 'lobby_ko_shortcut_clan',
        };
        const assetKey = keyByLabel[label];
        if (assetKey && this.textures.exists(assetKey)) {
            container.add(this.add.image(0, 0, assetKey).setDisplaySize(134, 50));
            container.setSize(134, 50);
            container.setInteractive({ useHandCursor: true });
            container.on('pointerover', () => container.setScale(1.025));
            container.on('pointerout', () => container.setScale(1));
            container.on('pointerdown', () => {
                container.setScale(0.97);
                this.time.delayedCall(80, () => container.setScale(1));
                onClick();
            });
            return;
        }
        const shadow = this.roundedRect(-76 + 2, -19 + 4, 152, 38, 9, 0x000000, 0.28);
        const bg = this.roundedRect(-76, -19, 152, 38, 9, 0x111827, 0.99, 0x6273ac, 0.82, 1.5);
        const shine = this.roundedRect(-68, -14, 136, 6, 3, 0xffffff, 0.09);
        container.add([shadow, bg, shine]);
        container.add(addNavIcon(this, icon === '$' ? 'shop' : icon === '#' ? 'deck' : icon === '@' ? 'social' : 'deck', -48, 1, 0xb8c4ff));
        container.add(this.leftText(-22, 0, label, 11, '#edf3ff'));
        container.setSize(152, 38);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerover', () => container.setScale(1.025));
        container.on('pointerout', () => container.setScale(1));
        container.on('pointerdown', () => {
            container.setScale(0.97);
            this.time.delayedCall(80, () => container.setScale(1));
            onClick();
        });
    }

    private onMenuClick(key: string) {
        switch (key) {
            case 'shop':
                this.scene.start('shop-scene');
                break;
            case 'deck':
                this.scene.start('deck-scene');
                break;
            case 'collection':
                this.showMessage(ko.lobby.cardCollectionSoon);
                break;
            case 'clan':
                this.showMessage(ko.lobby.clanSoon);
                break;
        }
    }

    private onNavClick(key: string) {
        switch (key) {
            case 'shop':
                this.scene.start('shop-scene');
                break;
            case 'deck':
                this.scene.start('deck-scene');
                break;
            case 'social':
                this.showMessage(ko.lobby.clanSoon);
                break;
        }
    }

    private claimDailyReward() {
        if (this.dailyRewardClaimed) return;
        this.playerData.gold += 100;
        this.playerData.gems += 5;
        this.dailyRewardClaimed = true;
        this.showMessage(ko.lobby.rewardToast);
        this.scene.restart();
    }

    private startBattle() {
        this.scene.start('main-scene');
    }

    private showMessage(text: string) {
        const { width, height } = getLayout();
        const bg = addToastPanel(this, width / 2, height / 2, 250, 42).setDepth(1000);
        const msg = this.add.text(width / 2, height / 2, text, {
            fontSize: '13px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
        }).setOrigin(0.5).setDepth(1001);

        this.tweens.add({
            targets: [bg, msg],
            alpha: 0,
            y: height / 2 - 45,
            duration: 1400,
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
            fontStyle: '900',
            color,
            stroke: '#000000',
            strokeThickness: size >= 14 ? 2 : 1,
        }).setOrigin(0.5).setResolution(2);
    }

    private leftText(x: number, y: number, text: string, size: number, color: string, family = UI_FONT) {
        return this.add.text(x, y, text, {
            fontSize: `${size}px`,
            fontFamily: family,
            fontStyle: '700',
            color,
            stroke: '#000000',
            strokeThickness: size >= 14 ? 2 : 1,
        }).setOrigin(0, 0.5).setResolution(2);
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

    private softPanel(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        fill: number,
        stroke: number,
        strokeAlpha = 0.82
    ) {
        const c = this.add.container(0, 0);
        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.42);
        shadow.fillRoundedRect(x + 3, y + 5, width, height, radius);
        c.add(shadow);

        const base = this.add.graphics();
        base.fillGradientStyle(fill + 0x050607, fill + 0x050607, fill, Math.max(0, fill - 0x050607), 0.97);
        base.fillRoundedRect(x, y, width, height, radius);
        base.lineStyle(1.8, stroke, Math.min(1, strokeAlpha + 0.08));
        base.strokeRoundedRect(x, y, width, height, radius);
        base.lineStyle(1, 0xffffff, 0.08);
        base.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, Math.max(4, radius - 3));
        base.fillStyle(0xffffff, 0.07);
        base.fillRoundedRect(x + 9, y + 8, width - 18, Math.min(8, height / 5), 4);
        c.add(base);
        return c;
    }
}
