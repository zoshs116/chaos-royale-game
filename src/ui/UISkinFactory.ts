import Phaser from 'phaser';

type ButtonTone = 'primary' | 'gold' | 'green' | 'dark' | 'purple';

const BUTTONS: Record<ButtonTone, { top: number; mid: number; bottom: number; edge: number; bevel: number; glow: number; shadow: number }> = {
    primary: { top: 0x8bb9ff, mid: 0x315ff0, bottom: 0x0d277f, edge: 0xe5eeff, bevel: 0x173ea8, glow: 0x5c8dff, shadow: 0x06122f },
    gold: { top: 0xffffa8, mid: 0xf0bd18, bottom: 0x9f5e00, edge: 0xffffd9, bevel: 0xb47a05, glow: 0xffd83f, shadow: 0x402604 },
    green: { top: 0x82ffab, mid: 0x19b85a, bottom: 0x06682b, edge: 0xd8ffe4, bevel: 0x0c873b, glow: 0x36e67a, shadow: 0x032213 },
    dark: { top: 0x677289, mid: 0x2a3348, bottom: 0x0b111d, edge: 0xc7d2ef, bevel: 0x121d32, glow: 0x7583a8, shadow: 0x030712 },
    purple: { top: 0xff95ff, mid: 0xaa18cf, bottom: 0x5f006f, edge: 0xffe0ff, bevel: 0x7b0c95, glow: 0xe146f0, shadow: 0x24002e },
};

export function createUISkinTextures(scene: Phaser.Scene) {
    createButtons(scene);
    createPanels(scene);
    createCards(scene);
    createCurrencies(scene);
    createUtilityIcons(scene);
    createBattleHud(scene);
}

function createButtons(scene: Phaser.Scene) {
    (Object.keys(BUTTONS) as ButtonTone[]).forEach((tone) => {
        drawButton(scene, `ui_button_${tone}`, BUTTONS[tone], false);
        drawButton(scene, `ui_button_${tone}_pressed`, BUTTONS[tone], true);
    });
}

function drawButton(
    scene: Phaser.Scene,
    key: string,
    c: { top: number; mid: number; bottom: number; edge: number; bevel: number; glow: number; shadow: number },
    pressed: boolean
) {
    if (scene.textures.exists(key)) return;
    const w = 360;
    const h = 116;
    const g = scene.add.graphics();
    const yOffset = pressed ? 6 : 0;
    const faceY = 12 + yOffset;

    // 9-slice friendly center with detailed borders/corners for a sharper game UI look.
    g.fillStyle(c.shadow, pressed ? 0.48 : 0.72);
    g.fillRoundedRect(14, 24, w - 28, h - 26, 24);
    g.fillStyle(c.glow, pressed ? 0.12 : 0.26);
    g.fillRoundedRect(12, 12 + yOffset, w - 24, h - 30, 24);
    g.fillStyle(0xffffff, pressed ? 0.06 : 0.12);
    g.fillRoundedRect(22, 8 + yOffset, w - 44, h - 40, 22);

    g.fillGradientStyle(c.top, c.top, c.mid, c.bottom, 1);
    g.fillRoundedRect(20, faceY, w - 40, h - 44, 20);
    g.fillStyle(c.bevel, pressed ? 0.5 : 0.82);
    g.fillRoundedRect(24, faceY + h - 57, w - 48, 18, 9);

    g.lineStyle(5, c.edge, pressed ? 0.54 : 0.96);
    g.strokeRoundedRect(20, faceY, w - 40, h - 44, 20);
    g.lineStyle(2, 0xffffff, pressed ? 0.12 : 0.3);
    g.strokeRoundedRect(31, faceY + 10, w - 62, h - 66, 13);
    g.lineStyle(2, 0x000000, 0.22);
    g.strokeRoundedRect(27, faceY + 8, w - 54, h - 60, 16);

    g.fillStyle(0xffffff, pressed ? 0.1 : 0.24);
    g.fillRoundedRect(44, faceY + 12, w - 88, 10, 5);
    g.fillStyle(0xffffff, pressed ? 0.05 : 0.12);
    g.fillTriangle(40, faceY + 26, 116, faceY + 26, 40, faceY + 58);
    g.fillStyle(0x000000, pressed ? 0.18 : 0.1);
    g.fillTriangle(w - 44, faceY + h - 46, w - 120, faceY + h - 46, w - 44, faceY + h - 76);

    g.fillStyle(c.edge, pressed ? 0.18 : 0.34);
    g.fillCircle(42, faceY + 32, 5);
    g.fillCircle(w - 42, faceY + 32, 5);
    g.fillCircle(42, faceY + h - 55, 5);
    g.fillCircle(w - 42, faceY + h - 55, 5);

    g.generateTexture(key, w, h);
    g.destroy();
}

function createPanels(scene: Phaser.Scene) {
    if (!scene.textures.exists('ui_panel_dark')) {
        const g = scene.add.graphics();
        const w = 960;
        const h = 480;
        g.fillStyle(0x000000, 0.5);
        g.fillRoundedRect(24, 36, w - 48, h - 48, 34);
        g.fillGradientStyle(0x25314b, 0x25314b, 0x111a2c, 0x050b16, 1);
        g.fillRoundedRect(28, 24, w - 56, h - 70, 32);
        g.lineStyle(6, 0x61739f, 0.95);
        g.strokeRoundedRect(28, 24, w - 56, h - 70, 32);
        g.lineStyle(2, 0xd8e2ff, 0.24);
        g.strokeRoundedRect(48, 44, w - 96, h - 110, 22);
        g.lineStyle(2, 0x000000, 0.32);
        g.strokeRoundedRect(38, 34, w - 76, h - 90, 28);
        g.fillStyle(0xffffff, 0.08);
        g.fillRoundedRect(62, 54, w - 124, 26, 13);
        g.fillStyle(0x7aa4ff, 0.08);
        g.fillRoundedRect(60, h - 100, w - 120, 34, 17);
        for (let i = 0; i < 18; i += 1) {
            const x = 76 + i * 46;
            g.fillStyle(i % 2 === 0 ? 0xffffff : 0x6f88bd, i % 2 === 0 ? 0.035 : 0.05);
            g.fillRoundedRect(x, 94, 18, h - 216, 9);
        }
        g.generateTexture('ui_panel_dark', w, h);
        g.destroy();
    }

    if (!scene.textures.exists('ui_nav_bar')) {
        const g = scene.add.graphics();
        const w = 960;
        const h = 200;
        g.fillStyle(0x000000, 0.62);
        g.fillRoundedRect(18, 24, w - 36, h - 28, 38);
        g.fillGradientStyle(0x1d2740, 0x1d2740, 0x0a101d, 0x03060c, 1);
        g.fillRoundedRect(24, 12, w - 48, h - 34, 36);
        g.lineStyle(5, 0x3f5173, 0.96);
        g.strokeRoundedRect(24, 12, w - 48, h - 34, 36);
        g.lineStyle(2, 0xdce7ff, 0.15);
        g.strokeRoundedRect(42, 28, w - 84, h - 68, 26);
        g.fillStyle(0xffffff, 0.075);
        g.fillRoundedRect(58, 28, w - 116, 20, 10);
        g.fillStyle(0x000000, 0.26);
        g.fillRoundedRect(58, h - 58, w - 116, 22, 11);
        g.generateTexture('ui_nav_bar', w, h);
        g.destroy();
    }

    if (!scene.textures.exists('ui_nav_active')) {
        const g = scene.add.graphics();
        const w = 160;
        const h = 160;
        g.fillStyle(0x000000, 0.42);
        g.fillRoundedRect(22, 28, 116, 116, 30);
        g.fillStyle(0x79a7ff, 0.24);
        g.fillRoundedRect(18, 18, 124, 122, 31);
        g.fillGradientStyle(0x83b1ff, 0x83b1ff, 0x2f64f2, 0x112f8a, 1);
        g.fillRoundedRect(24, 18, 112, 112, 28);
        g.lineStyle(5, 0xe7eeff, 0.96);
        g.strokeRoundedRect(24, 18, 112, 112, 28);
        g.lineStyle(2, 0x08152e, 0.25);
        g.strokeRoundedRect(34, 28, 92, 92, 20);
        g.fillStyle(0xffffff, 0.24);
        g.fillRoundedRect(42, 34, 76, 14, 7);
        g.generateTexture('ui_nav_active', w, h);
        g.destroy();
    }
}

function createCards(scene: Phaser.Scene) {
    const variants = [
        ['ui_card_blue', 0x4f7dff, 0x111827],
        ['ui_card_green', 0x22d35e, 0x111827],
        ['ui_card_red', 0xff5151, 0x111827],
        ['ui_card_purple', 0xd62ae8, 0x111827],
        ['ui_card_gold', 0xffd83f, 0x15120a],
    ] as const;

    variants.forEach(([key, edge, fill]) => {
        if (scene.textures.exists(key)) return;
        const g = scene.add.graphics();
        const w = 240;
        const h = 300;

        // 9-slice friendly card frame: ornate corners, simple stretchable center.
        g.fillStyle(0x000000, 0.58);
        g.fillRoundedRect(12, 22, w - 24, h - 26, 22);
        g.fillStyle(edge, 0.18);
        g.fillRoundedRect(8, 8, w - 16, h - 32, 22);
        g.fillGradientStyle(0x26324d, 0x26324d, fill, 0x050a14, 1);
        g.fillRoundedRect(16, 10, w - 32, h - 42, 18);

        g.lineStyle(6, edge, 0.98);
        g.strokeRoundedRect(16, 10, w - 32, h - 42, 18);
        g.lineStyle(2, 0xffffff, 0.3);
        g.strokeRoundedRect(30, 24, w - 60, h - 70, 10);
        g.lineStyle(2, 0x000000, 0.24);
        g.strokeRoundedRect(24, 18, w - 48, h - 58, 14);

        g.fillStyle(0xffffff, 0.13);
        g.fillRoundedRect(38, 31, w - 76, 14, 7);
        g.fillStyle(0x000000, 0.28);
        g.fillRoundedRect(34, h - 82, w - 68, 42, 10);
        g.lineStyle(2, edge, 0.45);
        g.strokeRoundedRect(34, h - 82, w - 68, 42, 10);

        g.fillStyle(edge, 0.38);
        g.fillRoundedRect(24, 22, 14, h - 70, 7);
        g.fillRoundedRect(w - 38, 22, 14, h - 70, 7);
        g.fillStyle(edge, 0.75);
        g.fillCircle(32, 30, 7);
        g.fillCircle(w - 32, 30, 7);
        g.fillCircle(32, h - 56, 7);
        g.fillCircle(w - 32, h - 56, 7);
        g.generateTexture(key, w, h);
        g.destroy();
    });
}

function createCurrencies(scene: Phaser.Scene) {
    createCurrency(scene, 'ui_coin', 0xffd83f, 0xb77708);
    createCurrency(scene, 'ui_gem', 0xff7cff, 0x7c008e);
}

function createCurrency(scene: Phaser.Scene, key: string, top: number, bottom: number) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    const s = 96;
    if (key === 'ui_coin') {
        g.fillStyle(0x000000, 0.28);
        g.fillCircle(50, 52, 34);
        g.fillGradientStyle(top, top, bottom, bottom, 1);
        g.fillCircle(48, 46, 34);
        g.lineStyle(5, 0xfff3a3, 0.9);
        g.strokeCircle(48, 46, 28);
        g.fillStyle(0xffffff, 0.22);
        g.fillEllipse(38, 34, 26, 12);
    } else {
        g.fillStyle(0x000000, 0.28);
        g.fillRect(28, 28, 48, 48);
        g.fillGradientStyle(top, top, bottom, bottom, 1);
        g.fillRect(24, 22, 48, 48);
        g.lineStyle(5, 0xffd6ff, 0.9);
        g.strokeRect(24, 22, 48, 48);
        g.fillStyle(0xffffff, 0.24);
        g.fillTriangle(34, 28, 62, 28, 44, 42);
    }
    g.generateTexture(key, s, s);
    g.destroy();
}

function createUtilityIcons(scene: Phaser.Scene) {
    createTrophy(scene);
    createChest(scene);
    createNavIconTexture(scene, 'ui_icon_battle', 0xb8c4ff, (g, x, y) => {
        g.lineStyle(8, 0xffffff, 0.96);
        g.lineBetween(x - 26, y - 24, x + 22, y + 24);
        g.lineBetween(x + 26, y - 24, x - 22, y + 24);
        g.fillStyle(0xffffff, 0.96);
        g.fillTriangle(x + 22, y + 24, x + 36, y + 32, x + 28, y + 16);
        g.fillTriangle(x - 22, y + 24, x - 36, y + 32, x - 28, y + 16);
    });
    createNavIconTexture(scene, 'ui_icon_deck', 0xb8c4ff, (g, x, y) => {
        g.lineStyle(7, 0xffffff, 0.96);
        g.strokeRoundedRect(x - 28, y - 30, 38, 50, 8);
        g.strokeRoundedRect(x - 8, y - 20, 38, 50, 8);
        g.lineStyle(4, 0xffffff, 0.58);
        g.lineBetween(x - 1, y - 4, x + 20, y - 4);
        g.lineBetween(x - 1, y + 8, x + 16, y + 8);
    });
    createNavIconTexture(scene, 'ui_icon_shop', 0xb8c4ff, (g, x, y) => {
        g.lineStyle(7, 0xffffff, 0.96);
        g.strokeRoundedRect(x - 30, y - 12, 60, 44, 8);
        g.lineBetween(x - 16, y - 12, x - 16, y - 30);
        g.lineBetween(x + 16, y - 12, x + 16, y - 30);
        g.lineBetween(x - 16, y - 30, x + 16, y - 30);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(x, y + 8, 5);
    });
    createNavIconTexture(scene, 'ui_icon_clan', 0xb8c4ff, (g, x, y) => {
        g.fillStyle(0xffffff, 0.96);
        g.fillCircle(x - 24, y - 8, 10);
        g.fillCircle(x + 24, y - 8, 10);
        g.fillCircle(x, y - 24, 11);
        g.lineStyle(7, 0xffffff, 0.96);
        g.strokeRoundedRect(x - 38, y + 8, 76, 30, 16);
    });
}

function createTrophy(scene: Phaser.Scene) {
    if (scene.textures.exists('ui_trophy')) return;
    const g = scene.add.graphics();
    const s = 128;
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(66, 106, 72, 18);
    g.fillGradientStyle(0x9dc0ff, 0x9dc0ff, 0x2f64f2, 0x12318f, 1);
    g.fillRoundedRect(46, 34, 36, 44, 8);
    g.fillStyle(0x2145aa, 1);
    g.fillRect(58, 74, 12, 18);
    g.fillRoundedRect(42, 90, 44, 12, 5);
    g.lineStyle(6, 0xdce7ff, 0.92);
    g.strokeRoundedRect(46, 34, 36, 44, 8);
    g.lineStyle(5, 0x9dc0ff, 0.9);
    g.beginPath();
    g.arc(45, 48, 18, Math.PI * 0.5, Math.PI * 1.4, false);
    g.strokePath();
    g.beginPath();
    g.arc(83, 48, 18, Math.PI * 1.6, Math.PI * 0.5, false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(54, 42, 20, 7, 4);
    g.generateTexture('ui_trophy', s, s);
    g.destroy();
}

function createChest(scene: Phaser.Scene) {
    if (scene.textures.exists('ui_chest')) return;
    const g = scene.add.graphics();
    const s = 128;
    g.fillStyle(0x000000, 0.34);
    g.fillEllipse(66, 98, 82, 20);
    g.fillGradientStyle(0x8d66d7, 0x8d66d7, 0x3f245f, 0x271435, 1);
    g.fillRoundedRect(28, 48, 72, 42, 10);
    g.fillGradientStyle(0xc2a1ff, 0xc2a1ff, 0x6f49b6, 0x3f245f, 1);
    g.fillRoundedRect(34, 30, 60, 30, 11);
    g.lineStyle(5, 0xffd6ff, 0.76);
    g.strokeRoundedRect(28, 48, 72, 42, 10);
    g.strokeRoundedRect(34, 30, 60, 30, 11);
    g.lineStyle(4, 0xffd83f, 0.86);
    g.lineBetween(64, 31, 64, 90);
    g.lineBetween(28, 62, 100, 62);
    g.fillStyle(0xffd83f, 1);
    g.fillRoundedRect(54, 56, 20, 22, 5);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(44, 38, 38, 7, 4);
    g.generateTexture('ui_chest', s, s);
    g.destroy();
}

function createNavIconTexture(
    scene: Phaser.Scene,
    key: string,
    glow: number,
    draw: (g: Phaser.GameObjects.Graphics, x: number, y: number) => void
) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillCircle(67, 68, 48);
    g.fillStyle(glow, 0.16);
    g.fillCircle(64, 62, 46);
    draw(g, 64, 64);
    g.generateTexture(key, 128, 128);
    g.destroy();
}

function createBattleHud(scene: Phaser.Scene) {
    if (scene.textures.exists('ui_elixir_bar')) return;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.44);
    g.fillRoundedRect(4, 6, 520, 52, 16);
    g.fillGradientStyle(0x1a2337, 0x1a2337, 0x0c1322, 0x090911, 1);
    g.fillRoundedRect(8, 4, 512, 44, 14);
    g.lineStyle(4, 0x7d8ab4, 0.9);
    g.strokeRoundedRect(8, 4, 512, 44, 14);
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(20, 13, 488, 8, 4);
    g.generateTexture('ui_elixir_bar', 528, 64);
    g.destroy();
}
