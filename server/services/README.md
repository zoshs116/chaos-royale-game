# Services

Service boundaries for backend domain logic.

- `auth`: identity/session creation, token refresh, account linking.
- `matchmaking`: enqueue/cancel flows, queue balancing, room assignment.
- `matches`: authoritative result ingest and match summary persistence.
- `replay`: replay metadata index and signed object URL issuance.
- `mmr`: rating calculation and rank progression updates.
- `telemetry`: event pipeline for runtime metrics and anti-cheat signals.
