import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    DUCKXEL_ASSET_PROFILES,
    DUCKXEL_BATTLE_DIRECTIONS,
    getDuckxelPreviewFramePath,
    resolveDuckxelDirectionAnimation,
} from '../../src/data/DuckxelAnimationCatalog';
import type { DuckxelAssetProfile } from '../../src/data/DuckxelAnimationCatalog';

for (const profile of Object.values(DUCKXEL_ASSET_PROFILES)) {
    assert(profile.previewActions.walk, `${profile.unitKey}: walk preview is required`);
    for (const [action, actionDefinition] of Object.entries(profile.previewActions)) {
        assert(actionDefinition, `${profile.unitKey}: ${action} definition is required`);
        for (const direction of DUCKXEL_BATTLE_DIRECTIONS) {
            const resolved = resolveDuckxelDirectionAnimation(profile, action as 'walk' | 'attack' | 'skill', direction);
            assert(resolved, `${profile.unitKey}: ${action} ${direction} cannot be resolved`);
            assert(resolved.directionDefinition.fps > 0, `${profile.unitKey}: ${action} ${direction} fps must be positive`);
            for (let frame = 0; frame < resolved.directionDefinition.frameCount; frame += 1) {
                const url = getDuckxelPreviewFramePath(profile, action as 'walk' | 'attack' | 'skill', direction, frame);
                assert(url, `${profile.unitKey}: ${action} ${direction} frame ${frame} has no URL`);
                assert(existsSync(join(process.cwd(), 'public', url.slice(1))), `${profile.unitKey}: missing ${url}`);
            }
        }
    }
}

const mirrorProfile: DuckxelAssetProfile = structuredClone(DUCKXEL_ASSET_PROFILES.duckxel_sword_man);
delete mirrorProfile.previewActions.walk?.directions['north-east'];
const mirrored = resolveDuckxelDirectionAnimation(mirrorProfile, 'walk', 'north-east');
assert.equal(mirrored?.sourceDirection, 'north-west');
assert.equal(mirrored?.flipX, true);

const muradinNorthWestSkill = resolveDuckxelDirectionAnimation(
    DUCKXEL_ASSET_PROFILES.duckxel_muradin,
    'skill',
    'north-west',
);
assert.equal(muradinNorthWestSkill?.sourceDirection, 'north-east');
assert.equal(muradinNorthWestSkill?.flipX, true);
assert.equal(muradinNorthWestSkill?.directionDefinition.frameCount, 5);

console.log('[duckxel-animation-catalog-smoke] all checks passed');
