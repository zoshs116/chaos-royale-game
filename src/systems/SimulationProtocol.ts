/** 팀 타입 */
export type Team = 'blue' | 'red';

/** 커맨드 발생 주체 */
export type SpawnUnitSource = 'player_hand' | 'debug';

/** 시뮬레이션 입력 공통 형식 */
export interface BaseInputCmd<TAction extends string, TPayload> {
    tick: number;
    seq: number;
    action: TAction;
    payload: TPayload;
    clientTime: number;
}

/** 유닛 소환 명령 payload */
export interface SpawnUnitPayload {
    team: Team;
    unitKey: string;
    x: number;
    y: number;
    source: SpawnUnitSource;
    handIndex?: number;
    expectedCost?: number;
}

/** 블루 엘릭서 디버그 설정 payload */
export interface SetBlueElixirPayload {
    value: number;
}

/** 유닛 소환 명령 */
export type SpawnUnitCmd = BaseInputCmd<'spawn_unit', SpawnUnitPayload>;

/** 엘릭서 설정 명령 */
export type SetBlueElixirCmd = BaseInputCmd<'set_blue_elixir', SetBlueElixirPayload>;

/** 로컬 시뮬레이션 명령 유니온 */
export type InputCmd = SpawnUnitCmd | SetBlueElixirCmd;

/** 델타 계산을 위한 최소 상태 */
export interface SimulationBaseState {
    unitCount: number;
    towerHpTotal: number;
    blueElixir: number;
    redElixir: number;
    blueCrowns: number;
    redCrowns: number;
}

/** 정규화 스냅샷 델타 */
export interface SnapshotStateDelta {
    unitCountDelta: number;
    towerHpTotalDelta: number;
    blueElixirDelta: number;
    redElixirDelta: number;
    blueCrownsDelta: number;
    redCrownsDelta: number;
}

/** 정규화 스냅샷 구조 */
export interface NormalizedSnapshot {
    tick: number;
    ackSeq: number;
    stateDelta: SnapshotStateDelta;
}

/** 빈 델타 */
export const EMPTY_STATE_DELTA: SnapshotStateDelta = {
    unitCountDelta: 0,
    towerHpTotalDelta: 0,
    blueElixirDelta: 0,
    redElixirDelta: 0,
    blueCrownsDelta: 0,
    redCrownsDelta: 0,
};

/**
 * 이전 상태 대비 현재 상태 델타 계산.
 */
export function deriveStateDelta(
    previous: SimulationBaseState | null,
    current: SimulationBaseState
): SnapshotStateDelta {
    if (!previous) {
        return { ...EMPTY_STATE_DELTA };
    }

    return {
        unitCountDelta: current.unitCount - previous.unitCount,
        towerHpTotalDelta: current.towerHpTotal - previous.towerHpTotal,
        blueElixirDelta: current.blueElixir - previous.blueElixir,
        redElixirDelta: current.redElixir - previous.redElixir,
        blueCrownsDelta: current.blueCrowns - previous.blueCrowns,
        redCrownsDelta: current.redCrowns - previous.redCrowns,
    };
}
