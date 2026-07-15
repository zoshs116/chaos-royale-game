import { UNIT_TYPES } from '../../data/UnitData';
import { CONSTANTS } from '../../systems/Constants';
import type { SpawnUnitPayload } from '../../systems/SimulationProtocol';

/** 스폰 명령 거절 사유 */
export type SpawnRejectReason =
    | 'unknown_unit'
    | 'game_over'
    | 'invalid_team'
    | 'invalid_hand'
    | 'hand_mismatch'
    | 'invalid_spawn_zone'
    | 'insufficient_elixir';

/** 스폰 규칙 평가 입력 */
export interface SpawnRuleInput {
    payload: SpawnUnitPayload;
    isGameOver: boolean;
    handUnitKey?: string | null;
    canSpawnBlue?: (x: number, y: number) => boolean;
    canSpendBlueElixir?: (cost: number) => boolean;
}

/** 스폰 규칙 평가 결과 */
export interface SpawnRuleResult {
    accepted: boolean;
    reason?: SpawnRejectReason;
    team: 'blue' | 'red';
    unitKey: string;
    spawnX: number;
    spawnY: number;
    cost: number;
    source: SpawnUnitPayload['source'];
    handIndex?: number;
}

interface SpawnBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

function getSpawnBounds(team: 'blue' | 'red'): SpawnBounds {
    const minY = team === 'blue' ? CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN + 8 : CONSTANTS.ARENA.SPAWN_AREA_RED_MIN + 8;
    const maxY = team === 'blue' ? CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX - 8 : CONSTANTS.ARENA.SPAWN_AREA_RED_MAX - 8;
    return {
        minX: 20,
        maxX: CONSTANTS.SCREEN_WIDTH - 20,
        minY,
        maxY,
    };
}

/**
 * 스폰 명령 규칙 평가 + 좌표 정규화.
 * 클라이언트/서버 공용 규칙 엔진으로 분리 가능한 형태를 유지한다.
 */
export function evaluateSpawnRule(input: SpawnRuleInput): SpawnRuleResult {
    const { payload } = input;
    const team = payload.team;
    const bounds = getSpawnBounds(team);
    const spawnX = Math.max(bounds.minX, Math.min(bounds.maxX, payload.x));
    const spawnY = Math.max(bounds.minY, Math.min(bounds.maxY, payload.y));

    const base: SpawnRuleResult = {
        accepted: false,
        team,
        unitKey: payload.unitKey,
        spawnX,
        spawnY,
        cost: 0,
        source: payload.source,
        handIndex: payload.handIndex,
    };

    const data = UNIT_TYPES[payload.unitKey];
    if (!data) {
        return { ...base, reason: 'unknown_unit' };
    }
    base.cost = data.cost;

    if (input.isGameOver) {
        return { ...base, reason: 'game_over' };
    }

    if (payload.source === 'player_hand') {
        if (payload.team !== 'blue') {
            return { ...base, reason: 'invalid_team' };
        }

        if (typeof payload.handIndex !== 'number') {
            return { ...base, reason: 'invalid_hand' };
        }

        if (!input.handUnitKey || input.handUnitKey !== payload.unitKey) {
            return { ...base, reason: 'hand_mismatch' };
        }

        if (!input.canSpawnBlue || !input.canSpawnBlue(spawnX, spawnY)) {
            return { ...base, reason: 'invalid_spawn_zone' };
        }

        if (!input.canSpendBlueElixir || !input.canSpendBlueElixir(data.cost)) {
            return { ...base, reason: 'insufficient_elixir' };
        }
    }

    return { ...base, accepted: true };
}
