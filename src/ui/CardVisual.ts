import Phaser from 'phaser';
import { FACTION_COLORS, UNIT_FACTIONS, UNIT_TYPES } from '../data/UnitData';
import type { Faction } from '../data/UnitData';
import { GAME_FONT, fitUnitNameKo, ko } from '../i18n/ko';

const UI_FONT = GAME_FONT;

export function cardFrameKey(faction?: Faction) {
    if (faction === 'sentinel') return 'ui_asset_card_blue';
    if (faction === 'scourge') return 'ui_asset_card_red';
    if (faction === 'neutral') return 'ui_asset_card_gold';
    return 'ui_asset_card_green';
}

export function resolveUnitTexture(scene: Phaser.Scene, unitKey: string) {
    const data = UNIT_TYPES[unitKey];
    const cardPortraitKey = `portrait_card_${unitKey}`;
    const hdPortraitKey = `portrait_hd_${unitKey}`;
    const portraitKey = `portrait_${unitKey}`;
    const spriteKey = `unit_${data?.spriteKey || unitKey}_blue`;
    if (scene.textures.exists(cardPortraitKey)) return cardPortraitKey;
    if (scene.textures.exists(hdPortraitKey)) return hdPortraitKey;
    if (scene.textures.exists(portraitKey)) return portraitKey;
    if (scene.textures.exists(spriteKey)) return spriteKey;
    return 'unit_generic_blue';
}

export function fitUnitName(unitKey: string, maxLength = 12) {
    return fitUnitNameKo(unitKey, Math.max(4, Math.min(8, maxLength)));
}

export function factionAccent(unitKey: string) {
    const faction = UNIT_FACTIONS[unitKey]?.faction;
    return faction ? FACTION_COLORS[faction] : 0xb8c4ff;
}

export function unitRarity(unitKey: string) {
    const cost = UNIT_TYPES[unitKey]?.cost ?? 3;
    if (cost >= 7) return { label: ko.rarity.legendary, color: 0xffd83f, text: '#2b1800' };
    if (cost >= 5) return { label: ko.rarity.epic, color: 0xd62ae8, text: '#ffffff' };
    if (cost >= 3) return { label: ko.rarity.rare, color: 0x4f7dff, text: '#ffffff' };
    return { label: ko.rarity.common, color: 0x8e99bd, text: '#ffffff' };
}

export function createCardOrnaments(
    scene: Phaser.Scene,
    unitKey: string,
    width: number,
    height: number,
    compact = false
) {
    const container = scene.add.container(0, 0);
    const accent = factionAccent(unitKey);
    const corner = Math.max(8, Math.min(16, width * 0.14));

    const topLight = rounded(scene, -width / 2 + 8, -height / 2 + 7, width - 16, compact ? 4 : 6, 3, 0xffffff, compact ? 0.08 : 0.11);
    const bottomDepth = rounded(scene, -width / 2 + 7, height / 2 - (compact ? 17 : 22), width - 14, compact ? 12 : 16, 5, 0x000000, compact ? 0.22 : 0.28);
    const leftRail = rounded(scene, -width / 2 + 3, -height / 2 + corner, compact ? 3 : 4, height - corner * 2, 2, accent, compact ? 0.24 : 0.32);
    const rightRail = rounded(scene, width / 2 - (compact ? 6 : 7), -height / 2 + corner, compact ? 3 : 4, height - corner * 2, 2, accent, compact ? 0.16 : 0.22);

    const shine = scene.add.graphics();
    shine.fillStyle(0xffffff, compact ? 0.035 : 0.055);
    shine.fillTriangle(-width / 2 + 12, -height / 2 + 16, width / 2 - 16, -height / 2 + 10, -width / 2 + 12, height / 2 - 28);

    container.add([topLight, bottomDepth, leftRail, rightRail, shine]);
    return container;
}

export function createPortraitPanel(
    scene: Phaser.Scene,
    unitKey: string,
    x: number,
    y: number,
    width: number,
    height: number,
    accent = factionAccent(unitKey)
) {
    const container = scene.add.container(x, y);
    const shadow = rounded(scene, -width / 2 + 2, -height / 2 + 4, width, height, 8, 0x000000, 0.28);
    const base = rounded(scene, -width / 2, -height / 2, width, height, 8, 0x070d18, 0.98, 0x53617f, 0.62, 1);
    const glow = rounded(scene, -width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 6, accent, 0.12);
    const artBackdrop = createPortraitBackdrop(scene, width, height, accent);
    const image = scene.add.image(0, 0, resolveUnitTexture(scene, unitKey));
    fitPortraitImage(image, width - 13, height - 11);
    image.setAlpha(0.98);
    const shine = rounded(scene, -width / 2 + 7, -height / 2 + 6, width - 14, Math.max(12, height * 0.22), 5, 0xffffff, 0.08);
    const topMatte = rounded(scene, -width / 2 + 6, -height / 2 + 5, width - 12, Math.max(10, height * 0.18), 5, 0xffffff, 0.055);
    const vignette = createPortraitVignette(scene, width, height, accent);
    const bottomShade = rounded(scene, -width / 2 + 5, height / 2 - Math.max(18, height * 0.25), width - 10, Math.max(16, height * 0.22), 5, 0x000000, 0.4);
    const innerStroke = rounded(scene, -width / 2 + 6, -height / 2 + 5, width - 12, height - 10, 5, 0x000000, 0, 0xffffff, 0.13, 1);
    const rim = rounded(scene, -width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 7, accent, 0, accent, 0.28, 1.5);
    container.add([shadow, base, glow, artBackdrop, image, vignette, bottomShade, topMatte, shine, innerStroke, rim]);
    return { container, image };
}

export function createCostBadge(scene: Phaser.Scene, x: number, y: number, cost: number, size = 20) {
    const container = scene.add.container(x, y);
    const shadow = scene.add.circle(2, 3, size / 2 + 1, 0x000000, 0.34);
    const bg = scene.add.circle(0, 0, size / 2, 0xba19d4, 1);
    bg.setStrokeStyle(2, 0xffd6ff, 0.92);
    const inner = scene.add.circle(-2, -2, size / 3, 0xffffff, 0.13);
    const text = scene.add.text(0, -1, String(cost), {
        fontSize: `${Math.max(8, Math.floor(size * 0.54))}px`,
        fontFamily: UI_FONT,
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#14001e',
        strokeThickness: 3,
    }).setOrigin(0.5).setResolution(2);
    container.add([shadow, bg, inner, text]);
    return { container, bg, text };
}

export function createFactionBadge(scene: Phaser.Scene, x: number, y: number, faction: Faction | undefined, size = 18) {
    const color = faction ? FACTION_COLORS[faction] : 0xb8c4ff;
    const label = faction ? ko.filters.factions[faction].slice(0, 1) : '?';
    const container = scene.add.container(x, y);
    const bg = scene.add.circle(0, 0, size / 2, color, 0.96);
    bg.setStrokeStyle(1, 0xffffff, 0.28);
    const text = scene.add.text(0, 0, label, {
        fontSize: `${Math.max(8, Math.floor(size * 0.5))}px`,
        fontFamily: UI_FONT,
        fontStyle: '900',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
    }).setOrigin(0.5).setResolution(2);
    container.add([bg, text]);
    return container;
}

export function createNameplate(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    unitKey: string,
    fontSize = 9,
    tint = '#edf3ff'
) {
    const container = scene.add.container(x, y);
    const bg = rounded(scene, -width / 2, -11, width, 22, 6, 0x050b16, 0.9, 0x5c6b93, 0.46, 1);
    const text = scene.add.text(0, 0, fitUnitName(unitKey, Math.max(9, Math.floor(width / 8))), {
        fontSize: `${fontSize}px`,
        fontFamily: UI_FONT,
        fontStyle: '900',
        color: tint,
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
    }).setOrigin(0.5).setResolution(2);
    container.add([bg, text]);
    return { container, text };
}

export function createShardBar(scene: Phaser.Scene, x: number, y: number, width: number, progress: number, accent = 0xb8c4ff) {
    const container = scene.add.container(x, y);
    const track = rounded(scene, -width / 2, -3, width, 6, 3, 0x151d2d, 1, 0x445171, 0.6, 1);
    const fillWidth = Phaser.Math.Clamp(width * progress, 8, width);
    const fill = rounded(scene, -width / 2 + 1, -2, fillWidth - 2, 4, 2, accent, 0.95);
    const gloss = rounded(scene, -width / 2 + 2, -2, Math.max(4, fillWidth - 4), 1.5, 1, 0xffffff, 0.32);
    container.add([track, fill, gloss]);
    return container;
}

function rounded(
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

export function fitPortraitImage(image: Phaser.GameObjects.Image, maxWidth: number, maxHeight: number) {
    const sourceWidth = Math.max(1, image.width || maxWidth);
    const sourceHeight = Math.max(1, image.height || maxHeight);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    image.setDisplaySize(Math.max(1, sourceWidth * scale), Math.max(1, sourceHeight * scale));
}

function createPortraitBackdrop(scene: Phaser.Scene, width: number, height: number, accent: number) {
    const g = scene.add.graphics();
    const x = -width / 2 + 6;
    const y = -height / 2 + 5;
    const w = width - 12;
    const h = height - 10;
    g.fillGradientStyle(0x192238, 0x192238, 0x080d18, 0x050912, 1);
    g.fillRoundedRect(x, y, w, h, 6);
    g.fillStyle(accent, 0.16);
    g.fillTriangle(x, y + h, x + w, y + h * 0.25, x + w, y + h);
    g.fillStyle(0xffffff, 0.045);
    g.fillRoundedRect(x + 5, y + 5, w - 10, Math.max(6, h * 0.12), 4);
    return g;
}

function createPortraitVignette(scene: Phaser.Scene, width: number, height: number, accent: number) {
    const g = scene.add.graphics();
    const x = -width / 2 + 6;
    const y = -height / 2 + 5;
    const w = width - 12;
    const h = height - 10;
    g.fillStyle(accent, 0.1);
    g.fillRoundedRect(x, y, w, h, 6);
    g.fillStyle(0x000000, 0.24);
    g.fillRoundedRect(x, y + h * 0.68, w, h * 0.32, 5);
    g.fillStyle(0x000000, 0.18);
    g.fillRect(x, y, 5, h);
    g.fillRect(x + w - 5, y, 5, h);
    return g;
}
