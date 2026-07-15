# Gateway

Gateway is the external API boundary.

## Responsibilities

1. Token/auth validation and idempotency checks.
2. HTTP route dispatch to internal services.
3. Request/response validation against shared contracts.
4. Rate limiting and abuse controls.

## Implemented draft modules

- `src/app.ts`: operation manifest (`operationId` + schema owner).
- `src/handlers.ts`: in-memory dispatch registry.  
  - matchmaking enqueue/cancel
  - match-room create/join/finish/cleanup
  - queue tick + policy read
  - match result submit + match summary/replay get
  - storage driver bootstrap(memory/sqlite/postgres)
