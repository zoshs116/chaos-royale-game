import { resolveCombatTarget, type TargetableEntity } from './TargetResolver';
import type { DuckxelTargetMask } from '../../data/DuckxelBattleProfiles';
import GameMap, { type Lane } from '../GameMap';

interface FakeTarget extends TargetableEntity {
    lane: Lane;
}

const anyGroundMask: DuckxelTargetMask = { units: true, towers: true, ground: true, air: false };
const towerOnlyMask: DuckxelTargetMask = { units: false, towers: true, ground: true, air: false };

function fakeTarget(order: number, team: 'blue' | 'red', x: number, y: number, lane: Lane, tower = false): FakeTarget {
    return {
        x,
        y,
        lane,
        team,
        active: true,
        state: 2,
        simulationOrder: order,
        isTower: tower,
        isKingTower: false,
        towerActive: true,
        stats: { hp: 100, movementType: 'ground' },
        getNavigationLane: () => lane,
    };
}

function resolve(actor: FakeTarget, currentTarget: FakeTarget | null, candidates: FakeTarget[], mask: DuckxelTargetMask, policy: 'any-nearest' | 'building-only') {
    return resolveCombatTarget({
        actor,
        currentTarget,
        candidates,
        lane: actor.lane,
        policy,
        mask,
        sightRange: 240,
        crossLaneCloseRange: 60,
        sameLanePenalty: 140,
        bridgeCrossLaneAllowed: true,
        bridgeEngagementRange: 92,
        getRouteDistance: (target) => Math.hypot(target.x - actor.x, target.y - actor.y),
        getBridgeCorridor: () => null,
        getArenaSide: (target) => target.y < 300 ? -1 : 1,
    }).target;
}

export function runCombatInvariantChecks(): string[] {
    const failures: string[] = [];
    const actor = fakeTarget(10, 'blue', 80, 500, 'left');
    const fallbackTower = fakeTarget(30, 'red', 80, 100, 'left', true);
    const nearbyEnemy = fakeTarget(20, 'red', 86, 455, 'left');

    if (resolve(actor, fallbackTower, [actor, fallbackTower, nearbyEnemy], anyGroundMask, 'any-nearest') !== nearbyEnemy) {
        failures.push('normal unit must prefer an eligible nearby enemy over its tower fallback');
    }
    if (resolve(actor, fallbackTower, [actor, fallbackTower, nearbyEnemy], towerOnlyMask, 'building-only') !== fallbackTower) {
        failures.push('building-only unit must ignore enemy units');
    }

    const fartherCurrentEnemy = fakeTarget(21, 'red', 82, 355, 'left');
    const closerNewEnemy = fakeTarget(22, 'red', 96, 458, 'left');
    if (resolve(actor, fartherCurrentEnemy, [actor, fartherCurrentEnemy, closerNewEnemy, fallbackTower], anyGroundMask, 'any-nearest') !== fartherCurrentEnemy) {
        failures.push('a committed unit target must remain selected when a closer enemy appears');
    }

    fartherCurrentEnemy.stats.hp = 0;
    if (resolve(actor, fartherCurrentEnemy, [actor, fartherCurrentEnemy, closerNewEnemy, fallbackTower], anyGroundMask, 'any-nearest') !== closerNewEnemy) {
        failures.push('a dead committed target must release the lock and allow a new eligible unit target');
    }

    const sameSideCrossLaneEnemy = fakeTarget(23, 'red', 270, 470, 'right');
    if (resolve(actor, fallbackTower, [actor, sameSideCrossLaneEnemy, fallbackTower], anyGroundMask, 'any-nearest') !== sameSideCrossLaneEnemy) {
        failures.push('same-side enemies inside sight range must not be rejected by navigation lane');
    }

    const outOfSightEnemy = fakeTarget(24, 'red', 350, 500, 'right');
    if (resolve(actor, fallbackTower, [actor, outOfSightEnemy, fallbackTower], anyGroundMask, 'any-nearest') !== fallbackTower) {
        failures.push('enemies outside sight range must not preempt the tower fallback');
    }

    const tieA = fakeTarget(5, 'red', 70, 450, 'left');
    const tieB = fakeTarget(4, 'red', 90, 450, 'left');
    if (resolve(actor, null, [actor, tieA, tieB, fallbackTower], anyGroundMask, 'any-nearest') !== tieB) {
        failures.push('equal target scores must use simulation order as a stable tie-breaker');
    }

    const map = new GameMap();
    const leftDistance = map.estimatePathDistanceForLane('left', 82, 560, 82, 100);
    const rightDistance = map.estimatePathDistanceForLane('right', 82, 560, 82, 100);
    if (!(leftDistance < rightDistance)) failures.push('left-side crossing must prefer the left bridge');

    const bridgePoint = map.getStrictBridgeWaypointForLane('left', 82, 430, 100, 'blue');
    if (!bridgePoint || Math.abs(bridgePoint.x - map.getBridgeXForLane('left')) > 0.01) {
        failures.push('ground crossing must produce a left bridge waypoint');
    }

    return failures;
}
