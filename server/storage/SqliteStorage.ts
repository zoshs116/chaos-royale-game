import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { open, type Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import type { MatchSummary } from '../services/matches/src/types';
import type { ReplayRecord } from '../services/replay/src/types';
import type { PlayerRatingRecord, ServerStorage } from './types';

interface MatchSummaryRow {
    match_id: string;
    queue_type: MatchSummary['queueType'];
    started_at_utc: string;
    ended_at_utc: string;
    duration_sec: number;
    winner_team_id: MatchSummary['winnerTeamId'];
    teams_json: string;
    initial_state_hash: string;
    rng_seed: number;
    input_count: number;
    events_digest_sha256: string;
    replay_key: string;
    server_build: string;
    result_version: number;
    accepted_at_utc: string;
    mmr_updates_json: string;
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

export default class SqliteStorage implements ServerStorage {
    public readonly driver = 'sqlite' as const;
    private readonly db: Database;

    private constructor(db: Database) {
        this.db = db;
    }

    public static async create(filename: string): Promise<SqliteStorage> {
        const absolutePath = resolve(filename);
        await mkdir(dirname(absolutePath), { recursive: true });

        const db = await open({
            filename: absolutePath,
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS match_summaries (
                match_id TEXT PRIMARY KEY,
                queue_type TEXT NOT NULL,
                started_at_utc TEXT NOT NULL,
                ended_at_utc TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                winner_team_id TEXT NOT NULL,
                teams_json TEXT NOT NULL,
                initial_state_hash TEXT NOT NULL,
                rng_seed INTEGER NOT NULL,
                input_count INTEGER NOT NULL,
                events_digest_sha256 TEXT NOT NULL,
                replay_key TEXT NOT NULL,
                server_build TEXT NOT NULL,
                result_version INTEGER NOT NULL,
                accepted_at_utc TEXT NOT NULL,
                mmr_updates_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS replays (
                match_id TEXT PRIMARY KEY,
                replay_key TEXT NOT NULL,
                initial_state_hash TEXT NOT NULL,
                rng_seed INTEGER NOT NULL,
                input_count INTEGER NOT NULL,
                duration_sec INTEGER NOT NULL,
                events_digest_sha256 TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS player_ratings (
                player_id TEXT PRIMARY KEY,
                rating INTEGER NOT NULL,
                updated_at_utc TEXT NOT NULL
            );
        `);

        return new SqliteStorage(db);
    }

    public async getMatchSummary(matchId: string): Promise<MatchSummary | null> {
        const row = await this.db.get<MatchSummaryRow>(
            `SELECT * FROM match_summaries WHERE match_id = ?`,
            matchId
        );

        if (!row) return null;

        return {
            matchId: row.match_id,
            queueType: row.queue_type,
            startedAtUtc: row.started_at_utc,
            endedAtUtc: row.ended_at_utc,
            durationSec: row.duration_sec,
            winnerTeamId: row.winner_team_id,
            teams: JSON.parse(row.teams_json),
            initialStateHash: row.initial_state_hash,
            rngSeed: row.rng_seed,
            inputCount: row.input_count,
            eventsDigestSha256: row.events_digest_sha256,
            replayKey: row.replay_key,
            serverBuild: row.server_build,
            resultVersion: row.result_version,
            acceptedAtUtc: row.accepted_at_utc,
            mmrUpdates: JSON.parse(row.mmr_updates_json)
        };
    }

    public async upsertMatchSummary(summary: MatchSummary): Promise<void> {
        await this.db.run(
            `
            INSERT INTO match_summaries (
                match_id, queue_type, started_at_utc, ended_at_utc, duration_sec,
                winner_team_id, teams_json, initial_state_hash, rng_seed, input_count,
                events_digest_sha256, replay_key, server_build, result_version, accepted_at_utc,
                mmr_updates_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                queue_type = excluded.queue_type,
                started_at_utc = excluded.started_at_utc,
                ended_at_utc = excluded.ended_at_utc,
                duration_sec = excluded.duration_sec,
                winner_team_id = excluded.winner_team_id,
                teams_json = excluded.teams_json,
                initial_state_hash = excluded.initial_state_hash,
                rng_seed = excluded.rng_seed,
                input_count = excluded.input_count,
                events_digest_sha256 = excluded.events_digest_sha256,
                replay_key = excluded.replay_key,
                server_build = excluded.server_build,
                result_version = excluded.result_version,
                accepted_at_utc = excluded.accepted_at_utc,
                mmr_updates_json = excluded.mmr_updates_json
            `,
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
            JSON.stringify(summary.mmrUpdates)
        );
    }

    public async getReplayRecord(matchId: string): Promise<ReplayRecord | null> {
        const row = await this.db.get<ReplayRow>(
            `SELECT * FROM replays WHERE match_id = ?`,
            matchId
        );

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
        await this.db.run(
            `
            INSERT INTO replays (
                match_id, replay_key, initial_state_hash, rng_seed,
                input_count, duration_sec, events_digest_sha256, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                replay_key = excluded.replay_key,
                initial_state_hash = excluded.initial_state_hash,
                rng_seed = excluded.rng_seed,
                input_count = excluded.input_count,
                duration_sec = excluded.duration_sec,
                events_digest_sha256 = excluded.events_digest_sha256,
                updated_at_ms = excluded.updated_at_ms
            `,
            record.matchId,
            record.replayKey,
            record.initialStateHash,
            record.rngSeed,
            record.inputCount,
            record.durationSec,
            record.eventsDigestSha256,
            record.updatedAtMs
        );
    }

    public async getPlayerRating(playerId: string): Promise<PlayerRatingRecord | null> {
        const row = await this.db.get<PlayerRatingRow>(
            `SELECT * FROM player_ratings WHERE player_id = ?`,
            playerId
        );

        if (!row) return null;

        return {
            playerId: row.player_id,
            rating: row.rating,
            updatedAtUtc: row.updated_at_utc
        };
    }

    public async upsertPlayerRating(record: PlayerRatingRecord): Promise<void> {
        await this.db.run(
            `
            INSERT INTO player_ratings (player_id, rating, updated_at_utc)
            VALUES (?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET
                rating = excluded.rating,
                updated_at_utc = excluded.updated_at_utc
            `,
            record.playerId,
            record.rating,
            record.updatedAtUtc
        );
    }

    public async close(): Promise<void> {
        await this.db.close();
    }
}
