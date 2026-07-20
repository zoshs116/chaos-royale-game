import * as pg from 'pg';
import type { MatchSummary } from '../services/matches/src/types';
import type { ReplayRecord } from '../services/replay/src/types';
import type { PlayerProgressionRecord, PlayerRatingRecord, ServerStorage } from './types';

interface MatchSummaryRow {
    match_id: string;
    queue_type: MatchSummary['queueType'];
    started_at_utc: string;
    ended_at_utc: string;
    duration_sec: number;
    winner_team_id: MatchSummary['winnerTeamId'];
    teams_json: unknown;
    initial_state_hash: string;
    rng_seed: number;
    input_count: number;
    events_digest_sha256: string;
    replay_key: string;
    server_build: string;
    result_version: number;
    accepted_at_utc: string;
    mmr_updates_json: unknown;
    progression_updates_json: unknown;
}

interface ReplayRow {
    match_id: string;
    replay_key: string;
    initial_state_hash: string;
    rng_seed: number;
    input_count: number;
    duration_sec: number;
    events_digest_sha256: string;
    updated_at_ms: number;
}

interface PlayerRatingRow {
    player_id: string;
    rating: number;
    updated_at_utc: string;
}

interface PlayerProgressionRow {
    player_id: string;
    wins: number;
    losses: number;
    trophies: number;
    gold: number;
    gems: number;
    updated_at_utc: string;
}

export default class PostgresStorage implements ServerStorage {
    public readonly driver = 'postgres' as const;
    private readonly pool: pg.Pool;

    private constructor(pool: pg.Pool) {
        this.pool = pool;
    }

    public static async create(connectionString: string): Promise<PostgresStorage> {
        const pool = new pg.Pool({ connectionString });
        const storage = new PostgresStorage(pool);
        await storage.initialize();
        return storage;
    }

    public async getMatchSummary(matchId: string): Promise<MatchSummary | null> {
        const result = await this.pool.query<MatchSummaryRow>(
            `SELECT * FROM match_summaries WHERE match_id = $1`,
            [matchId]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            matchId: row.match_id,
            queueType: row.queue_type,
            startedAtUtc: row.started_at_utc,
            endedAtUtc: row.ended_at_utc,
            durationSec: row.duration_sec,
            winnerTeamId: row.winner_team_id,
            teams: row.teams_json as MatchSummary['teams'],
            initialStateHash: row.initial_state_hash,
            rngSeed: row.rng_seed,
            inputCount: row.input_count,
            eventsDigestSha256: row.events_digest_sha256,
            replayKey: row.replay_key,
            serverBuild: row.server_build,
            resultVersion: row.result_version,
            acceptedAtUtc: row.accepted_at_utc,
            mmrUpdates: row.mmr_updates_json as MatchSummary['mmrUpdates'],
            progressionUpdates: row.progression_updates_json as MatchSummary['progressionUpdates'],
        };
    }

    public async upsertMatchSummary(summary: MatchSummary): Promise<void> {
        await this.pool.query(
            `
            INSERT INTO match_summaries (
                match_id, queue_type, started_at_utc, ended_at_utc, duration_sec,
                winner_team_id, teams_json, initial_state_hash, rng_seed, input_count,
                events_digest_sha256, replay_key, server_build, result_version, accepted_at_utc,
                mmr_updates_json, progression_updates_json
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7::jsonb, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16::jsonb, $17::jsonb
            )
            ON CONFLICT (match_id) DO UPDATE SET
                queue_type = EXCLUDED.queue_type,
                started_at_utc = EXCLUDED.started_at_utc,
                ended_at_utc = EXCLUDED.ended_at_utc,
                duration_sec = EXCLUDED.duration_sec,
                winner_team_id = EXCLUDED.winner_team_id,
                teams_json = EXCLUDED.teams_json,
                initial_state_hash = EXCLUDED.initial_state_hash,
                rng_seed = EXCLUDED.rng_seed,
                input_count = EXCLUDED.input_count,
                events_digest_sha256 = EXCLUDED.events_digest_sha256,
                replay_key = EXCLUDED.replay_key,
                server_build = EXCLUDED.server_build,
                result_version = EXCLUDED.result_version,
                accepted_at_utc = EXCLUDED.accepted_at_utc,
                mmr_updates_json = EXCLUDED.mmr_updates_json,
                progression_updates_json = EXCLUDED.progression_updates_json
            `,
            [
                summary.matchId,
                summary.queueType,
                summary.startedAtUtc,
                summary.endedAtUtc,
                summary.durationSec,
                summary.winnerTeamId,
                JSON.stringify(summary.teams),
                summary.initialStateHash,
                summary.rngSeed,
                summary.inputCount,
                summary.eventsDigestSha256,
                summary.replayKey,
                summary.serverBuild,
                summary.resultVersion,
                summary.acceptedAtUtc,
                JSON.stringify(summary.mmrUpdates),
                JSON.stringify(summary.progressionUpdates)
            ]
        );
    }

    public async getReplayRecord(matchId: string): Promise<ReplayRecord | null> {
        const result = await this.pool.query<ReplayRow>(
            `SELECT * FROM replays WHERE match_id = $1`,
            [matchId]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            matchId: row.match_id,
            replayKey: row.replay_key,
            initialStateHash: row.initial_state_hash,
            rngSeed: row.rng_seed,
            inputCount: row.input_count,
            durationSec: row.duration_sec,
            eventsDigestSha256: row.events_digest_sha256,
            updatedAtMs: row.updated_at_ms
        };
    }

    public async upsertReplayRecord(record: ReplayRecord): Promise<void> {
        await this.pool.query(
            `
            INSERT INTO replays (
                match_id, replay_key, initial_state_hash, rng_seed, input_count,
                duration_sec, events_digest_sha256, updated_at_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (match_id) DO UPDATE SET
                replay_key = EXCLUDED.replay_key,
                initial_state_hash = EXCLUDED.initial_state_hash,
                rng_seed = EXCLUDED.rng_seed,
                input_count = EXCLUDED.input_count,
                duration_sec = EXCLUDED.duration_sec,
                events_digest_sha256 = EXCLUDED.events_digest_sha256,
                updated_at_ms = EXCLUDED.updated_at_ms
            `,
            [
                record.matchId,
                record.replayKey,
                record.initialStateHash,
                record.rngSeed,
                record.inputCount,
                record.durationSec,
                record.eventsDigestSha256,
                record.updatedAtMs
            ]
        );
    }

    public async getPlayerRating(playerId: string): Promise<PlayerRatingRecord | null> {
        const result = await this.pool.query<PlayerRatingRow>(
            `SELECT * FROM player_ratings WHERE player_id = $1`,
            [playerId]
        );
        const row = result.rows[0];
        if (!row) return null;

        return {
            playerId: row.player_id,
            rating: row.rating,
            updatedAtUtc: row.updated_at_utc
        };
    }

    public async upsertPlayerRating(record: PlayerRatingRecord): Promise<void> {
        await this.pool.query(
            `
            INSERT INTO player_ratings (player_id, rating, updated_at_utc)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_id) DO UPDATE SET
                rating = EXCLUDED.rating,
                updated_at_utc = EXCLUDED.updated_at_utc
            `,
            [record.playerId, record.rating, record.updatedAtUtc]
        );
    }

    public async getPlayerProgression(playerId: string): Promise<PlayerProgressionRecord | null> {
        const result = await this.pool.query<PlayerProgressionRow>(
            `SELECT * FROM player_progression WHERE player_id = $1`,
            [playerId]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            playerId: row.player_id,
            wins: row.wins,
            losses: row.losses,
            trophies: row.trophies,
            gold: row.gold,
            gems: row.gems,
            updatedAtUtc: row.updated_at_utc,
        };
    }

    public async upsertPlayerProgression(record: PlayerProgressionRecord): Promise<void> {
        await this.pool.query(
            `
            INSERT INTO player_progression (player_id, wins, losses, trophies, gold, gems, updated_at_utc)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (player_id) DO UPDATE SET
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                trophies = EXCLUDED.trophies,
                gold = EXCLUDED.gold,
                gems = EXCLUDED.gems,
                updated_at_utc = EXCLUDED.updated_at_utc
            `,
            [record.playerId, record.wins, record.losses, record.trophies, record.gold, record.gems, record.updatedAtUtc]
        );
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }

    private async initialize(): Promise<void> {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS match_summaries (
                match_id TEXT PRIMARY KEY,
                queue_type TEXT NOT NULL,
                started_at_utc TEXT NOT NULL,
                ended_at_utc TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                winner_team_id TEXT NOT NULL,
                teams_json JSONB NOT NULL,
                initial_state_hash TEXT NOT NULL,
                rng_seed INTEGER NOT NULL,
                input_count INTEGER NOT NULL,
                events_digest_sha256 TEXT NOT NULL,
                replay_key TEXT NOT NULL,
                server_build TEXT NOT NULL,
                result_version INTEGER NOT NULL,
                accepted_at_utc TEXT NOT NULL,
                mmr_updates_json JSONB NOT NULL
            );
            ALTER TABLE match_summaries
                ADD COLUMN IF NOT EXISTS progression_updates_json JSONB NOT NULL DEFAULT '[]'::jsonb;

            CREATE TABLE IF NOT EXISTS replays (
                match_id TEXT PRIMARY KEY,
                replay_key TEXT NOT NULL,
                initial_state_hash TEXT NOT NULL,
                rng_seed INTEGER NOT NULL,
                input_count INTEGER NOT NULL,
                duration_sec INTEGER NOT NULL,
                events_digest_sha256 TEXT NOT NULL,
                updated_at_ms BIGINT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS player_ratings (
                player_id TEXT PRIMARY KEY,
                rating INTEGER NOT NULL,
                updated_at_utc TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS player_progression (
                player_id TEXT PRIMARY KEY,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                trophies INTEGER NOT NULL DEFAULT 0,
                gold INTEGER NOT NULL DEFAULT 0,
                gems INTEGER NOT NULL DEFAULT 0,
                updated_at_utc TEXT NOT NULL
            );
        `);
    }
}
