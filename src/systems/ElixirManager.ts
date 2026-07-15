import Phaser from 'phaser';
import { CONSTANTS } from '../systems/Constants';
import { GAME_FONT } from '../i18n/ko';

const UI_FONT = GAME_FONT;

export default class ElixirManager {
    private elixir: number;
    private maxElixir: number;
    private regenRate: number;
    private regenTimer = 0;
    private regenProgress = 0;
    private pulseTimer = 0;

    private segments: Phaser.GameObjects.Rectangle[] = [];
    private fillProgress: Phaser.GameObjects.Rectangle;
    private elixirText: Phaser.GameObjects.Text;
    private elixirGem: Phaser.GameObjects.Rectangle;
    private barFrame: Phaser.GameObjects.Rectangle;

    constructor(scene: Phaser.Scene) {
        this.elixir = CONSTANTS.GAMEPLAY.START_ELIXIR;
        this.maxElixir = CONSTANTS.GAMEPLAY.MAX_ELIXIR;
        this.regenRate = CONSTANTS.GAMEPLAY.ELIXIR_REGEN_RATE;

        const gemX = 36;
        const barX = 64;
        const barY = CONSTANTS.SCREEN_HEIGHT - 126;
        const barW = 250;
        const barH = 18;
        const depth = CONSTANTS.DEPTH.HUD + 3;

        const gemHalo = scene.add.rectangle(gemX, barY, 38, 38, 0x7d1da0, 0.2);
        gemHalo.setAngle(45);
        gemHalo.setDepth(depth - 1);

        const gemShadow = scene.add.rectangle(gemX + 2, barY + 3, 31, 31, 0x000000, 0.48);
        gemShadow.setAngle(45);
        gemShadow.setDepth(depth);

        this.elixirGem = scene.add.rectangle(gemX, barY, 32, 32, 0xba19d4, 0.98);
        this.elixirGem.setAngle(45);
        this.elixirGem.setStrokeStyle(2.5, 0xffd6ff, 0.96);
        this.elixirGem.setDepth(depth + 1);

        this.elixirText = scene.add.text(gemX, barY, `${this.elixir}`, {
            fontSize: '16px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        });
        this.elixirText.setOrigin(0.5);
        this.elixirText.setResolution(2);
        this.elixirText.setDepth(depth + 2);

        if (scene.textures.exists('ui_elixir_bar')) {
            const barFrameImage = scene.add.image(barX + barW / 2, barY, 'ui_elixir_bar');
            barFrameImage.setDisplaySize(barW + 18, barH + 18);
            barFrameImage.setDepth(depth);
        }

        const barShadow = scene.add.rectangle(barX + barW / 2 + 2, barY + 4, barW + 18, barH + 14, 0x000000, 0.32);
        barShadow.setDepth(depth - 1);

        this.barFrame = scene.add.rectangle(barX + barW / 2, barY, barW + 12, barH + 10, 0x111827, scene.textures.exists('ui_elixir_bar') ? 0 : 0.98);
        this.barFrame.setStrokeStyle(2, 0x7d8ab4, scene.textures.exists('ui_elixir_bar') ? 0 : 0.9);
        this.barFrame.setDepth(depth);

        const barBg = scene.add.rectangle(barX + barW / 2, barY, barW, barH, 0x15061d, 0.99);
        barBg.setDepth(depth + 1);
        barBg.setStrokeStyle(1, 0x4d2a5d, 0.8);

        const segW = barW / this.maxElixir;
        for (let i = 0; i < this.maxElixir; i++) {
            const seg = scene.add.rectangle(
                barX + i * segW + segW / 2,
                barY,
                segW - 2,
                barH - 4,
                0x2a1224
            );
            seg.setStrokeStyle(1, 0x000000, 0.16);
            seg.setDepth(depth + 2);
            this.segments.push(seg);
        }

        this.fillProgress = scene.add.rectangle(barX, barY, 0, barH - 3, 0xffb6f6, 0.38);
        this.fillProgress.setOrigin(0, 0.5);
        this.fillProgress.setDepth(depth + 3);

        const shine = scene.add.rectangle(barX + barW / 2, barY - 5, barW - 12, 2, 0xffffff, 0.2);
        shine.setDepth(depth + 4);

        this.updateVisuals();
    }

    update(_time: number, delta: number) {
        this.pulseTimer += delta * 0.005;

        if (this.elixir >= this.maxElixir) {
            this.regenProgress = 0;
            this.updateVisuals();
            return;
        }

        this.regenTimer += delta;
        this.regenProgress = this.regenTimer / this.regenRate;

        if (this.regenTimer >= this.regenRate) {
            this.regenTimer -= this.regenRate;
            this.elixir = Math.min(this.elixir + 1, this.maxElixir);
            this.regenProgress = 0;
        }

        this.updateVisuals();
    }

    canSpend(amount: number): boolean {
        return this.elixir >= amount;
    }

    spend(amount: number): boolean {
        if (!this.canSpend(amount)) return false;
        this.elixir -= amount;
        this.regenTimer = 0;
        this.regenProgress = 0;
        this.updateVisuals();
        return true;
    }

    setDoubleElixir(enabled: boolean) {
        this.regenRate = enabled
            ? CONSTANTS.GAMEPLAY.ELIXIR_REGEN_DOUBLE
            : CONSTANTS.GAMEPLAY.ELIXIR_REGEN_RATE;
    }

    getElixir(): number {
        return this.elixir;
    }

    setElixirForDebug(value: number) {
        this.elixir = Phaser.Math.Clamp(Math.floor(value), 0, this.maxElixir);
        this.regenTimer = 0;
        this.regenProgress = 0;
        this.updateVisuals();
    }

    private updateVisuals() {
        const barX = 64;
        const barW = 250;
        const segW = barW / this.maxElixir;

        for (let i = 0; i < this.maxElixir; i++) {
            if (i < this.elixir) {
                this.segments[i].setFillStyle(this.shiftColor(0xd62ae8, i * 4));
                this.segments[i].setAlpha(0.96);
            } else {
                this.segments[i].setFillStyle(0x2a1224);
                this.segments[i].setAlpha(0.62);
            }
        }

        if (this.elixir < this.maxElixir) {
            this.fillProgress.x = barX + this.elixir * segW + 1;
            this.fillProgress.width = Math.max(0, (segW - 2) * this.regenProgress);
            this.fillProgress.setVisible(true);
        } else {
            this.fillProgress.setVisible(false);
        }

        this.elixirText.setText(`${this.elixir}`);

        if (this.elixir >= this.maxElixir) {
            const pulse = 1 + Math.sin(this.pulseTimer * 1.5) * 0.05;
            this.elixirText.setColor('#ffe7ff');
            this.elixirText.setScale(pulse);
            this.elixirGem.setScale(pulse);
            this.barFrame.setStrokeStyle(3, 0xffd6ff, 0.98);
        } else {
            this.elixirText.setColor('#ffffff');
            this.elixirText.setScale(1);
            this.elixirGem.setScale(1);
            this.barFrame.setStrokeStyle(2, 0x7d8ab4, 0.9);
        }
    }

    private shiftColor(base: number, amount: number): number {
        const c = Phaser.Display.Color.IntegerToColor(base);
        return Phaser.Display.Color.GetColor(
            Phaser.Math.Clamp(c.red + amount, 0, 255),
            Phaser.Math.Clamp(c.green + amount, 0, 255),
            Phaser.Math.Clamp(c.blue + amount, 0, 255)
        );
    }
}
