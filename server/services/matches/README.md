# Match Result Service

## Planned ownership

1. Authoritative `submitMatchResult` payload validation.
2. `match_summary` persistence (idempotent by matchId + digest).
3. Replay/MMR pipeline fan-out.

## Implemented draft modules

- `src/MatchResultService.ts`: 결과 저장 + idempotency + replay/mmr 연동.
- `src/handlers.ts`: `submitMatchResult`, `getMatchSummary` operation handler.
