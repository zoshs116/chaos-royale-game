import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Jimp, intToRGBA, rgbaToInt } from 'jimp';

const OUT_DIR = path.resolve('public/assets/ui/atlas');
const MANIFEST_PATH = path.resolve('public/assets/ui/manifest.json');

const BUTTONS = {
    primary: { top: 0x8bb9ff, mid: 0x315ff0, bottom: 0x0d277f, edge: 0xe5eeff, bevel: 0x173ea8, glow: 0x5c8dff, shadow: 0x06122f },
    gold: { top: 0xffffa8, mid: 0xf0bd18, bottom: 0x9f5e00, edge: 0xffffd9, bevel: 0xb47a05, glow: 0xffd83f, shadow: 0x402604 },
    green: { top: 0x82ffab, mid: 0x19b85a, bottom: 0x06682b, edge: 0xd8ffe4, bevel: 0x0c873b, glow: 0x36e67a, shadow: 0x032213 },
    dark: { top: 0x677289, mid: 0x2a3348, bottom: 0x0b111d, edge: 0xc7d2ef, bevel: 0x121d32, glow: 0x7583a8, shadow: 0x030712 },
    purple: { top: 0xff95ff, mid: 0xaa18cf, bottom: 0x5f006f, edge: 0xffe0ff, bevel: 0x7b0c95, glow: 0xe146f0, shadow: 0x24002e },
};

const CARDS = {
    blue: { edge: 0x4f7dff, fill: 0x111827 },
    green: { edge: 0x22d35e, fill: 0x111827 },
    red: { edge: 0xff5151, fill: 0x111827 },
    purple: { edge: 0xd62ae8, fill: 0x111827 },
    gold: { edge: 0xffd83f, fill: 0x15120a },
};

function rgb(hex) {
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
}

function mix(a, b, t) {
    const ca = rgb(a);
    const cb = rgb(b);
    return rgbaToInt(
        Math.round(ca.r + (cb.r - ca.r) * t),
        Math.round(ca.g + (cb.g - ca.g) * t),
        Math.round(ca.b + (cb.b - ca.b) * t),
        255
    );
}

function color(hex, alpha = 1) {
    const c = rgb(hex);
    return rgbaToInt(c.r, c.g, c.b, Math.round(alpha * 255));
}

function blendPixel(img, x, y, incoming) {
    if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) return;
    const src = intToRGBA(incoming);
    if (src.a === 0) return;
    const dst = intToRGBA(img.getPixelColor(x, y));
    const sa = src.a / 255;
    const da = dst.a / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    const r = Math.round((src.r * sa + dst.r * da * (1 - sa)) / outA);
    const g = Math.round((src.g * sa + dst.g * da * (1 - sa)) / outA);
    const b = Math.round((src.b * sa + dst.b * da * (1 - sa)) / outA);
    img.setPixelColor(rgbaToInt(r, g, b, Math.round(outA * 255)), x, y);
}

function roundedAlpha(px, py, x, y, w, h, r) {
    const qx = Math.abs(px - (x + w / 2)) - w / 2 + r;
    const qy = Math.abs(py - (y + h / 2)) - h / 2 + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
    return Math.max(0, Math.min(1, 1 - dist));
}

function fillRounded(img, x, y, w, h, r, fill) {
    for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py += 1) {
        for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px += 1) {
            const a = roundedAlpha(px + 0.5, py + 0.5, x, y, w, h, r);
            if (a > 0) {
                const c = intToRGBA(fill);
                blendPixel(img, px, py, rgbaToInt(c.r, c.g, c.b, Math.round(c.a * a)));
            }
        }
    }
}

function fillGradientRounded(img, x, y, w, h, r, top, mid, bottom, alpha = 1) {
    for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py += 1) {
        const t = Math.max(0, Math.min(1, (py - y) / Math.max(1, h)));
        const c = intToRGBA(t < 0.5 ? mix(top, mid, t * 2) : mix(mid, bottom, (t - 0.5) * 2));
        for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px += 1) {
            const a = roundedAlpha(px + 0.5, py + 0.5, x, y, w, h, r);
            if (a > 0) blendPixel(img, px, py, rgbaToInt(c.r, c.g, c.b, Math.round(255 * alpha * a)));
        }
    }
}

function strokeRounded(img, x, y, w, h, r, strokeWidth, stroke) {
    for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py += 1) {
        for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px += 1) {
            const outer = roundedAlpha(px + 0.5, py + 0.5, x, y, w, h, r);
            const inner = roundedAlpha(
                px + 0.5,
                py + 0.5,
                x + strokeWidth,
                y + strokeWidth,
                w - strokeWidth * 2,
                h - strokeWidth * 2,
                Math.max(1, r - strokeWidth)
            );
            const a = Math.max(0, outer - inner);
            if (a > 0) {
                const c = intToRGBA(stroke);
                blendPixel(img, px, py, rgbaToInt(c.r, c.g, c.b, Math.round(c.a * a)));
            }
        }
    }
}

function fillRect(img, x, y, w, h, fill) {
    for (let py = Math.floor(y); py < Math.floor(y + h); py += 1) {
        for (let px = Math.floor(x); px < Math.floor(x + w); px += 1) blendPixel(img, px, py, fill);
    }
}

function fillCircle(img, cx, cy, radius, fill) {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
        for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
            const a = Math.max(0, Math.min(1, radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
            if (a > 0) {
                const c = intToRGBA(fill);
                blendPixel(img, x, y, rgbaToInt(c.r, c.g, c.b, Math.round(c.a * a)));
            }
        }
    }
}

async function write(img, name) {
    await img.write(path.join(OUT_DIR, name));
}

async function makeButton(tone, c, pressed = false) {
    const img = new Jimp({ width: 360, height: 116, color: rgbaToInt(0, 0, 0, 0) });
    const y = pressed ? 18 : 12;
    fillRounded(img, 14, 24, 332, 80, 24, color(c.shadow, pressed ? 0.5 : 0.76));
    fillRounded(img, 10, 10 + (pressed ? 4 : 0), 340, 88, 25, color(c.glow, pressed ? 0.12 : 0.28));
    fillRounded(img, 20, 8 + (pressed ? 4 : 0), 320, 76, 22, color(0xffffff, pressed ? 0.06 : 0.14));
    fillGradientRounded(img, 20, y, 320, 72, 20, c.top, c.mid, c.bottom, 1);
    fillRounded(img, 24, y + 52, 312, 16, 9, color(c.bevel, pressed ? 0.5 : 0.82));
    strokeRounded(img, 20, y, 320, 72, 20, 5, color(c.edge, pressed ? 0.56 : 0.98));
    fillRounded(img, 44, y + 12, 272, 10, 5, color(0xffffff, pressed ? 0.1 : 0.26));
    fillCircle(img, 42, y + 32, 5, color(c.edge, pressed ? 0.18 : 0.34));
    fillCircle(img, 318, y + 32, 5, color(c.edge, pressed ? 0.18 : 0.34));
    fillCircle(img, 42, y + 62, 5, color(c.edge, pressed ? 0.18 : 0.34));
    fillCircle(img, 318, y + 62, 5, color(c.edge, pressed ? 0.18 : 0.34));
    await write(img, `ui_asset_button_${tone}${pressed ? '_pressed' : ''}.png`);
}

async function makePanel() {
    const img = new Jimp({ width: 960, height: 480, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 24, 36, 912, 396, 34, color(0x000000, 0.5));
    fillGradientRounded(img, 28, 24, 904, 386, 32, 0x25314b, 0x111a2c, 0x050b16, 1);
    strokeRounded(img, 28, 24, 904, 386, 32, 6, color(0x61739f, 0.95));
    strokeRounded(img, 48, 44, 864, 330, 22, 2, color(0xd8e2ff, 0.24));
    fillRounded(img, 62, 54, 836, 26, 13, color(0xffffff, 0.08));
    fillRounded(img, 60, 380, 840, 34, 17, color(0x7aa4ff, 0.08));
    for (let i = 0; i < 18; i += 1) fillRounded(img, 76 + i * 46, 94, 18, 264, 9, color(i % 2 === 0 ? 0xffffff : 0x6f88bd, i % 2 === 0 ? 0.035 : 0.05));
    await write(img, 'ui_asset_panel_dark.png');
}

async function makeHeaderBar() {
    const img = new Jimp({ width: 960, height: 190, color: rgbaToInt(0, 0, 0, 0) });
    fillGradientRounded(img, 0, 8, 960, 154, 0, 0x1c263b, 0x111827, 0x070d18, 1);
    strokeRounded(img, 0, 8, 960, 154, 0, 4, color(0x303a56, 0.96));
    fillRounded(img, 44, 22, 872, 10, 5, color(0xffffff, 0.06));
    fillRounded(img, 26, 148, 908, 4, 2, color(0xb8c4ff, 0.14));
    fillRounded(img, 52, 56, 122, 58, 18, color(0x0b111f, 0.4));
    fillRounded(img, 786, 56, 122, 58, 18, color(0x0b111f, 0.4));
    await write(img, 'ui_asset_header_bar.png');
}

async function makeCurrencyPill() {
    const img = new Jimp({ width: 280, height: 104, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 14, 22, 252, 66, 24, color(0x000000, 0.44));
    fillGradientRounded(img, 10, 10, 260, 70, 22, 0x1d2740, 0x101725, 0x060b14, 1);
    strokeRounded(img, 10, 10, 260, 70, 22, 4, color(0xd6a626, 0.78));
    strokeRounded(img, 22, 20, 236, 50, 14, 2, color(0xffffff, 0.14));
    fillRounded(img, 34, 21, 212, 9, 5, color(0xffffff, 0.08));
    await write(img, 'ui_asset_currency_pill.png');
}

async function makeNavBar() {
    const img = new Jimp({ width: 960, height: 200, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 18, 24, 924, 148, 38, color(0x000000, 0.62));
    fillGradientRounded(img, 24, 12, 912, 154, 36, 0x1d2740, 0x0a101d, 0x03060c, 1);
    strokeRounded(img, 24, 12, 912, 154, 36, 5, color(0x3f5173, 0.96));
    strokeRounded(img, 42, 28, 876, 116, 26, 2, color(0xdce7ff, 0.15));
    fillRounded(img, 58, 28, 844, 20, 10, color(0xffffff, 0.075));
    fillRounded(img, 58, 142, 844, 22, 11, color(0x000000, 0.26));
    await write(img, 'ui_asset_nav_bar.png');
}

async function makeSlot(name, accent, locked = false) {
    const img = new Jimp({ width: 220, height: 220, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 20, 24, 180, 176, 24, color(0x000000, 0.5));
    fillGradientRounded(img, 18, 14, 184, 176, 22, locked ? 0x202635 : 0x192133, locked ? 0x0b101a : 0x090d17, 0x04070e, 1);
    strokeRounded(img, 18, 14, 184, 176, 22, 4, color(accent, locked ? 0.36 : 0.72));
    strokeRounded(img, 34, 30, 152, 136, 13, 2, color(0xffffff, locked ? 0.08 : 0.17));
    fillRounded(img, 42, 38, 136, 12, 6, color(0xffffff, locked ? 0.035 : 0.07));
    if (locked) {
        fillRounded(img, 78, 76, 64, 52, 10, color(0x202738, 0.76));
        strokeRounded(img, 78, 76, 64, 52, 10, 3, color(0x6b7280, 0.64));
        fillRounded(img, 94, 58, 32, 34, 14, color(0x000000, 0));
        strokeRounded(img, 94, 58, 32, 34, 14, 5, color(0x7c879e, 0.7));
    }
    await write(img, `ui_asset_${name}.png`);
}

async function makeToastPanel() {
    const img = new Jimp({ width: 720, height: 150, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 16, 34, 688, 86, 28, color(0x000000, 0.5));
    fillGradientRounded(img, 14, 22, 692, 86, 26, 0x315ff0, 0x1e40af, 0x10245f, 0.98);
    strokeRounded(img, 14, 22, 692, 86, 26, 4, color(0xb8c4ff, 0.92));
    fillRounded(img, 46, 38, 628, 10, 5, color(0xffffff, 0.16));
    await write(img, 'ui_asset_toast_panel.png');
}

async function makeNavActive() {
    const img = new Jimp({ width: 160, height: 160, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 22, 28, 116, 116, 30, color(0x000000, 0.42));
    fillRounded(img, 18, 18, 124, 122, 31, color(0x79a7ff, 0.24));
    fillGradientRounded(img, 24, 18, 112, 112, 28, 0x83b1ff, 0x2f64f2, 0x112f8a, 1);
    strokeRounded(img, 24, 18, 112, 112, 28, 5, color(0xe7eeff, 0.96));
    fillRounded(img, 42, 34, 76, 14, 7, color(0xffffff, 0.24));
    await write(img, 'ui_asset_nav_active.png');
}

async function makeCard(name, c) {
    const img = new Jimp({ width: 240, height: 300, color: rgbaToInt(0, 0, 0, 0) });
    fillRounded(img, 12, 22, 216, 252, 22, color(0x000000, 0.58));
    fillRounded(img, 8, 8, 224, 260, 22, color(c.edge, 0.18));
    fillGradientRounded(img, 16, 10, 208, 248, 18, 0x26324d, c.fill, 0x050a14, 1);
    strokeRounded(img, 16, 10, 208, 248, 18, 6, color(c.edge, 0.98));
    strokeRounded(img, 30, 24, 180, 220, 10, 2, color(0xffffff, 0.3));
    fillRounded(img, 38, 31, 164, 14, 7, color(0xffffff, 0.13));
    fillRounded(img, 34, 218, 172, 42, 10, color(0x000000, 0.28));
    strokeRounded(img, 34, 218, 172, 42, 10, 2, color(c.edge, 0.45));
    fillRounded(img, 24, 22, 14, 208, 7, color(c.edge, 0.38));
    fillRounded(img, 202, 22, 14, 208, 7, color(c.edge, 0.38));
    for (const [x, y] of [[32, 30], [208, 30], [32, 244], [208, 244]]) fillCircle(img, x, y, 7, color(c.edge, 0.75));
    await write(img, `ui_asset_card_${name}.png`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const [tone, spec] of Object.entries(BUTTONS)) {
    await makeButton(tone, spec, false);
    await makeButton(tone, spec, true);
}
await makePanel();
await makeHeaderBar();
await makeCurrencyPill();
await makeNavBar();
await makeNavActive();
await makeSlot('slot_empty', 0x6273ac, false);
await makeSlot('slot_locked', 0x6273ac, true);
await makeToastPanel();
for (const [name, spec] of Object.entries(CARDS)) await makeCard(name, spec);

await writeFile(MANIFEST_PATH, JSON.stringify({
    version: 1,
    scale: 3,
    generatedBy: 'scripts/generate-ui-atlas.mjs',
    nineslice: {
        button: { left: 34, right: 34, top: 18, bottom: 18 },
        panel: { left: 44, right: 44, top: 44, bottom: 44 },
        header: { left: 32, right: 32, top: 24, bottom: 24 },
        currencyPill: { left: 32, right: 32, top: 24, bottom: 24 },
        navBar: { left: 60, right: 60, top: 32, bottom: 32 },
        navActive: { left: 22, right: 22, top: 22, bottom: 22 },
        slot: { left: 26, right: 26, top: 26, bottom: 26 },
        toast: { left: 36, right: 36, top: 28, bottom: 28 },
        card: { left: 22, right: 22, top: 24, bottom: 24 }
    },
    assets: [
        ...Object.keys(BUTTONS).flatMap((tone) => [`ui_asset_button_${tone}`, `ui_asset_button_${tone}_pressed`]),
        'ui_asset_panel_dark',
        'ui_asset_header_bar',
        'ui_asset_currency_pill',
        'ui_asset_nav_bar',
        'ui_asset_nav_active',
        'ui_asset_slot_empty',
        'ui_asset_slot_locked',
        'ui_asset_toast_panel',
        ...Object.keys(CARDS).map((name) => `ui_asset_card_${name}`)
    ]
}, null, 2));

console.log(`Generated UI atlas PNGs in ${OUT_DIR}`);
