import { MmrService } from '../../mmr/src';
import { ReplayService } from '../../replay/src';
import MatchResultServiceError from './errors';
import type { MatchResultRequest, MatchResultResponse, MatchSummary } from './types';
import type { ServerStorage } from '../../../storage';

export interface MatchResultServiceOptions {
    storage: ServerStorage;
    mmrService?: MmrService;
    replayService?: ReplayService;
}

export default class MatchResultService {
    private readonly storage: ServerStorage;
    private readonly mmrService: MmrService;
    private readonly replayService: ReplayService;

    constructor(options: MatchResultServiceOptions) {
        this.storage = options.storage;
        this.mmrService = options.mmrService ?? new MmrService({ storage: this.storage });
        this.replayService = options.replayService ?? new ReplayService({ storage: this.storage });
    }

    public async submitResult(request: MatchResultRequest, nowMs: number): Promise<MatchResultResponse> {
        validateResultPayload(request);

        const existing = await this.storage.getMatchSummary(request.matchId);
        if (existing) {
            if (existing.eventsDigestSha256 !== request.eventsDigestSha256) {
                throw new MatchResultServiceError(
                    'result_conflict',
                    409,
                    'same matchId received with different digest payload.'
                );
            }

            return {
                matchId: existing.matchId,
                accepted: true,
                resultVersion: existing.resultVersion
            };
        }

        const mmrUpdates = await this.mmrService.applyResult(
            {
                winnerTeamId: request.winnerTeamId,
                teams: request.teams.map((team) => ({
                    teamId: team.teamId,
                    playerIds: team.playerIds,
                    crowns: team.crowns
                }))
            },
            nowMs
        );

        await this.replayService.upsertReplay(
            {
                matchId: request.matchId,
                replayKey: request.replayKey,
                initialStateHash: request.initialStateHash,
                rngSeed: request.rngSeed,
                inputCount: request.inputCount,
                startedAtUtc: request.startedAtUtc,
                endedAtUtc: request.endedAtUtc,
                eventsDigestSha256: request.eventsDigestSha256
            },
            nowMs
        );

        const durationSec = calculateDurationSec(request.startedAtUtc, request.endedAtUtc);
        const summary: MatchSummary = {
            matchId: request.matchId,
            queueType: request.queueType,
            startedAtUtc: request.startedAtUtc,
            endedAtUtc: request.endedAtUtc,
            durationSec,
            winnerTeamId: request.winnerTeamId,
            teams: request.teams,
            initialStateHash: request.initialStateHash,
            rngSeed: request.rngSeed,
            inputCount: request.inputCount,
            eventsDigestSha256: request.eventsDigestSha256,
            replayKey: request.replayKey,
            serverBuild: request.serverBuild,
            resultVersion: 1,
            acceptedAtUtc: new Date(nowMs).toISOString(),
            mmrUpdates
        };

        await this.storage.upsertMatchSummary(summary);
        return {
            matchId: summary.matchId,
            accepted: true,
            resultVersion: summary.resultVersion
        };
    }

    public async getSummary(matchId: string): Promise<MatchSummary | null> {
        return this.storage.getMatchSummary(matchId);
    }
}

function validateResultPayload(request: MatchResultRequest): void {
    if (!/^m_[a-zA-Z0-9_-]{8,}$/.test(request.matchId)) {
        throw new MatchResultServiceError('invalid_match_id', 400, 'invalid matchId format.');
    }

    if (!/^[a-f0-9]{64}$/.test(request.eventsDigestSha256)) {
        throw new MatchResultServiceError('invalid_digest', 400, 'eventsDigestSha256 must be sha256 hex string.');
    }

    if (request.teams.length !== 2) {
        throw new MatchResultServiceError('invalid_team_count', 400, 'teams must contain exactly 2 entries.');
    }

    const teamIds = request.teams.map((team) => team.teamId);
    if (!(teamIds.includes('blue') && teamIds.includes('red'))) {
        throw new MatchResultServiceError('invalid_team_ids', 400, 'teams must include blue and red.');
    }

    if (request.inputCount < 0) {
        throw new MatchResultServiceError('invalid_input_count', 400, 'inputCount must be non-negative.');
    }

    if (request.rngSeed < 0) {
        throw new MatchResultServiceError('invalid_rng_seed', 400, 'rngSeed must be non-negative.');
    }

    const startedMs = Date.parse(request.startedAtUtc);
    const endedMs = Date.parse(request.endedAtUtc);
    if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
        throw new MatchResultServiceError('invalid_time', 400, 'invalid startedAtUtc/endedAtUtc value.');
    }

    if (endedMs < startedMs) {
        throw new MatchResultServiceError('invalid_time_range', 400, 'endedAtUtc must be after startedAtUtc.');
    }
}

function calculateDurationSec(startedAtUtc: string, endedAtUtc: string): number {
    const startedMs = Date.parse(startedAtUtc);
    const endedMs = Date.parse(endedAtUtc);
    return Math.max(1, Math.floor((endedMs - startedMs) / 1000));
}
