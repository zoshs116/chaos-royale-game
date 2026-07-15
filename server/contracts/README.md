# Contracts

`contracts/` owns backend-facing protocol definitions shared by gateway, services, and simulator.

- `openapi/`: public HTTP API draft surface.
- `schemas/`: internal domain schema drafts used by services.

New additions in this phase:
- `schemas/matchmaking-policy.schema.json`: 리전 fallback + MMR 확장 정책 구조.
- `schemas/match-room-action.schema.json`: 룸 라이프사이클 명령 payload 구조.
- `schemas/match-summary.schema.json`: match_summary 조회/저장 스키마.
