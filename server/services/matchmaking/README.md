# Matchmaking Service

## Planned ownership

1. Queue ticket create/cancel.
2. Region-aware queue partitioning.
3. Match room reservation and simulator handoff.

## Input/Output contract

- Input schema: `EnqueueRequest`, `CancelMatchmakingRequest`
- Output schema: `EnqueueResponse`, `CancelMatchmakingResponse`

## Implemented draft modules

- `src/MatchmakingPolicy.ts`: 리전 fallback + 시간 경과 기반 MMR 허용치 확장 규칙.
- `src/MatchmakingService.ts`: enqueue/cancel, queue tick 매칭, 룸 자동 생성 연결.
- `src/MatchRoomService.ts`: 생성/참가/종료/정리 라이프사이클 상태 전이.
- `src/handlers.ts`: gateway에서 호출하는 operation 단위 핸들러.
