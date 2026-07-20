import type { MatchSummary } from '../services/matches/src/types';
import type { ReplayRecord } from '../services/replay/src/types';

export type StorageDriver = 'memory' | 'sqlite' | 'postgres';

export interface PlayerRatingRecord {
    playerId: string;
    rating: number;
    updatedAtUtc: string;
}

export interface PlayerProgressionRecord {
    playerId: string;
    wins: number;
    losses: number;
    trophies: number;
    gold: number;
    gems: number;
    updatedAtUtc: string;
}

export interface ServerStorage {
    readonly driver: StorageDriver;

    getMatchSummary(matchId: string): Promise<MatchSummary | null>;
    upsertMatchSummary(summary: MatchSummary): Promise<void>;

    getReplayRecord(matchId: string): Promise<ReplayRecord | null>;
    upsertReplayRecord(record: ReplayRecord): Promise<void>;

    getPlayerRating(playerId: string): Promise<PlayerRatingRecord | null>;
    upsertPlayerRating(record: PlayerRatingRecord): Promise<void>;

    getPlayerProgression(playerId: string): Promise<PlayerProgressionRecord | null>;
    upsertPlayerProgression(record: PlayerProgressionRecord): Promise<void>;

    close(): Promise<void>;
}
