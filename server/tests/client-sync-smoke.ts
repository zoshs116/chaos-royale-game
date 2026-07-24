import assert from 'node:assert/strict';
import BattleViewTransform from '../../src/multiplayer/BattleViewTransform';
import RemoteBattleTimeline from '../../src/multiplayer/RemoteBattleTimeline';
import ServerClockEstimator from '../../src/multiplayer/ServerClockEstimator';
import type { RemoteBattleSnapshot } from '../../src/multiplayer/BattleSocketClient';

const blueView = new BattleViewTransform('blue');
const redView = new BattleViewTransform('red');
const worldPoint = { x: 86, y: 210 };
assert.deepEqual(blueView.worldToViewPoint(worldPoint), worldPoint);
assert.deepEqual(redView.viewToWorldPoint(redView.worldToViewPoint(worldPoint)), worldPoint);
assert.deepEqual(redView.worldToViewVector({ x: 0.5, y: -0.75 }), { x: -0.5, y: 0.75 });
assert.equal(redView.worldToVisualTeam('red'), 'blue');
assert.equal(redView.worldToVisualTeam('blue'), 'red');

const clock = new ServerClockEstimator();
clock.addPong(1_000, 1_100, 2_050);
clock.addPong(2_000, 2_080, 3_040);
assert.equal(clock.getDiagnostics().rttMs, 80);
assert.equal(clock.getDiagnostics().offsetMs, 1_000);
assert.equal(clock.estimateServerTime(2_500), 3_500);

const timeline = new RemoteBattleTimeline({ renderDelayMs: 0, maxSnapshots: 8 });
const first = makeSnapshot(10, 1, 1_000, 80, 200);
const second = makeSnapshot(14, 3, 1_120, 104, 176);
if (second.units[0]) {
    second.units[0].attackSerial = 1;
    second.units[0].attackTick = 14;
}
assert.equal(timeline.ingest(first), true);
assert.equal(timeline.ingest(second), true);
assert.equal(timeline.ingest(makeSnapshot(12, 2, 1_060, 92, 188)), false, 'stale snapshot must be dropped');
const sample = timeline.sample(1_060);
assert(sample);
assert.equal(sample.from.tick, 10);
assert.equal(sample.to.tick, 14);
assert.equal(sample.alpha, 0.5);
const rendered = timeline.materialize(sample);
assert.equal(rendered.units[0]?.x, 92);
assert.equal(rendered.units[0]?.y, 188);
assert.equal(rendered.units[0]?.attackSerial, 0, 'future attack must not play before its server tick');
const actionFrame = timeline.materialize(timeline.sample(1_120) as NonNullable<ReturnType<typeof timeline.sample>>);
assert.equal(actionFrame.units[0]?.attackSerial, 1, 'attack must become visible at the shared server time');
assert.equal(timeline.getDiagnostics().droppedSnapshots, 1);

const redRendered = redView.worldToViewPoint({ x: second.units[0]?.x ?? 0, y: second.units[0]?.y ?? 0 });
assert.deepEqual(redView.viewToWorldPoint(redRendered), { x: 104, y: 176 });
console.log('[client-sync-smoke] clock, ordering, timeline, and view transforms passed');

function makeSnapshot(
    tick: number,
    sequence: number,
    serverTimeMs: number,
    x: number,
    y: number,
): RemoteBattleSnapshot {
    return {
        roomId: 'sync-test',
        tick,
        sequence,
        serverTimeMs,
        state: 'running',
        paused: false,
        disconnectGraceRemainingMs: null,
        remainingMs: 180_000 - tick * (1_000 / 30),
        blueElixir: 5,
        redElixir: 5,
        blueKingHp: 4_000,
        redKingHp: 4_000,
        blueCrowns: 0,
        redCrowns: 0,
        ackByPlayer: {},
        players: [],
        units: [{
            id: 'unit-1',
            ownerId: 'blue-player',
            team: 'blue',
            unitKey: 'duckxel_sword_man',
            x,
            y,
            hp: 900,
            maxHp: 900,
            state: 'moving',
            targetId: null,
            attackSerial: 0,
            hitSerial: 0,
            jumpSerial: 0,
            directionX: 0,
            directionY: -1,
            elevation: 0,
            activeSkillKey: null,
            activeSkillPhase: null,
            activeSkillCooldownRemainingMs: 0,
            activeSkillCastSerial: 0,
            spawnTick: 10,
            attackTick: -1,
            hitTick: -1,
            jumpTick: -1,
                activeSkillCastTick: -1,
        }],
        projectiles: [],
        skillZones: [],
        towers: [],
        winner: null,
        finishReason: null,
    };
}
