# Match Simulator

Authoritative simulation worker skeleton.

## Responsibilities

1. Own match lifecycle transitions.
2. Execute fixed tick simulation for active rooms.
3. Emit signed match result payloads to gateway (`/v1/matches/result`).
4. Produce replay object and deterministic verification metadata.

`src/lifecycle/MatchLifecycleMachine.ts` contains the first transition machine draft.
