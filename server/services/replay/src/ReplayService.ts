import ReplayServiceError from './errors';
import type { GetReplayRequest, ReplayRecord, ReplayResponse, ReplayUpsertRequest } from './types';
import type { ServerStorage } from '../../../storage';

export interface ReplayServiceOptions {
    storage: ServerStorage;
    signedUrlTtlSec?: number;
    baseDownloadUrl?: string;
}

export default class ReplayService {
    private readonly storage: ServerStorage;
    private readonly signedUrlTtlSec: number;
    private readonly baseDownloadUrl: string;

    constructor(options: ReplayServiceOptions) {
        this.storage = options.storage;
        this.signedUrlTtlSec = options.signedUrlTtlSec ?? 15 * 60;
        this.baseDownloadUrl = options.baseDownloadUrl ?? 'https://cdn.chaos-royale.example/replays';
    }

    public async upsertReplay(request: ReplayUpsertRequest, nowMs: number): Promise<ReplayRecord> {
        const durationSec = calculateDurationSec(request.startedAtUtc, request.endedAtUtc);
        const record: ReplayRecord = {
            matchId: request.matchId,
            replayKey: request.replayKey,
            initialStateHash: request.initialStateHash,
            rngSeed: request.rngSeed,
            inputCount: request.inputCount,
            durationSec,
            eventsDigestSha256: request.eventsDigestSha256,
            updatedAtMs: nowMs
        };

        await this.storage.upsertReplayRecord(record);
        return record;
    }

    public async getReplay(request: GetReplayRequest, nowMs: number): Promise<ReplayResponse> {
        const record = await this.storage.getReplayRecord(request.matchId);
        if (!record) {
            throw new ReplayServiceError('replay_not_found', 404, 'replay not found.');
        }

        const expiresAtMs = nowMs + this.signedUrlTtlSec * 1000;
        const downloadUrl = buildSignedUrl(this.baseDownloadUrl, record.replayKey, record.matchId, expiresAtMs);
        return {
            matchId: record.matchId,
            replayKey: record.replayKey,
            downloadUrl,
            urlExpiresAtUtc: new Date(expiresAtMs).toISOString(),
            initialStateHash: record.initialStateHash,
            rngSeed: record.rngSeed,
            inputCount: record.inputCount,
            durationSec: record.durationSec
        };
    }
}

function calculateDurationSec(startedAtUtc: string, endedAtUtc: string): number {
    const startedMs = Date.parse(startedAtUtc);
    const endedMs = Date.parse(endedAtUtc);
    if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
        throw new ReplayServiceError('invalid_time', 400, 'invalid timestamp in replay payload.');
    }
    if (endedMs < startedMs) {
        throw new ReplayServiceError('invalid_time_range', 400, 'endedAtUtc must be after startedAtUtc.');
    }
    return Math.max(1, Math.floor((endedMs - startedMs) / 1000));
}

function buildSignedUrl(baseUrl: string, replayKey: string, matchId: string, expiresAtMs: number): string {
    const tokenPayload = `${matchId}:${replayKey}:${expiresAtMs}`;
    const token = hashToken(tokenPayload);
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    return `${normalizedBase}/${encodeURIComponent(replayKey)}?exp=${expiresAtMs}&sig=${token}`;
}

function hashToken(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
