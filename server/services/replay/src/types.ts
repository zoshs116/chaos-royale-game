export interface ReplayUpsertRequest {
    matchId: string;
    replayKey: string;
    initialStateHash: string;
    rngSeed: number;
    inputCount: number;
    startedAtUtc: string;
    endedAtUtc: string;
    eventsDigestSha256: string;
}

export interface ReplayRecord {
    matchId: string;
    replayKey: string;
    initialStateHash: string;
    rngSeed: number;
    inputCount: number;
    durationSec: number;
    eventsDigestSha256: string;
    updatedAtMs: number;
}

export interface ReplayResponse {
    matchId: string;
    replayKey: string;
    downloadUrl: string;
    urlExpiresAtUtc: string;
    initialStateHash: string;
    rngSeed: number;
    inputCount: number;
    durationSec: number;
}

export interface GetReplayRequest {
    matchId: string;
}
