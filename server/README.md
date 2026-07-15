# Chaos Royale Server Skeleton (P1)

This directory contains backend/match-infra scaffolding and the first persistence/worker integration pass from `TODO.md` P1.

## Scope in this step

- `gateway`: API entrypoint route ownership and operation manifest.
- `match-simulator`: authoritative match lifecycle state machine skeleton.
- `services`: domain service boundaries (auth, matchmaking, replay, mmr, telemetry).
- `storage`: driver-selectable persistence (`memory`, `sqlite`, `postgres`).
- `workers`: periodic background jobs (matchmaking tick).
- `contracts`: API/OpenAPI and domain schema drafts.

## Directory layout

```text
server/
  contracts/
    openapi/
      chaos-royale-api-draft.yaml
    schemas/
      match-lifecycle.schema.json
  gateway/
    src/
      app.ts
      handlers.ts
      index.ts
  match-simulator/
    src/
      index.ts
      lifecycle/
        MatchLifecycleMachine.ts
  services/
    auth/
      README.md
    matches/
      README.md
    matchmaking/
      README.md
    mmr/
      README.md
    replay/
      README.md
    telemetry/
      README.md
    matchmaking/
      src/
        MatchmakingPolicy.ts
        MatchmakingService.ts
        MatchRoomService.ts
        handlers.ts
    matches/
      src/
        MatchResultService.ts
        handlers.ts
  storage/
    createStorage.ts
    MemoryStorage.ts
    SqliteStorage.ts
    PostgresStorage.ts
  workers/
    matchmaking-tick-worker.ts
```

## Next implementation targets

1. Add concrete HTTP server (Fastify/Express or Vibe.d equivalent gateway runtime).
2. Wire gateway routes to service handlers with auth + idempotency middleware.
3. Connect `match-simulator` lifecycle machine to room ownership and queue allocator.
4. Add DB migration management and failover strategy for storage drivers.
