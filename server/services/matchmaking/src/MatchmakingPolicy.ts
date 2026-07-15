import type {
    MatchmakingTicket,
    QueueType,
    RegionId,
    RegionPreference
} from './types';

export interface MmrExpansionRule {
    afterSec: number;
    delta: number;
}

export interface RegionExpansionRule {
    afterSec: number;
    widenToCount: number;
}

export interface QueuePolicy {
    playersPerRoom: number;
    estimatedWaitSec: number;
    mmrExpansionRules: readonly MmrExpansionRule[];
    regionExpansionRules: readonly RegionExpansionRule[];
}

export interface MatchmakingPolicy {
    maxAllowedPingMs: number;
    queuePolicies: Record<QueueType, QueuePolicy>;
    regionFallbackPriority: Record<RegionId, readonly RegionId[]>;
}

export const DEFAULT_MATCHMAKING_POLICY: MatchmakingPolicy = {
    maxAllowedPingMs: 180,
    queuePolicies: {
        ladder_1v1: {
            playersPerRoom: 2,
            estimatedWaitSec: 8,
            mmrExpansionRules: [
                { afterSec: 0, delta: 50 },
                { afterSec: 10, delta: 100 },
                { afterSec: 20, delta: 150 },
                { afterSec: 30, delta: 250 }
            ],
            regionExpansionRules: [
                { afterSec: 0, widenToCount: 1 },
                { afterSec: 12, widenToCount: 2 },
                { afterSec: 24, widenToCount: 3 }
            ]
        },
        custom_1v1: {
            playersPerRoom: 2,
            estimatedWaitSec: 5,
            mmrExpansionRules: [
                { afterSec: 0, delta: 3000 }
            ],
            regionExpansionRules: [
                { afterSec: 0, widenToCount: 5 }
            ]
        },
        party_2v2: {
            playersPerRoom: 4,
            estimatedWaitSec: 14,
            mmrExpansionRules: [
                { afterSec: 0, delta: 100 },
                { afterSec: 12, delta: 180 },
                { afterSec: 24, delta: 280 }
            ],
            regionExpansionRules: [
                { afterSec: 0, widenToCount: 1 },
                { afterSec: 15, widenToCount: 2 },
                { afterSec: 30, widenToCount: 4 }
            ]
        }
    },
    regionFallbackPriority: {
        'ap-northeast': ['ap-northeast', 'ap-southeast', 'us-west', 'eu-central', 'us-east'],
        'ap-southeast': ['ap-southeast', 'ap-northeast', 'us-west', 'us-east', 'eu-central'],
        'us-west': ['us-west', 'us-east', 'ap-northeast', 'ap-southeast', 'eu-central'],
        'us-east': ['us-east', 'us-west', 'eu-central', 'ap-northeast', 'ap-southeast'],
        'eu-central': ['eu-central', 'us-east', 'us-west', 'ap-northeast', 'ap-southeast']
    }
} as const;

export function getQueuePolicy(policy: MatchmakingPolicy, queueType: QueueType): QueuePolicy {
    return policy.queuePolicies[queueType];
}

export function getMmrDelta(policy: MatchmakingPolicy, queueType: QueueType, elapsedSec: number): number {
    const rules = policy.queuePolicies[queueType].mmrExpansionRules;
    let delta = rules[0].delta;
    for (const rule of rules) {
        if (elapsedSec >= rule.afterSec) {
            delta = rule.delta;
        }
    }
    return delta;
}

export function getAllowedRegions(
    policy: MatchmakingPolicy,
    queueType: QueueType,
    regionPreference: RegionPreference,
    pingByRegion: Partial<Record<RegionId, number>>,
    elapsedSec: number
): RegionId[] {
    const widenCount = getRegionWidenCount(policy, queueType, elapsedSec);
    const ranked = rankRegionsByPreference(policy, regionPreference, pingByRegion);
    return ranked.slice(0, Math.max(1, Math.min(widenCount, ranked.length)));
}

function getRegionWidenCount(policy: MatchmakingPolicy, queueType: QueueType, elapsedSec: number): number {
    const rules = policy.queuePolicies[queueType].regionExpansionRules;
    let widenCount = rules[0].widenToCount;
    for (const rule of rules) {
        if (elapsedSec >= rule.afterSec) {
            widenCount = rule.widenToCount;
        }
    }
    return widenCount;
}

function rankRegionsByPreference(
    policy: MatchmakingPolicy,
    regionPreference: RegionPreference,
    pingByRegion: Partial<Record<RegionId, number>>
): RegionId[] {
    if (regionPreference === 'auto') {
        const ranked = Object.entries(pingByRegion)
            .filter((entry: [string, number | undefined]): boolean => {
                const ping = entry[1];
                return typeof ping === 'number' && ping <= policy.maxAllowedPingMs;
            })
            .sort((left: [string, number | undefined], right: [string, number | undefined]): number => {
                return (left[1] ?? Number.MAX_SAFE_INTEGER) - (right[1] ?? Number.MAX_SAFE_INTEGER);
            })
            .map((entry: [string, number | undefined]): RegionId => entry[0] as RegionId);

        if (ranked.length > 0) return ranked;
        return [...policy.regionFallbackPriority['ap-northeast']];
    }

    return [...policy.regionFallbackPriority[regionPreference]];
}

export function trySelectMatchRegion(
    policy: MatchmakingPolicy,
    tickets: MatchmakingTicket[],
    nowMs: number
): RegionId | null {
    const candidateGroups = tickets.map((ticket: MatchmakingTicket): RegionId[] => {
        const elapsedSec = getElapsedSec(ticket, nowMs);
        return getAllowedRegions(
            policy,
            ticket.queueType,
            ticket.regionPreference,
            ticket.pingByRegion,
            elapsedSec
        );
    });

    const sharedRegions = candidateGroups.reduce((acc: RegionId[], current: RegionId[]): RegionId[] => {
        if (acc.length === 0) return [...current];
        return acc.filter((region: RegionId): boolean => current.includes(region));
    }, []);

    if (sharedRegions.length === 0) return null;

    let bestRegion: RegionId = sharedRegions[0];
    let bestScore = Number.MAX_SAFE_INTEGER;
    for (const region of sharedRegions) {
        const score = tickets.reduce((sum: number, ticket: MatchmakingTicket): number => {
            const ping = ticket.pingByRegion[region] ?? policy.maxAllowedPingMs;
            return sum + ping;
        }, 0);
        if (score < bestScore) {
            bestScore = score;
            bestRegion = region;
        }
    }
    return bestRegion;
}

export function isTicketPairCompatible(
    policy: MatchmakingPolicy,
    left: MatchmakingTicket,
    right: MatchmakingTicket,
    nowMs: number
): boolean {
    if (left.queueType !== right.queueType) return false;

    const leftElapsed = getElapsedSec(left, nowMs);
    const rightElapsed = getElapsedSec(right, nowMs);
    const leftDelta = getMmrDelta(policy, left.queueType, leftElapsed);
    const rightDelta = getMmrDelta(policy, right.queueType, rightElapsed);
    const mmrDiff = Math.abs(left.mmr - right.mmr);

    if (mmrDiff > leftDelta || mmrDiff > rightDelta) {
        return false;
    }

    const region = trySelectMatchRegion(policy, [left, right], nowMs);
    return region !== null;
}

function getElapsedSec(ticket: MatchmakingTicket, nowMs: number): number {
    return Math.max(0, Math.floor((nowMs - ticket.enqueuedAtMs) / 1000));
}
