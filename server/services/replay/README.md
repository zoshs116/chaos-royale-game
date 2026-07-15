# Replay Service

## Planned ownership

1. Replay object key indexing by match id.
2. Signed download URL generation with short TTL.
3. Replay metadata lookup for player history and moderation.

## Input/Output contract

- Input schema: path `matchId`
- Output schema: `ReplayResponse`

## Implemented draft modules

- `src/ReplayService.ts`: matchId -> replay metadata 저장(DB adapter), 만료형 download URL 생성.
- `src/handlers.ts`: `getReplay` operation handler.
