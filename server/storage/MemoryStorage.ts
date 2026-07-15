import type { MatchSummary } from '../services/matches/src/types';
import type { ReplayRecord } from '../services/replay/src/types';
import type { PlayerRatingRecord, ServerStorage } from './types';

export default class MemoryStorage implements ServerStorage {
    public readonly driver = 'memory' as const;

    private readonly matchSummaryById: Map<string, MatchSummary> = new Map<string, MatchSummary>();
    private readonly replayById: Map<string, ReplayRecord> = new Map<string, ReplayRecord>();
    private readonly playerRatingById: Map<string, PlayerRatingRecord> = new Map<string, PlayerRatingRecord>();

    public async getMatchSummary(matchId: string): Promise<MatchSummary | null> {
        return this.matchSummaryById.get(matchId) ?? null;
    }

    public async upsertMatchSummary(summary: MatchSummary): Promise<void> {
        this.matchSummaryById.set(summary.matchId, summary);
    }

    public async getReplayRecord(matchId: string): Promise<ReplayRecord | null> {
        return this.replayById.get(matchId) ?? null;
    }

    public async upsertReplayRecord(record: ReplayRecord): Promise<void> {
        this.replayById.set(record.matchId, record);
    }

    public async getPlayerRating(playerId: string): Promise<PlayerRatingRecord | null> {
        return this.playerRatingById.get(playerId) ?? null;
    }

    public async upsertPlayerRating(record: PlayerRatingRecord): Promise<void> {
        this.playerRatingById.set(record.playerId, record);
    }

    public async close(): Promise<void> {
        return;
    }
}
