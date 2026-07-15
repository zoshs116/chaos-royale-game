# MMR Service

## Planned ownership

1. Elo/Glicko style rating delta calculation.
2. Rank tier and season progress updates.
3. Result-consistency checks against simulator digest.

## Trigger

- Consumes accepted payload from `/v1/matches/result`.

## Implemented draft modules

- `src/MmrService.ts`: match result 기반 기본 레이팅 증감(+/-) 계산 + storage adapter 연동.
- `src/types.ts`: MMR update/입력 타입 정의.
