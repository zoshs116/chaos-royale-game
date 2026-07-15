import Phaser from 'phaser';
import { CONSTANTS } from '../systems/Constants';
import BattleManager from '../systems/BattleManager';
import { GAME_FONT, ko } from '../i18n/ko';

const UI_FONT = GAME_FONT;

export default class HUD {
    private battleManager: BattleManager;
    private timerText: Phaser.GameObjects.Text;
    private blueCrownText: Phaser.GameObjects.Text;
    private redCrownText: Phaser.GameObjects.Text;
    private phaseText: Phaser.GameObjects.Text;
    private phaseBg: Phaser.GameObjects.Rectangle;
    private pulseTimer = 0;

    constructor(scene: Phaser.Scene, battleManager: BattleManager) {
        this.battleManager = battleManager;

        const depth = CONSTANTS.DEPTH.HUD + 8;

        const topFade = scene.add.rectangle(CONSTANTS.SCREEN_WIDTH / 2, 29, CONSTANTS.SCREEN_WIDTH, 58, 0x030814, 0.68);
        topFade.setDepth(depth - 3);
        const topLine = scene.add.rectangle(CONSTANTS.SCREEN_WIDTH / 2, 57, CONSTANTS.SCREEN_WIDTH - 20, 2, 0x8aa4dc, 0.22);
        topLine.setDepth(depth - 2);

        this.createPlayerPlate(scene, 16, 8, ko.battle.scourge, 0xd94b4b, false, depth);
        this.createPlayerPlate(scene, CONSTANTS.SCREEN_WIDTH - 16, 8, ko.battle.sentinel, 0x76a7ff, true, depth);

        if (scene.textures.exists('battle_ko_timer_empty')) {
            scene.add.image(CONSTANTS.SCREEN_WIDTH / 2, 25, 'battle_ko_timer_empty')
                .setDisplaySize(86, 36)
                .setDepth(depth);
        } else {
            const timerShadow = this.rounded(scene, CONSTANTS.SCREEN_WIDTH / 2 - 38, 9, 76, 38, 10, 0x000000, 0.38);
            timerShadow.setDepth(depth - 1);
            const timerBg = this.rounded(scene, CONSTANTS.SCREEN_WIDTH / 2 - 36, 5, 72, 36, 9, 0x111827, 0.98, 0xdce7ff, 0.9, 2.5);
            timerBg.setDepth(depth);
            const timerInner = this.rounded(scene, CONSTANTS.SCREEN_WIDTH / 2 - 30, 10, 60, 24, 7, 0x050912, 0.32, 0x6e82b4, 0.36, 1);
            timerInner.setDepth(depth + 1);
            const timerGloss = this.rounded(scene, CONSTANTS.SCREEN_WIDTH / 2 - 25, 11, 50, 5, 3, 0xffffff, 0.14);
            timerGloss.setDepth(depth + 1);
        }

        this.timerText = scene.add.text(CONSTANTS.SCREEN_WIDTH / 2, 21, '3:00', {
            fontSize: '18px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#f4f7ff',
            stroke: '#02050d',
            strokeThickness: 3,
        });
        this.timerText.setOrigin(0.5);
        this.timerText.setResolution(2);
        this.timerText.setDepth(depth + 1);

        this.redCrownText = this.createCrownScore(scene, 96, 42, 0xff7770, depth);
        this.blueCrownText = this.createCrownScore(scene, CONSTANTS.SCREEN_WIDTH - 96, 42, 0x8fb8ff, depth);

        this.phaseBg = scene.add.rectangle(CONSTANTS.SCREEN_WIDTH / 2, 61, 150, 22, 0x9b18ba, 0.96);
        this.phaseBg.setStrokeStyle(2, 0xf6b0ff, 0.75);
        this.phaseBg.setDepth(depth);
        this.phaseBg.setVisible(false);

        this.phaseText = scene.add.text(CONSTANTS.SCREEN_WIDTH / 2, 57, ko.battle.doubleElixir, {
            fontSize: '10px',
            fontFamily: UI_FONT,
            fontStyle: '700',
            color: '#ffeaff',
            stroke: '#000000',
            strokeThickness: 2,
        });
        this.phaseText.setOrigin(0.5);
        this.phaseText.setResolution(2);
        this.phaseText.setDepth(depth + 1);
        this.phaseText.setVisible(false);
    }

    update() {
        const time = this.battleManager.getBattleTime();
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        this.timerText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);

        this.pulseTimer += 0.18;
        if (time < 30) {
            this.timerText.setColor(time % 1 < 0.5 ? '#ff8a76' : '#ffffff');
            this.timerText.setScale(1 + Math.sin(this.pulseTimer) * 0.04);
        } else {
            this.timerText.setColor('#f4f7ff');
            this.timerText.setScale(1);
        }

        this.blueCrownText.setText(`${this.battleManager.getBlueCrowns()}`);
        this.redCrownText.setText(`${this.battleManager.getRedCrowns()}`);

        const overtime = this.battleManager.isOvertimeActive();
        const doubleElixir = this.battleManager.isDoubleElixirTime() && !overtime;
        const visible = overtime || doubleElixir;
        this.phaseBg.setVisible(visible);
        this.phaseText.setVisible(visible);
        if (overtime) {
            this.phaseBg.setFillStyle(0xa04b1e, 0.94);
            this.phaseText.setText(ko.battle.overtime);
        } else if (doubleElixir) {
            this.phaseBg.setFillStyle(0x7a2eb0, 0.92);
            this.phaseText.setText(ko.battle.doubleElixir);
        }
    }

    private createPlayerPlate(
        scene: Phaser.Scene,
        x: number,
        y: number,
        label: string,
        color: number,
        alignRight: boolean,
        depth: number
    ) {
        const textureKey = alignRight ? 'battle_ko_hud_blue_empty' : 'battle_ko_hud_red_empty';
        if (scene.textures.exists(textureKey)) {
            const panelCenterX = alignRight ? CONSTANTS.SCREEN_WIDTH - 78 : 78;
            scene.add.image(panelCenterX, y + 19, textureKey)
                .setDisplaySize(154, 42)
                .setDepth(depth);

            const name = scene.add.text(alignRight ? panelCenterX + 17 : panelCenterX - 17, y + 9, label, {
                fontSize: '8px',
                fontFamily: UI_FONT,
                fontStyle: '900',
                color: this.colorToHex(color),
                stroke: '#000000',
                strokeThickness: 2,
            });
            name.setOrigin(0.5, 0);
            name.setResolution(2);
            name.setDepth(depth + 1);

            const stars = scene.add.text(alignRight ? panelCenterX + 17 : panelCenterX - 17, y + 22, '* * *', {
                fontSize: '8px',
                fontFamily: UI_FONT,
                color: '#f6d15d',
                stroke: '#000000',
                strokeThickness: 2,
            });
            stars.setOrigin(0.5, 0);
            stars.setResolution(2);
            stars.setDepth(depth + 1);
            return;
        }

        const plateW = 94;
        const plateX = x + (alignRight ? -plateW : 0);
        const shadow = this.rounded(scene, plateX + (alignRight ? -2 : 2), y + 3, plateW, 36, 8, 0x000000, 0.34);
        shadow.setDepth(depth - 1);
        const plate = this.rounded(scene, plateX, y, plateW, 36, 8, 0x101725, 0.96, color, 0.78, 2);
        plate.setDepth(depth);

        const tint = this.rounded(scene, plateX + 3, y + 3, plateW - 6, 30, 6, color, 0.08);
        tint.setDepth(depth + 1);
        const gloss = this.rounded(scene, plateX + 8, y + 5, plateW - 18, 5, 3, 0xffffff, 0.1);
        gloss.setDepth(depth + 1);

        const avatar = this.rounded(scene, x + (alignRight ? -29 : 4), y + 5, 26, 26, 5, color, 0.34, color, 0.96, 2);
        avatar.setDepth(depth + 1);

        const name = scene.add.text(x + (alignRight ? -35 : 35), y + 6, label, {
            fontSize: '8px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: this.colorToHex(color),
            stroke: '#000000',
            strokeThickness: 2,
        });
        name.setOrigin(alignRight ? 1 : 0, 0);
        name.setResolution(2);
        name.setDepth(depth + 1);

        const stars = scene.add.text(x + (alignRight ? -35 : 35), y + 20, '* * *', {
            fontSize: '8px',
            fontFamily: UI_FONT,
            color: '#f6d15d',
            stroke: '#000000',
            strokeThickness: 2,
        });
        stars.setOrigin(alignRight ? 1 : 0, 0);
        stars.setResolution(2);
        stars.setDepth(depth + 1);
    }

    private createCrownScore(scene: Phaser.Scene, x: number, y: number, color: number, depth: number) {
        if (!scene.textures.exists('battle_ko_hud_red_empty')) {
            const bg = this.rounded(scene, x - 22, y - 11, 44, 22, 6, 0x111827, 0.96, color, 0.84, 2);
            bg.setDepth(depth);

            const crown = scene.add.triangle(x - 10, y + 1, 0, 9, 5, 0, 10, 9, 0xf7d76a, 0.98);
            crown.setStrokeStyle(1, 0x7d5a17, 0.8);
            crown.setDepth(depth + 1);
        }

        const score = scene.add.text(x + 8, y, '0', {
            fontSize: '12px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        });
        score.setOrigin(0.5);
        score.setResolution(2);
        score.setDepth(depth + 1);
        return score;
    }

    private colorToHex(color: number) {
        return `#${color.toString(16).padStart(6, '0')}`;
    }

    private rounded(
        scene: Phaser.Scene,
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
        const g = scene.add.graphics();
        g.fillStyle(fill, alpha);
        g.fillRoundedRect(x, y, width, height, radius);
        if (stroke !== undefined) {
            g.lineStyle(strokeWidth, stroke, strokeAlpha);
            g.strokeRoundedRect(x, y, width, height, radius);
        }
        return g;
    }
}
