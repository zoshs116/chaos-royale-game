import Phaser from 'phaser';
import { configureLogicalCamera, getLayout } from '../core/Resolution';
import { CONSTANTS } from '../systems/Constants';
import { playScreenIntro, UI_FONT, TITLE_FONT } from '../ui/GameSkin';
import { ko } from '../i18n/ko';

type ResultState = 'blue' | 'red' | 'draw';

export default class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'game-over' });
    }

    init(data: { winner?: ResultState, blueCrowns?: number, redCrowns?: number }) {
        this.data.set('winner', data.winner ?? 'blue');
        this.data.set('blueCrowns', data.blueCrowns ?? 2);
        this.data.set('redCrowns', data.redCrowns ?? 1);
    }

    create() {
        configureLogicalCamera(this);
        playScreenIntro(this);
        const winner = this.data.get('winner') as ResultState;
        const blueCrowns = this.data.get('blueCrowns') as number;
        const redCrowns = this.data.get('redCrowns') as number;

        this.createBackground();
        this.createTitle(winner);
        this.createResultPanel(winner, blueCrowns, redCrowns);
        this.createActionButtons();
        this.createIntroTween();
    }

    private createBackground() {
        const { width, height } = getLayout();
        this.add.rectangle(width / 2, height / 2, width, height, 0x070d18, 1);

        if (this.textures.exists('battle_arena_royal_valley')) {
            const bg = this.add.image(width / 2, height / 2, 'battle_arena_royal_valley');
            bg.setDisplaySize(width * 1.22, height * 1.22);
            bg.setAlpha(0.34);
            bg.setTint(0x8fa2c8);
        }

        const shade = this.add.graphics();
        shade.fillGradientStyle(0x030711, 0x030711, 0x07101f, 0x050912, 0.64, 0.64, 0.99, 1);
        shade.fillRect(0, 0, width, height);
    }

    private createTitle(winner: ResultState) {
        const isWin = winner === 'blue';
        const isLose = winner === 'red';
        const title = isWin ? ko.result.victory : isLose ? ko.result.defeat : ko.result.draw;
        const color = isWin ? '#ffdf3d' : isLose ? '#ff8b76' : '#dce7ff';

        const c = this.add.container(CONSTANTS.SCREEN_WIDTH / 2, 106).setName('intro');
        c.add(this.createResultBanner(title, isWin, isLose, color));
        c.add(this.centerText(0, 42, ko.result.battleResult, 11, '#b8c4ff', UI_FONT, 2));

        this.tweens.add({
            targets: c,
            y: 98,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private createResultPanel(winner: ResultState, blueCrowns: number, redCrowns: number) {
        const panel = this.add.container(CONSTANTS.SCREEN_WIDTH / 2, 338);
        panel.setName('intro');
        const frame = this.add.graphics();
        frame.fillStyle(0x000000, 0.46);
        frame.fillRoundedRect(-156, -158, 312, 342, 18);
        frame.fillGradientStyle(0x202a42, 0x202a42, 0x111827, 0x090e19, 0.98);
        frame.fillRoundedRect(-150, -166, 300, 332, 18);
        frame.lineStyle(3.5, 0x6273ac, 0.96);
        frame.strokeRoundedRect(-150, -166, 300, 332, 16);
        frame.lineStyle(1.5, 0xdce7ff, 0.24);
        frame.strokeRoundedRect(-138, -152, 276, 308, 12);
        frame.fillStyle(0xffffff, 0.075);
        frame.fillRoundedRect(-126, -144, 252, 12, 6);
        panel.add(frame);
        if (this.textures.exists('result_panel')) {
            panel.add(this.add.image(0, 48, 'result_panel').setDisplaySize(300, 164).setAlpha(0.98));
        }

        panel.add(this.createCrownScore(-86, -92, blueCrowns, 0xb8c4ff, winner === 'blue'));
        panel.add(this.centerText(0, -72, 'VS', 18, '#8e909f', TITLE_FONT, 2).setAlpha(0.72));
        panel.add(this.createCrownScore(86, -92, redCrowns, 0xffb4ac, winner === 'red', 6));

        const rewardBacking = this.add.graphics();
        rewardBacking.fillStyle(0x101827, 0.88);
        rewardBacking.fillRoundedRect(-118, 0, 236, 88, 10);
        rewardBacking.lineStyle(1.2, 0xdce7ff, 0.14);
        rewardBacking.strokeRoundedRect(-118, 0, 236, 88, 10);
        panel.add(rewardBacking);

        panel.add(this.createRewardCard(-84, 44, 'ui_coin', '+150', ko.result.gold, 0xffd83f));
        panel.add(this.createRewardCard(-2, 44, 'ui_gem', '+30', ko.result.gems, 0xff7cff));
        panel.add(this.createRewardCard(80, 44, 'trophy', '+12', ko.result.trophies, 0x4f7dff));

        const details = this.add.container(0, 132);
        const detailBg = this.add.graphics();
        detailBg.fillStyle(0x070d18, 0.64);
        detailBg.fillRoundedRect(-124, -29, 248, 58, 9);
        detailBg.lineStyle(1.2, 0xb8c4ff, 0.2);
        detailBg.strokeRoundedRect(-124, -29, 248, 58, 9);
        details.add(detailBg);
        details.add(this.leftText(-108, -16, ko.result.player, 8, '#8d98b6'));
        details.add(this.leftText(-108, 2, ko.result.opponent, 8, '#8d98b6'));
        details.add(this.leftText(-108, 20, ko.result.arena, 8, '#8d98b6'));
        details.add(this.add.text(108, -16, ko.lobby.playerName, this.textStyle(11, '#ffffff')).setOrigin(1, 0.5).setResolution(2));
        details.add(this.add.text(108, 2, winner === 'red' ? ko.result.scourgeWarlord : ko.result.sentinelGuard, this.textStyle(11, '#dce7ff')).setOrigin(1, 0.5).setResolution(2));
        details.add(this.add.text(108, 20, ko.lobby.arenaName, this.textStyle(11, '#b8c4ff')).setOrigin(1, 0.5).setResolution(2));
        panel.add(details);
    }

    private createCrownScore(x: number, y: number, crowns: number, color: number, active: boolean, crownOffsetY = 0) {
        const c = this.add.container(x, y);

        const crownKey = color === 0xffb4ac ? 'result_crown_red' : 'result_crown_blue';
        if (this.textures.exists(crownKey)) {
            c.add(this.add.image(0, -4 + crownOffsetY, crownKey).setDisplaySize(70, 55).setAlpha(active ? 1 : 0.68));
        } else {
            const crown = this.add.graphics();
            crown.fillStyle(color, active ? 1 : 0.58);
            crown.fillTriangle(-26, -9, -15, 20, -4, -9);
            crown.fillTriangle(-7, -9, 0, -27, 7, -9);
            crown.fillTriangle(4, -9, 15, 20, 26, -9);
            crown.fillRoundedRect(-25, 14, 50, 12, 3);
            c.add(crown);
        }
        c.add(this.centerText(0, 39, String(crowns), 34, active ? '#ffffff' : this.colorToHex(color), TITLE_FONT, 3));
        return c;
    }

    private createRewardCard(x: number, y: number, icon: string, value: string, label: string, color: number) {
        const card = this.add.container(x, y);
        const frameKey = icon === 'ui_coin' ? 'result_reward_gold' : icon === 'ui_gem' ? 'result_reward_purple' : 'result_reward_blue';
        const frameOffsetX = icon === 'ui_coin' ? -3 : icon === 'ui_gem' ? -4 : -5;
        const contentOffsetX = frameOffsetX + 5;
        const contentOffsetY = icon === 'ui_gem' ? 4 : 7;
        if (this.textures.exists(frameKey)) {
            card.add(this.add.image(frameOffsetX, 0, frameKey).setDisplaySize(70, 82));
        } else {
            const bg = this.add.graphics();
            bg.fillGradientStyle(0x2a3655, 0x2a3655, 0x141b2b, 0x0c1220, 0.98);
            bg.fillRoundedRect(-37, -43, 74, 86, 10);
            bg.lineStyle(1.8, 0xb8c4ff, 0.34);
            bg.strokeRoundedRect(-37, -43, 74, 86, 10);
            bg.fillStyle(0xffffff, 0.06);
            bg.fillRoundedRect(-29, -35, 58, 6, 3);
            card.add(bg);
        }

        const textureKey = icon === 'trophy' ? 'result_trophy' : icon === 'ui_coin' ? 'result_coin_pile' : icon === 'ui_gem' ? 'result_gem' : icon;
        if (this.textures.exists(textureKey)) {
            const image = this.add.image(contentOffsetX, -18 + contentOffsetY, textureKey).setDisplaySize(icon === 'ui_coin' ? 34 : 29, icon === 'ui_coin' ? 27 : 30);
            card.add(image);
        } else {
            const mark = this.add.graphics();
            mark.fillStyle(color, 1);
            mark.fillCircle(0, -20 + contentOffsetY, 15);
            card.add(mark);
            card.add(this.centerText(0, -20 + contentOffsetY, icon === 'ui_coin' ? 'G' : icon === 'ui_gem' ? 'D' : 'T', 11, '#ffffff', UI_FONT, 1));
        }

        card.add(this.centerText(contentOffsetX, 10 + contentOffsetY, value, 14, '#ffffff', UI_FONT, 2));
        card.add(this.centerText(contentOffsetX, 27 + contentOffsetY, label, 7, '#dce7ff', UI_FONT, 1));
        return card;
    }

    private createActionButtons() {
        const cx = CONSTANTS.SCREEN_WIDTH / 2;
        const hasStitchedButtons = this.textures.exists('battle_ko_button_battle_again') && this.textures.exists('battle_ko_button_lobby');
        const playKey = hasStitchedButtons ? 'battle_ko_button_battle_again' : 'result_button_play';
        const lobbyKey = hasStitchedButtons ? 'battle_ko_button_lobby' : 'result_button_lobby';
        const play = this.createImageButton(cx, 574, 250, 62, playKey, () => this.scene.start('main-scene'), hasStitchedButtons ? undefined : ko.result.playAgain);
        play.setName('intro');
        const lobby = this.createImageButton(cx, 656, 250, 56, lobbyKey, () => this.scene.start('lobby-scene'), hasStitchedButtons ? undefined : ko.result.backToLobby);
        lobby.setName('intro');
    }

    private createResultBanner(title: string, isWin: boolean, isLose: boolean, fallbackColor: string) {
        const c = this.add.container(0, -4);
        const imageKey = isWin
            ? 'battle_ko_result_victory_banner'
            : isLose
                ? 'battle_ko_result_defeat_banner'
                : 'battle_ko_result_blank_banner';
        if (this.textures.exists(imageKey)) {
            c.add(this.add.image(0, 0, imageKey).setDisplaySize(318, isLose ? 124 : 112));
            return c;
        }

        const main = isWin ? 0xf0bd18 : isLose ? 0x8f2638 : 0x52648f;
        const dark = isWin ? 0x8b5505 : isLose ? 0x45111b : 0x172033;
        const edge = isWin ? 0xffffcf : isLose ? 0xffa1aa : 0xdce7ff;

        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.36);
        shadow.fillRoundedRect(-132, -31, 264, 62, 16);
        const ribbon = this.add.graphics();
        ribbon.fillStyle(dark, 0.98);
        ribbon.fillTriangle(-156, -18, -118, -4, -156, 18);
        ribbon.fillTriangle(156, -18, 118, -4, 156, 18);
        ribbon.fillGradientStyle(edge, edge, main, dark, 1);
        ribbon.fillRoundedRect(-128, -29, 256, 58, 16);
        ribbon.lineStyle(3, edge, 0.92);
        ribbon.strokeRoundedRect(-128, -29, 256, 58, 16);
        ribbon.fillStyle(0xffffff, 0.22);
        ribbon.fillRoundedRect(-104, -22, 208, 9, 5);
        ribbon.lineStyle(1.5, dark, 0.42);
        ribbon.strokeRoundedRect(-112, -20, 224, 40, 10);

        c.add([shadow, ribbon]);
        c.add(this.centerText(0, -1, title, 36, isWin ? '#142152' : fallbackColor, TITLE_FONT, 4));
        return c;
    }

    private createImageButton(x: number, y: number, width: number, height: number, key: string, onClick: () => void, label?: string) {
        const button = this.add.container(x, y);
        if (label) {
            const isPlay = key.includes('play');
            const face = this.add.graphics();
            const top = isPlay ? 0xffff98 : 0x657083;
            const mid = isPlay ? 0xf0bd18 : 0x334052;
            const bottom = isPlay ? 0xa96505 : 0x141b2b;
            const edge = isPlay ? 0xffffd1 : 0xd0dae9;
            face.fillStyle(0x000000, 0.34);
            face.fillRoundedRect(-width / 2 + 3, -height / 2 + 8, width - 6, height, 12);
            face.fillGradientStyle(top, top, mid, bottom, 1);
            face.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
            face.lineStyle(3, edge, 0.9);
            face.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
            face.fillStyle(0xffffff, 0.18);
            face.fillRoundedRect(-width / 2 + 18, -height / 2 + 10, width - 36, 9, 5);
            button.add(face);
            button.add(this.centerText(0, 1, label, key.includes('play') ? 23 : 20, key.includes('play') ? '#122152' : '#edf3ff', TITLE_FONT, 3));
        } else if (this.textures.exists(key)) {
            button.add(this.add.image(0, 0, key).setDisplaySize(width, height));
        } else {
            const fallback = this.add.graphics();
            fallback.fillStyle(0x141b2b, 1);
            fallback.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
            fallback.lineStyle(2, 0xb8c4ff, 0.8);
            fallback.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
            button.add(fallback);
        }
        button.setSize(width, height);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerdown', onClick);
        return button;
    }

    private createIntroTween() {
        const targets = this.children.list.filter((child) => child.name === 'intro') as Phaser.GameObjects.Container[];
        targets.forEach((target) => {
            target.setAlpha(0);
            target.setScale(0.94);
        });

        this.tweens.add({
            targets,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 420,
            ease: 'Back.easeOut',
            stagger: 80,
        });
    }

    private centerText(x: number, y: number, text: string, size: number, color: string, family = UI_FONT, stroke = 1) {
        return this.add.text(x, y, text, {
            fontSize: `${size}px`,
            fontFamily: family,
            fontStyle: '900',
            color,
            stroke: '#000000',
            strokeThickness: stroke,
        }).setOrigin(0.5).setResolution(2);
    }

    private leftText(x: number, y: number, text: string, size: number, color: string) {
        return this.add.text(x, y, text, this.textStyle(size, color)).setOrigin(0, 0.5).setResolution(2);
    }

    private textStyle(size: number, color: string) {
        return {
            fontSize: `${size}px`,
            fontFamily: UI_FONT,
            fontStyle: '800',
            color,
            stroke: '#000000',
            strokeThickness: 1,
        };
    }

    private colorToHex(color: number) {
        return `#${color.toString(16).padStart(6, '0')}`;
    }
}
