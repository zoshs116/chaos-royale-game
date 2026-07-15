import Phaser from 'phaser';
import { getLayout } from '../core/Resolution';
import { GAME_FONT, GAME_TITLE_FONT, ko } from '../i18n/ko';

export const UI_FONT = GAME_FONT;
export const TITLE_FONT = GAME_TITLE_FONT;

type ButtonTone = 'primary' | 'gold' | 'green' | 'dark' | 'purple';
type NavKey = 'lobby' | 'deck' | 'shop' | 'social';

const BUTTON_COLORS: Record<ButtonTone, { top: number; mid: number; bottom: number; edge: number; text: string }> = {
    primary: { top: 0x79aaff, mid: 0x2f63ec, bottom: 0x102b8a, edge: 0xe2ebff, text: '#ffffff' },
    gold: { top: 0xffff98, mid: 0xf0bd18, bottom: 0xa96505, edge: 0xffffd1, text: '#122152' },
    green: { top: 0x72f39d, mid: 0x19b85a, bottom: 0x06682b, edge: 0xd6ffe3, text: '#ffffff' },
    dark: { top: 0x556176, mid: 0x273048, bottom: 0x0b111d, edge: 0xc4d0ef, text: '#dce7ff' },
    purple: { top: 0xff87ff, mid: 0xb51bd2, bottom: 0x650078, edge: 0xffdcff, text: '#ffffff' },
};

function firstTexture(scene: Phaser.Scene, keys: string[]) {
    return keys.find((key) => scene.textures.exists(key));
}

export function addGameBackground(scene: Phaser.Scene, width: number, height: number) {
    const bg = scene.add.graphics();
    bg.fillGradientStyle(0x07111f, 0x07111f, 0x142642, 0x050a13, 1);
    bg.fillRect(0, 0, width, height);
    bg.fillStyle(0xffffff, 0.035);
    for (let y = 96; y < height; y += 44) {
        bg.fillRect(0, y, width, 1);
    }
    bg.fillStyle(0x5f7cff, 0.055);
    bg.fillTriangle(0, 92, width, 320, 0, 660);
    bg.fillStyle(0xff4fd8, 0.035);
    bg.fillTriangle(width, 130, width, 580, 36, 760);
    bg.fillStyle(0x000000, 0.22);
    bg.fillRect(0, 0, width, 86);
    bg.fillStyle(0xffffff, 0.06);
    bg.fillRect(0, 85, width, 1);
    return bg;
}

export function addHeaderBar(scene: Phaser.Scene, width: number, height = 64) {
    const key = firstTexture(scene, ['ui_asset_header_bar']);
    if (key) {
        return scene.add.nineslice(width / 2, height / 2, key, undefined, width, height + 8, 32, 32, 24, 24);
    }

    const g = scene.add.graphics();
    g.fillStyle(0x111827, 0.99);
    g.fillRect(0, 0, width, height);
    g.lineStyle(2, 0x303a56, 0.92);
    g.strokeRect(0, 0, width, height);
    g.fillStyle(0xb8c4ff, 0.14);
    g.fillRect(10, height - 2, width - 20, 2);
    return g;
}

export function playScreenIntro(scene: Phaser.Scene) {
    scene.cameras.main.fadeIn(180, 3, 7, 16);
}

export function addPanel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    radius = 12,
    fill = 0x111827,
    stroke = 0x52648f
) {
    const c = scene.add.container(x, y);
    const panelKey = firstTexture(scene, ['ui_asset_panel_dark', 'ui_panel_dark']);
    if (panelKey) {
        const panel = scene.add.nineslice(0, 0, panelKey, undefined, width, height, 44, 44, 44, 44);
        c.add(panel);
        return c;
    }

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.36);
    shadow.fillRoundedRect(-width / 2 + 4, -height / 2 + 6, width, height, radius);
    c.add(shadow);

    const base = scene.add.graphics();
    base.fillGradientStyle(fill + 0x080808, fill + 0x080808, fill, Math.max(0, fill - 0x060606), 1);
    base.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    base.lineStyle(1.5, stroke, 0.72);
    base.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    base.fillStyle(0xffffff, 0.055);
    base.fillRoundedRect(-width / 2 + 8, -height / 2 + 7, width - 16, Math.min(11, height / 4), Math.min(6, radius));
    c.add(base);
    return c;
}

export function addCurrencyPill(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: string,
    iconKey: string,
    accent: number,
    width = 72,
    height = 28
) {
    const c = scene.add.container(x, y);
    const pillKey = firstTexture(scene, ['ui_asset_currency_pill']);
    if (pillKey) {
        const pill = scene.add.nineslice(0, 0, pillKey, undefined, width, height, 32, 32, 24, 24);
        pill.setTint(accent);
        c.add(pill);
    } else {
        const bg = scene.add.graphics();
        bg.fillStyle(0x101725, 0.99);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
        bg.lineStyle(1.5, accent, 0.82);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
        c.add(bg);
    }

    if (scene.textures.exists(iconKey)) {
        c.add(scene.add.image(-width / 2 + 13, 0, iconKey).setDisplaySize(17, 17));
    } else {
        const dot = scene.add.circle(-width / 2 + 13, 0, 7, accent, 1);
        dot.setStrokeStyle(1, 0xffffff, 0.22);
        c.add(dot);
    }

    c.add(scene.add.text(-width / 2 + 26, 0, value, {
        fontSize: '10px',
        fontFamily: UI_FONT,
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
    }).setOrigin(0, 0.5).setResolution(2));

    return c;
}

export function addSlotFrame(scene: Phaser.Scene, x: number, y: number, width: number, height: number, locked = false) {
    const c = scene.add.container(x, y);
    const key = firstTexture(scene, [locked ? 'ui_asset_slot_locked' : 'ui_asset_slot_empty']);
    if (key) {
        c.add(scene.add.nineslice(0, 0, key, undefined, width, height, 26, 26, 26, 26));
    } else {
        const g = scene.add.graphics();
        g.fillStyle(locked ? 0x101420 : 0x090d17, 1);
        g.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
        g.lineStyle(2, 0x444653, 0.75);
        g.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
        c.add(g);
    }
    return c;
}

export function addToastPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    const key = firstTexture(scene, ['ui_asset_toast_panel']);
    if (key) return scene.add.nineslice(x, y, key, undefined, width, height, 36, 36, 28, 28);
    return addButtonBackplate(scene, x - width / 2, y - height / 2, width, height, 10, 0x315ff0, 0x10245f, 0xb8c4ff);
}

export function addButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    tone: ButtonTone,
    onClick: () => void,
    fontSize = 17,
    options: { labelX?: number; labelY?: number; labelPlate?: boolean } = {}
) {
    const colors = BUTTON_COLORS[tone];
    const c = scene.add.container(x, y);
    const textureKey = firstTexture(scene, [`ui_asset_button_${tone}`, `ui_button_${tone}`]);
    const pressedTextureKey = firstTexture(scene, [`ui_asset_button_${tone}_pressed`, `ui_button_${tone}_pressed`]);

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.34);
    shadow.fillRoundedRect(-width / 2 + 2, -height / 2 + 6, width - 4, height, Math.min(15, height / 3));
    c.add(shadow);

    if (textureKey && height >= 44) {
        const face = scene.add.nineslice(0, -2, textureKey, undefined, width, height + 6, 34, 34, 18, 18);
        c.add(face);
    } else {
        const face = scene.add.graphics();
        face.fillGradientStyle(colors.top, colors.top, colors.mid, colors.bottom, 1);
        face.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
        face.lineStyle(2, colors.edge, 0.9);
        face.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
        face.fillStyle(0xffffff, 0.18);
        face.fillRoundedRect(-width / 2 + 10, -height / 2 + 8, width - 20, 8, 4);
        c.add(face);
    }

    const labelX = options.labelX ?? 0;
    const labelY = options.labelY ?? -3;
    if (options.labelPlate) {
        const plateWidth = Math.max(74, label.length * fontSize * 0.72 + 28);
        const plate = scene.add.graphics();
        plate.fillStyle(0x07101f, 0.44);
        plate.fillRoundedRect(labelX - plateWidth / 2, labelY - fontSize * 0.72, plateWidth, fontSize * 1.32, 7);
        plate.lineStyle(1, 0xdce7ff, 0.22);
        plate.strokeRoundedRect(labelX - plateWidth / 2, labelY - fontSize * 0.72, plateWidth, fontSize * 1.32, 7);
        c.add(plate);
    }

    const text = scene.add.text(labelX, labelY, label, {
        fontSize: `${fontSize}px`,
        fontFamily: UI_FONT,
        fontStyle: '900',
        color: colors.text,
        stroke: tone === 'gold' ? '#ffffff' : '#07101f',
        strokeThickness: tone === 'gold' ? 1.25 : (fontSize <= 11 ? 2 : 3),
    }).setOrigin(0.5);
    text.setResolution(2);
    c.add(text);

    c.setSize(width, height);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => c.setScale(1.012));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerdown', () => {
        c.setScale(0.972);
        const image = c.list.find((child) => child instanceof Phaser.GameObjects.NineSlice) as Phaser.GameObjects.NineSlice | undefined;
        if (image && pressedTextureKey) image.setTexture(pressedTextureKey);
        scene.time.delayedCall(70, () => c.setScale(1));
        scene.time.delayedCall(90, () => {
            if (image && textureKey) image.setTexture(textureKey);
        });
        onClick();
    });
    return c;
}

export function addBottomNav(
    scene: Phaser.Scene,
    activeKey: NavKey,
    onClick: (key: NavKey) => void
) {
    const { width, height } = getLayout();
    const stitchedNavY = height - 44;
    const stitchedNavWidth = width - 30;
    const stitchedNavHeight = 70;

    const stitchedNavKey = activeKey === 'lobby'
        ? (scene.textures.exists('lobby_ko_bottom_nav') ? 'lobby_ko_bottom_nav' : undefined)
        : activeKey === 'deck' && scene.textures.exists('deck_ko_bottom_nav')
            ? 'deck_ko_bottom_nav'
            : undefined;

    if (stitchedNavKey) {
        const nav = scene.add.container(width / 2, stitchedNavY);
        nav.setDepth(900);
        nav.add(scene.add.image(0, 0, stitchedNavKey).setDisplaySize(stitchedNavWidth, stitchedNavHeight));
        [
            { key: 'lobby' as NavKey, x: -124 },
            { key: 'deck' as NavKey, x: -42 },
            { key: 'shop' as NavKey, x: 42 },
            { key: 'social' as NavKey, x: 124 },
        ].forEach((item) => {
            const zone = scene.add.zone(item.x, 0, 68, stitchedNavHeight);
            zone.setInteractive({ useHandCursor: item.key !== activeKey });
            if (item.key !== activeKey) zone.on('pointerdown', () => onClick(item.key));
            nav.add(zone);
        });
        return nav;
    }

    const nav = scene.add.container(0, height - 80);
    nav.setDepth(900);

    const navBarKey = firstTexture(scene, ['ui_asset_nav_bar', 'ui_nav_bar']);
    const navActiveKey = firstTexture(scene, ['ui_asset_nav_active', 'ui_nav_active']);

    if (navBarKey) {
        const bg = scene.add.nineslice(width / 2, 39, navBarKey, undefined, width - 14, 74, 60, 60, 32, 32);
        nav.add(bg);
    } else {
        const bg = scene.add.graphics();
        bg.fillGradientStyle(0x111827, 0x111827, 0x060b14, 0x060b14, 0.98);
        bg.fillRoundedRect(8, 0, width - 16, 76, 15);
        bg.lineStyle(1.5, 0x34435f, 0.85);
        bg.strokeRoundedRect(8, 0, width - 16, 76, 15);
        bg.fillStyle(0xffffff, 0.055);
        bg.fillRoundedRect(18, 7, width - 36, 8, 4);
        nav.add(bg);
    }

    const items: { key: NavKey; label: string }[] = [
        { key: 'lobby', label: ko.common.battle },
        { key: 'deck', label: ko.common.deck },
        { key: 'shop', label: ko.common.shop },
        { key: 'social', label: ko.common.clan },
    ];

    items.forEach((item, i) => {
        const x = 45 + i * 90;
        const active = item.key === activeKey;
        const c = scene.add.container(x, 37);
        if (active) {
            if (navActiveKey) {
                const activeBg = scene.add.nineslice(0, -8, navActiveKey, undefined, 54, 54, 22, 22, 22, 22);
                activeBg.setTint(0x79a7ff);
                c.add(activeBg);
            } else {
                c.add(addButtonBackplate(scene, -27, -35, 54, 54, 12, 0x4f7dff, 0x14328f, 0xb8c4ff));
            }
        }
        const icon = addNavIcon(scene, item.key, 0, -16, active ? 0xffffff : 0x9aa6c7);
        icon.setAlpha(active ? 1 : 0.72);
        c.add(icon);
        c.add(scene.add.text(0, 13, item.label, {
            fontSize: '9px',
            fontFamily: UI_FONT,
            fontStyle: '900',
            color: active ? '#ffffff' : '#9aa6c7',
            stroke: '#000000',
            strokeThickness: 1.25,
        }).setOrigin(0.5).setResolution(2));
        c.setSize(76, 64);
        c.setInteractive({ useHandCursor: true });
        if (!active) c.on('pointerdown', () => onClick(item.key));
        nav.add(c);
    });

    return nav;
}

export function addNavIcon(scene: Phaser.Scene, key: NavKey | string, x: number, y: number, color: number) {
    const textureByKey: Record<string, string> = {
        lobby: 'ui_icon_battle',
        battle: 'ui_icon_battle',
        deck: 'ui_icon_deck',
        shop: 'ui_icon_shop',
        social: 'ui_icon_clan',
        clan: 'ui_icon_clan',
    };
    const textureKey = textureByKey[key];
    if (textureKey && scene.textures.exists(textureKey)) {
        const icon = scene.add.image(x, y, textureKey);
        icon.setDisplaySize(27, 27);
        icon.setTint(color);
        return icon;
    }

    const g = scene.add.graphics();
    g.lineStyle(2.15, color, 0.96);
    g.fillStyle(color, 0.96);

    if (key === 'lobby') {
        g.lineBetween(x - 10, y - 8, x + 8, y + 10);
        g.lineBetween(x + 10, y - 8, x - 8, y + 10);
        g.fillTriangle(x + 8, y + 10, x + 13, y + 13, x + 10, y + 6);
        g.fillTriangle(x - 8, y + 10, x - 13, y + 13, x - 10, y + 6);
    } else if (key === 'deck') {
        g.strokeRoundedRect(x - 8, y - 10, 15, 18, 3);
        g.strokeRoundedRect(x - 3, y - 7, 15, 18, 3);
        g.lineBetween(x - 4, y - 3, x + 5, y - 3);
    } else if (key === 'shop') {
        g.strokeRoundedRect(x - 10, y - 5, 20, 16, 3);
        g.lineBetween(x - 5, y - 5, x - 5, y - 11);
        g.lineBetween(x + 5, y - 5, x + 5, y - 11);
        g.lineBetween(x - 5, y - 11, x + 5, y - 11);
        g.fillCircle(x, y + 2, 1.6);
    } else {
        g.fillCircle(x - 7, y - 4, 3.2);
        g.fillCircle(x + 7, y - 4, 3.2);
        g.fillCircle(x, y - 10, 3.4);
        g.strokeRoundedRect(x - 12, y + 1, 24, 10, 5);
    }

    return g;
}

function addButtonBackplate(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    top: number,
    bottom: number,
    edge: number
) {
    const g = scene.add.graphics();
    g.fillGradientStyle(top, top, bottom, bottom, 1);
    g.fillRoundedRect(x, y, width, height, radius);
    g.lineStyle(1.5, edge, 0.85);
    g.strokeRoundedRect(x, y, width, height, radius);
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(x + 6, y + 6, width - 12, 6, 3);
    return g;
}
