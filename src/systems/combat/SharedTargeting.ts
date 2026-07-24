import type { DuckxelTargetMask, TargetPolicy } from '../../data/DuckxelBattleProfiles';
import type { Lane } from '../GameMap';

export type ArenaSide = -1 | 0 | 1;

export interface SharedTargetView<T> {
    source: T;
    stableId: string;
    x: number;
    y: number;
    team: 'blue' | 'red';
    alive: boolean;
    isTower: boolean;
    isKingTower: boolean;
    towerActive: boolean;
    movementType: 'ground' | 'air';
    lane: Lane;
    arenaSide: ArenaSide;
    bridgeCorridor: Lane | null;
    routeDistance: number;
}

export interface SharedTargetingRules {
    policy: TargetPolicy;
    mask: DuckxelTargetMask;
    sightRange: number;
    crossLaneCloseRange: number;
    sameLanePenalty: number;
    bridgeCrossLaneAllowed: boolean;
    bridgeEngagementRange: number;
    centerX: number;
    centerPullHalfWidth: number;
    rearAggroRange: number;
    backtrackTolerance: number;
    preserveCurrentTower: boolean;
}

export interface SharedTargetResolution<T> {
    target: T | null;
    reason: 'current-unit' | 'current-tower' | 'nearby-unit' | 'visible-unit' | 'tower-fallback' | 'none';
}

function canTargetUnit<T>(target: SharedTargetView<T>, rules: SharedTargetingRules) {
    if (!rules.mask.units || target.isTower) return false;
    if (target.movementType === 'ground') return rules.mask.ground;
    return rules.mask.air;
}

function canTargetTower<T>(target: SharedTargetView<T>, rules: SharedTargetingRules) {
    return rules.mask.towers && target.isTower;
}

function isEnemyAlive<T>(actor: SharedTargetView<T>, target: SharedTargetView<T>) {
    return target.source !== actor.source
        && target.team !== actor.team
        && target.alive
        && (!target.isKingTower || target.towerActive);
}

function directDistance<T>(actor: SharedTargetView<T>, target: SharedTargetView<T>) {
    return Math.hypot(target.x - actor.x, target.y - actor.y);
}

function stableBetter<T>(
    candidate: SharedTargetView<T>,
    score: number,
    current: SharedTargetView<T> | null,
    currentScore: number,
) {
    const epsilon = 0.001;
    if (score < currentScore - epsilon) return true;
    if (Math.abs(score - currentScore) > epsilon) return false;
    return candidate.stableId < (current?.stableId ?? '\uffff');
}

function isNewTargetBehind<T>(
    actor: SharedTargetView<T>,
    candidate: SharedTargetView<T>,
    rules: SharedTargetingRules,
    distance: number,
) {
    const forwardY = actor.team === 'blue' ? -1 : 1;
    const forwardProgress = (candidate.y - actor.y) * forwardY;
    return forwardProgress < -rules.backtrackTolerance && distance > rules.rearAggroRange;
}

export function resolveSharedCombatTarget<T>(
    actor: SharedTargetView<T>,
    currentTarget: SharedTargetView<T> | null,
    candidates: readonly SharedTargetView<T>[],
    rules: SharedTargetingRules,
): SharedTargetResolution<T> {
    if (currentTarget && isEnemyAlive(actor, currentTarget) && canTargetUnit(currentTarget, rules)) {
        return { target: currentTarget.source, reason: 'current-unit' };
    }

    if (
        rules.preserveCurrentTower
        && currentTarget
        && isEnemyAlive(actor, currentTarget)
        && canTargetTower(currentTarget, rules)
    ) {
        return { target: currentTarget.source, reason: 'current-tower' };
    }

    let bestUnit: SharedTargetView<T> | null = null;
    let bestUnitScore = Infinity;
    let bestUnitIsLocal = false;

    if (rules.policy !== 'building-only' && rules.mask.units) {
        for (const candidate of candidates) {
            if (!isEnemyAlive(actor, candidate) || !canTargetUnit(candidate, rules)) continue;

            const distance = directDistance(actor, candidate);
            const localContact = distance <= rules.crossLaneCloseRange;
            if (!localContact && distance > rules.sightRange) continue;

            const sameLane = candidate.lane === actor.lane;
            const sameBridgeCorridor = Boolean(
                actor.bridgeCorridor && candidate.bridgeCorridor === actor.bridgeCorridor,
            );
            const candidateNearCenter = Math.abs(candidate.x - rules.centerX) <= rules.centerPullHalfWidth;
            const sameSideCenterPull = rules.bridgeCrossLaneAllowed
                && actor.arenaSide !== 0
                && actor.arenaSide === candidate.arenaSide
                && candidateNearCenter;

            if (actor.bridgeCorridor && !localContact) {
                if (!sameBridgeCorridor || distance > rules.bridgeEngagementRange) continue;
            }

            if (!sameLane && !localContact && !sameBridgeCorridor && !sameSideCenterPull) continue;
            if (
                actor.arenaSide !== candidate.arenaSide
                && !localContact
                && !sameBridgeCorridor
                && candidate.routeDistance > rules.sightRange * 1.15
            ) {
                continue;
            }
            if (isNewTargetBehind(actor, candidate, rules, distance)) continue;

            const useRouteDistance = actor.arenaSide !== candidate.arenaSide;
            const lanePenalty = sameLane || localContact ? 0 : rules.sameLanePenalty;
            const score = (useRouteDistance ? candidate.routeDistance : distance) + lanePenalty;
            if (stableBetter(candidate, score, bestUnit, bestUnitScore)) {
                bestUnit = candidate;
                bestUnitScore = score;
                bestUnitIsLocal = localContact;
            }
        }
    }

    if (bestUnit) {
        return {
            target: bestUnit.source,
            reason: bestUnitIsLocal ? 'nearby-unit' : 'visible-unit',
        };
    }

    if (!rules.mask.towers) return { target: null, reason: 'none' };

    let sameLanePrincess: SharedTargetView<T> | null = null;
    let sameLanePrincessScore = Infinity;
    let sameLaneKing: SharedTargetView<T> | null = null;
    let sameLaneKingScore = Infinity;
    let crossLanePrincess: SharedTargetView<T> | null = null;
    let crossLanePrincessScore = Infinity;
    let anyKing: SharedTargetView<T> | null = null;
    let anyKingScore = Infinity;

    for (const candidate of candidates) {
        if (!isEnemyAlive(actor, candidate) || !canTargetTower(candidate, rules)) continue;
        const score = candidate.routeDistance;
        const sameLane = candidate.lane === actor.lane;
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

    const fallback = sameLanePrincess ?? sameLaneKing ?? crossLanePrincess ?? anyKing;
    return {
        target: fallback?.source ?? null,
        reason: fallback ? 'tower-fallback' : 'none',
    };
}
