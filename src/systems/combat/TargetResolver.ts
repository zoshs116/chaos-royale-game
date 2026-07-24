import type { Lane } from '../GameMap';
import type { DuckxelTargetMask, TargetPolicy } from '../../data/DuckxelBattleProfiles';
import {
    resolveSharedCombatTarget,
    type SharedTargetView,
} from './SharedTargeting';

export interface TargetableEntity {
    x: number;
    y: number;
    team: 'blue' | 'red';
    active: boolean;
    state: number;
    simulationOrder: number;
    isTower: boolean;
    isKingTower: boolean;
    towerActive: boolean;
    stats: {
        hp: number;
        movementType: 'ground' | 'air';
    };
    getNavigationLane(): Lane;
}

export interface TargetResolverContext<T extends TargetableEntity> {
    actor: T;
    currentTarget: T | null;
    candidates: readonly T[];
    lane: Lane;
    policy: TargetPolicy;
    mask: DuckxelTargetMask;
    sightRange: number;
    crossLaneCloseRange: number;
    sameLanePenalty: number;
    bridgeCrossLaneAllowed: boolean;
    bridgeEngagementRange: number;
    centerPullHalfWidth: number;
    rearAggroRange: number;
    backtrackTolerance: number;
    preserveCurrentTower?: boolean;
    getRouteDistance(target: T): number;
    getBridgeCorridor(target: T): Lane | null;
    getArenaSide(target: T): -1 | 0 | 1;
}

export interface TargetResolution<T extends TargetableEntity> {
    target: T | null;
    reason: 'current-unit' | 'current-tower' | 'nearby-unit' | 'visible-unit' | 'tower-fallback' | 'none';
}

export function resolveCombatTarget<T extends TargetableEntity>(context: TargetResolverContext<T>): TargetResolution<T> {
    const makeView = (target: T): SharedTargetView<T> => ({
        source: target,
        stableId: String(target.simulationOrder).padStart(12, '0'),
        x: target.x,
        y: target.y,
        team: target.team,
        alive: target.active && target.state !== 5 && target.stats.hp > 0,
        isTower: target.isTower,
        isKingTower: target.isKingTower,
        towerActive: target.towerActive,
        movementType: target.stats.movementType,
        lane: target === context.actor ? context.lane : target.getNavigationLane(),
        arenaSide: context.getArenaSide(target),
        bridgeCorridor: context.getBridgeCorridor(target),
        routeDistance: context.getRouteDistance(target),
    });

    return resolveSharedCombatTarget(
        makeView(context.actor),
        context.currentTarget ? makeView(context.currentTarget) : null,
        context.candidates.map(makeView),
        {
            policy: context.policy,
            mask: context.mask,
            sightRange: context.sightRange,
            crossLaneCloseRange: context.crossLaneCloseRange,
            sameLanePenalty: context.sameLanePenalty,
            bridgeCrossLaneAllowed: context.bridgeCrossLaneAllowed,
            bridgeEngagementRange: context.bridgeEngagementRange,
            centerX: 180,
            centerPullHalfWidth: context.centerPullHalfWidth,
            rearAggroRange: context.rearAggroRange,
            backtrackTolerance: context.backtrackTolerance,
            preserveCurrentTower: context.preserveCurrentTower ?? false,
        },
    );
}
