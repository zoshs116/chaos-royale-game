import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Jimp, ResizeStrategy, intToRGBA, rgbaToInt } from 'jimp';

const ASSET_DIR = path.resolve('public/assets/battle/royal_valley_parts');
const OUT_DIR = path.join(ASSET_DIR, 'normalized');
const RESTORED_DIR = path.join(ASSET_DIR, 'restored');

const specs = {
    princess: {
        canvasWidth: 160,
        canvasHeight: 128,
        contentWidth: 144,
        contentHeight: 104,
        baselineY: 120,
    },
    king: {
        canvasWidth: 176,
        canvasHeight: 176,
        contentWidth: 156,
        contentHeight: 156,
        baselineY: 166,
    },
};

const assets = [
    { file: 'rubble_blue_princess.png', type: 'princess' },
    {
        file: 'rubble_red_princess.png',
        type: 'princess',
        damagedFile: 'tower_red_princess_damaged.png',
        restore: {
            baseCropYRatio: 0.57,
            baseWidth: 96,
            baseHeight: 62,
            rubbleCropHeightRatio: 0.77,
            rubbleWidth: 136,
            rubbleHeight: 82,
            rubbleY: 18,
        },
    },
    { file: 'rubble_blue_king.png', type: 'king' },
    {
        file: 'rubble_red_king.png',
        type: 'king',
        damagedFile: 'tower_red_king_damaged.png',
        restore: {
            baseCropYRatio: 0.57,
            baseWidth: 120,
            baseHeight: 86,
            rubbleCropHeightRatio: 0.76,
            rubbleWidth: 158,
            rubbleHeight: 118,
            rubbleY: 14,
        },
    },
];

function findOpaqueBounds(image) {
    const { width, height } = image.bitmap;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (intToRGBA(image.getPixelColor(x, y)).a <= 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) {
        throw new Error('Rubble source contains no visible pixels.');
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
    };
}

function clearTransparentRgb(image) {
    const { width, height } = image.bitmap;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const rgba = intToRGBA(image.getPixelColor(x, y));
            if (rgba.a === 0) {
                image.setPixelColor(rgbaToInt(0, 0, 0, 0), x, y);
            }
        }
    }
}

async function restoreRedRubble(asset, spec) {
    const rubbleSource = await Jimp.read(path.join(ASSET_DIR, asset.file));
    const damagedSource = await Jimp.read(path.join(ASSET_DIR, asset.damagedFile));
    const rubbleBounds = findOpaqueBounds(rubbleSource);
    const damagedBounds = findOpaqueBounds(damagedSource);
    const restore = asset.restore;

    const baseCropY = damagedBounds.y + Math.round(damagedBounds.height * restore.baseCropYRatio);
    const baseCropHeight = damagedBounds.y + damagedBounds.height - baseCropY;
    const base = damagedSource.clone().crop({
        x: damagedBounds.x,
        y: baseCropY,
        w: damagedBounds.width,
        h: baseCropHeight,
    });
    base.resize({
        w: restore.baseWidth,
        h: restore.baseHeight,
        mode: ResizeStrategy.NEAREST_NEIGHBOR,
    });

    const rubbleCropHeight = Math.max(
        1,
        Math.round(rubbleBounds.height * restore.rubbleCropHeightRatio),
    );
    const rubble = rubbleSource.clone().crop({
        x: rubbleBounds.x,
        y: rubbleBounds.y,
        w: rubbleBounds.width,
        h: rubbleCropHeight,
    });
    rubble.resize({
        w: restore.rubbleWidth,
        h: restore.rubbleHeight,
        mode: ResizeStrategy.NEAREST_NEIGHBOR,
    });

    const output = new Jimp({
        width: spec.canvasWidth,
        height: spec.canvasHeight,
        color: 0x00000000,
    });
    const baseX = Math.round((spec.canvasWidth - restore.baseWidth) / 2);
    const baseY = spec.baselineY - restore.baseHeight;
    const rubbleX = Math.round((spec.canvasWidth - restore.rubbleWidth) / 2);
    output.composite(base, baseX, baseY);
    output.composite(rubble, rubbleX, restore.rubbleY);
    clearTransparentRgb(output);
    return output;
}

function assertTransparentMargin(file, image, spec) {
    const bounds = findOpaqueBounds(image);
    const margins = {
        left: bounds.x,
        top: bounds.y,
        right: spec.canvasWidth - (bounds.x + bounds.width),
        bottom: spec.canvasHeight - (bounds.y + bounds.height),
    };
    const minimumMargin = 4;
    if (Object.values(margins).some((margin) => margin < minimumMargin)) {
        throw new Error(`${file} has an unsafe transparent margin: ${JSON.stringify(margins)}`);
    }
    if (Math.abs(bounds.y + bounds.height - spec.baselineY) > 1) {
        throw new Error(`${file} does not match baseline ${spec.baselineY}.`);
    }
    return bounds;
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(RESTORED_DIR, { recursive: true });
const normalizedBoundsByType = new Map();

for (const asset of assets) {
    const spec = specs[asset.type];
    const restored = asset.restore ? await restoreRedRubble(asset, spec) : null;
    if (restored) {
        await restored.write(path.join(RESTORED_DIR, asset.file));
    }
    const source = restored ?? await Jimp.read(path.join(ASSET_DIR, asset.file));
    const bounds = findOpaqueBounds(source);
    const cropped = source.clone().crop({
        x: bounds.x,
        y: bounds.y,
        w: bounds.width,
        h: bounds.height,
    });
    const scale = Math.min(
        spec.contentWidth / cropped.bitmap.width,
        spec.contentHeight / cropped.bitmap.height,
    );
    const width = Math.max(1, Math.round(cropped.bitmap.width * scale));
    const height = Math.max(1, Math.round(cropped.bitmap.height * scale));

    cropped.resize({
        w: width,
        h: height,
        mode: asset.restore ? ResizeStrategy.NEAREST_NEIGHBOR : ResizeStrategy.BICUBIC,
    });
    const output = new Jimp({
        width: spec.canvasWidth,
        height: spec.canvasHeight,
        color: 0x00000000,
    });
    const x = Math.round((spec.canvasWidth - width) / 2);
    const y = spec.baselineY - height;
    output.composite(cropped, x, y);
    clearTransparentRgb(output);

    const outputPath = path.join(OUT_DIR, asset.file);
    await output.write(outputPath);

    const normalizedBounds = assertTransparentMargin(asset.file, output, spec);
    const team = asset.file.includes('_red_') ? 'red' : 'blue';
    const typeBounds = normalizedBoundsByType.get(asset.type) ?? {};
    typeBounds[team] = normalizedBounds;
    normalizedBoundsByType.set(asset.type, typeBounds);

    console.log(
        `${asset.file}: ${bounds.width}x${bounds.height} -> ${width}x${height} `
        + `on ${spec.canvasWidth}x${spec.canvasHeight} at (${x}, ${y}), `
        + `visible ${normalizedBounds.width}x${normalizedBounds.height}`,
    );
}

for (const [type, boundsByTeam] of normalizedBoundsByType) {
    const blue = boundsByTeam.blue;
    const red = boundsByTeam.red;
    if (!blue || !red) {
        throw new Error(`${type} rubble parity check is missing a team.`);
    }

    const widthDelta = Math.abs(red.width - blue.width) / blue.width;
    const heightDelta = Math.abs(red.height - blue.height) / blue.height;
    const maximumDelta = 0.08;
    if (widthDelta > maximumDelta || heightDelta > maximumDelta) {
        throw new Error(
            `${type} rubble footprint mismatch: `
            + `blue=${blue.width}x${blue.height}, red=${red.width}x${red.height}`,
        );
    }
}
