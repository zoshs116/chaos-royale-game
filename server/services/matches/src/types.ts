import type { QueueType } from '../../matchmaking/src';
import type { MmrUpdate } from '../../mmr/src';

export interface TeamResult {
    teamId: 'blue' | 'red';
    playerIds: string[];
    crowns: number;
    kingTowerHp: number;
}

export interface MatchResultRequest {
    matchId: string;
    queueType: QueueType;
    startedAtUtc: string;
    endedAtUtc: string;
    winnerTeamId: 'blue' | 'red' | 'draw';
    teams: TeamResult[];
    initialStateHash: string;
    rngSeed: number;
    inputCount: number;
    eventsDigestSha256: string;
    replayKey: string;
    serverBuild: string;
}

export interface MatchResultResponse {
    matchId: string;
    accepted: boolean;
    resultVersion: number;
}

export interface GetMatchSummaryRequest {
    matchId: string;
}

export interface MatchSummary {
    matchId: string;
    queueType: QueueType;
    startedAtUtc: string;
    endedAtUtc: string;
    durationSec: number;
    winnerTeamId: 'blue' | 'red' | 'draw';
    teams: TeamResult[];
    initialStateHash: string;
    rngSeed: number;
    inputCount: number;
    eventsDigestSha256: string;
    replayKey: string;
    serverBuild: string;
    resultVersion: number;
    acceptedAtUtc: string;
    mmrUpdates: MmrUpdate[];
}
