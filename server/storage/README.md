# Storage

Persistence layer for server-side match/replay/mmr data.

## Drivers

- `memory`: in-memory map, useful for local dry-run.
- `sqlite`: local file DB (`CHAOS_SQLITE_PATH`, default `output/server/chaos-royale.db`).
- `postgres`: shared DB (`CHAOS_POSTGRES_URL` required).

## Runtime env

- `CHAOS_STORAGE_DRIVER=memory|sqlite|postgres`
- `CHAOS_SQLITE_PATH=output/server/chaos-royale.db`
- `CHAOS_POSTGRES_URL=postgres://...`

## SQL references

- `sql/schema.sqlite.sql`
- `sql/schema.postgres.sql`
