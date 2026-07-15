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
