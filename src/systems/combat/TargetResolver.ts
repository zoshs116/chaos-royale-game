import type { Lane } from '../GameMap';
import type { DuckxelTargetMask, TargetPolicy } from '../../data/DuckxelBattleProfiles';

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
    getRouteDistance(target: T): number;
    getBridgeCorridor(target: T): Lane | null;
    getArenaSide(target: T): -1 | 0 | 1;
}

export interface TargetResolution<T extends TargetableEntity> {
    target: T | null;
    reason: 'current-unit' | 'nearby-unit' | 'visible-unit' | 'tower-fallback' | 'none';
}

function isAliveTarget<T extends TargetableEntity>(actor: T, target: T) {
    return target !== actor
        && target.team !== actor.team
        && target.active
        && target.state !== 5
        && target.stats.hp > 0
        && (!target.isKingTower || target.towerActive);
}

function maskAllowsUnit<T extends TargetableEntity>(target: T, mask: DuckxelTargetMask) {
    if (!mask.units || target.isTower) return false;
    if (target.stats.movementType === 'ground') return mask.ground;
    return mask.air;
}

function stableBetter<T extends TargetableEntity>(candidate: T, score: number, current: T | null, currentScore: number) {
    const epsilon = 0.001;
    if (score < currentScore - epsilon) return true;
    if (Math.abs(score - currentScore) > epsilon) return false;
    return candidate.simulationOrder < (current?.simulationOrder ?? Number.MAX_SAFE_INTEGER);
}

export function resolveCombatTarget<T extends TargetableEntity>(context: TargetResolverContext<T>): TargetResolution<T> {
    const {
        actor,
        currentTarget,
        candidates,
        lane,
        policy,
        mask,
        sightRange,
    } = context;

    // Unit targets are committed targets. Once acquired, they remain selected
    // until they die, disappear, or become an unsupported movement type.
    // Towers remain soft fallback targets and are intentionally excluded here.
    if (currentTarget
        && isAliveTarget(actor, currentTarget)
        && maskAllowsUnit(currentTarget, mask)) {
        return { target: currentTarget, reason: 'current-unit' };
    }

    const actorCorridor = context.getBridgeCorridor(actor);
    const actorSide = context.getArenaSide(actor);
    let bestUnit: T | null = null;
    let bestUnitScore = Infinity;
    let bestUnitIsLocal = false;

    if (policy !== 'building-only' && mask.units) {
        for (const candidate of candidates) {
            if (!isAliveTarget(actor, candidate) || candidate.isTower) continue;
            if (candidate.stats.movementType === 'ground' && !mask.ground) continue;
            if (candidate.stats.movementType === 'air' && !mask.air) continue;

            const directDistance = Math.hypot(candidate.x - actor.x, candidate.y - actor.y);
            const localRange = Math.max(context.crossLaneCloseRange, 42);
            const localContact = directDistance <= localRange;
            if (!localContact && directDistance > sightRange) continue;

            const candidateCorridor = context.getBridgeCorridor(candidate);
            const sameCorridor = Boolean(actorCorridor && candidateCorridor === actorCorridor);
            const candidateSide = context.getArenaSide(candidate);
            const sameArenaSide = actorSide !== 0 && actorSide === candidateSide;
            if (actorCorridor && !localContact) {
                if (!sameCorridor || directDistance > context.bridgeEngagementRange) continue;
            }

            const sameLane = candidate.getNavigationLane() === lane;
            if (!sameArenaSide && !sameLane && !localContact && !(context.bridgeCrossLaneAllowed && sameCorridor)) continue;

            const routeDistance = context.getRouteDistance(candidate);
            if (!sameArenaSide && !localContact && routeDistance > sightRange * 1.15) continue;

            const lanePenalty = sameLane || sameArenaSide || localContact ? 0 : context.sameLanePenalty;
            const currentTargetBias = candidate === currentTarget ? -0.01 : 0;
            const score = (localContact || sameArenaSide ? directDistance : routeDistance) + lanePenalty + currentTargetBias;
            if (stableBetter(candidate, score, bestUnit, bestUnitScore)) {
                bestUnit = candidate;
                bestUnitScore = score;
                bestUnitIsLocal = localContact;
            }
        }
    }

    if (bestUnit) {
        return { target: bestUnit, reason: bestUnitIsLocal ? 'nearby-unit' : 'visible-unit' };
    }

    if (!mask.towers) return { target: null, reason: 'none' };

    let sameLanePrincess: T | null = null;
    let sameLanePrincessScore = Infinity;
    let sameLaneKing: T | null = null;
    let sameLaneKingScore = Infinity;
    let crossLanePrincess: T | null = null;
    let crossLanePrincessScore = Infinity;
    let anyKing: T | null = null;
    let anyKingScore = Infinity;

    for (const candidate of candidates) {
        if (!isAliveTarget(actor, candidate) || !candidate.isTower) continue;
        const score = context.getRouteDistance(candidate);
        const sameLane = candidate.getNavigationLane() === lane;
        if (candidate.isKingTower) {
            if (sameLane && stableBetter(candidate, score, sameLaneKing, sameLaneKingScore)) {
                sameLaneKing = candidate;
                sameLaneKingScore = score;
            }
            if (stableBetter(candidate, score, anyKing, anyKingScore)) {
                anyKing = candidate;
                anyKingScore = score;
            }
        } else if (sameLane) {
            if (stableBetter(candidate, score, sameLanePrincess, sameLanePrincessScore)) {
                sameLanePrincess = candidate;
                sameLanePrincessScore = score;
            }
        } else if (stableBetter(candidate, score, crossLanePrincess, crossLanePrincessScore)) {
            crossLanePrincess = candidate;
            crossLanePrincessScore = score;
        }
    }

    return {
        target: sameLanePrincess ?? sameLaneKing ?? crossLanePrincess ?? anyKing,
        reason: sameLanePrincess || sameLaneKing || crossLanePrincess || anyKing ? 'tower-fallback' : 'none',
    };
}
