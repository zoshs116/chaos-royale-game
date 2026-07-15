# Workers

## Matchmaking Tick Worker

`matchmaking-tick-worker.ts` runs queue tick logic on a fixed interval.

### Modes

- `http` (default): call `POST /v1/matchmaking/tick` on gateway.
- `gateway-operation`: directly invoke gateway operation dispatch (dev-only).

### Env

- `CHAOS_MATCHMAKING_TICK_INTERVAL_MS` (default: `1000`)
- `CHAOS_MATCHMAKING_WORKER_MODE=http|gateway-operation`
- `CHAOS_GATEWAY_URL` (default: `http://127.0.0.1:8787`)
