import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Jimp, ResizeStrategy, intToRGBA, rgbaToInt } from 'jimp';

const ASSET_DIR = path.resolve('public/assets/battle/royal_valley_parts');
const OUT_DIR = path.join(ASSET_DIR, 'normalized');

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
    { file: 'rubble_red_princess.png', type: 'princess' },
    { file: 'rubble_blue_king.png', type: 'king' },
    { file: 'rubble_red_king.png', type: 'king' },
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

await mkdir(OUT_DIR, { recursive: true });

for (const asset of assets) {
    const spec = specs[asset.type];
    const source = await Jimp.read(path.join(ASSET_DIR, asset.file));
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

    cropped.resize({ w: width, h: height, mode: ResizeStrategy.BICUBIC });
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

    const normalizedBounds = findOpaqueBounds(output);
    const safe = normalizedBounds.x > 0
        && normalizedBounds.y > 0
        && normalizedBounds.x + normalizedBounds.width < spec.canvasWidth
        && normalizedBounds.y + normalizedBounds.height < spec.canvasHeight;
    if (!safe) {
        throw new Error(`${asset.file} does not have a transparent safety margin.`);
    }

    console.log(
        `${asset.file}: ${bounds.width}x${bounds.height} -> ${width}x${height} `
        + `on ${spec.canvasWidth}x${spec.canvasHeight} at (${x}, ${y})`,
    );
}
