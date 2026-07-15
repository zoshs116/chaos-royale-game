import type { InputCmd, SimulationBaseState } from './SimulationProtocol';

/** 권위 스냅샷 */
export interface AuthoritativeSnapshot {
    tick: number;
    ackSeq: number;
    state: SimulationBaseState;
}

/** 보간 샘플 */
export interface InterpolationSample {
    available: boolean;
    targetTick: number;
    alpha: number;
    fromTick: number | null;
    toTick: number | null;
    state: SimulationBaseState | null;
}

/** 정정 모드 */
export type ReconciliationMode = 'none' | 'snap' | 'smooth';

/** 정정 오차 */
export interface ReconciliationError {
    blueElixir: number;
    redElixir: number;
    unitCount: number;
    towerHpTotal: number;
    blueCrowns: number;
    redCrowns: number;
    magnitude: number;
}

interface ReconciliationThresholds {
    blueElixir: number;
    redElixir: number;
    unitCount: number;
    towerHpTotal: number;
    blueCrowns: number;
    redCrowns: number;
}

export interface ReconciliationTuning {
    softMagnitude: number;
    hardMagnitude: number;
    smoothTicks: number;
}

interface SmoothCorrectionState {
    active: boolean;
    startTick: number;
    durationTicks: number;
    initialError: ReconciliationError | null;
}

interface ClientSyncOptions {
    interpolationDelayTicks?: number;
    maxSnapshots?: number;
    thresholds?: Partial<ReconciliationThresholds>;
    tuning?: Partial<ReconciliationTuning>;
}

const DEFAULT_THRESHOLDS: ReconciliationThresholds = {
    blueElixir: 0.25,
    redElixir: 0.25,
    unitCount: 1,
    towerHpTotal: 20,
    blueCrowns: 1,
    redCrowns: 1,
};

const DEFAULT_TUNING: ReconciliationTuning = {
    softMagnitude: 0.8,
    hardMagnitude: 2.2,
    smoothTicks: 6,
};

/**
 * 클라이언트 예측/정정/보간 파이프라인.
 * 현재는 로컬 authoritative 루프 기준으로 동작하며, 서버 연동 시 동일 구조를 그대로 확장한다.
 */
export default class ClientSyncPipeline {
    private readonly interpolationDelayTicks: number;
    private readonly maxSnapshots: number;
    private readonly thresholds: ReconciliationThresholds;
    private readonly tuning: ReconciliationTuning;

    private snapshots: AuthoritativeSnapshot[] = [];
    private pendingLocalSeqs: Set<number> = new Set();
    private correctionCount: number = 0;
    private correctionMode: ReconciliationMode = 'none';
    private lastCorrectionTick: number = -1;
    private lastError: ReconciliationError | null = null;
    private snapCorrectionCount: number = 0;
    private smoothCorrectionCount: number = 0;
    private smoothCorrection: SmoothCorrectionState = {
        active: false,
        startTick: 0,
        durationTicks: 0,
        initialError: null,
    };

    constructor(options: ClientSyncOptions = {}) {
        this.interpolationDelayTicks = options.interpolationDelayTicks ?? 2;
        this.maxSnapshots = options.maxSnapshots ?? 120;
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) };
        this.tuning = { ...DEFAULT_TUNING, ...(options.tuning ?? {}) };
    }

    reset() {
        this.snapshots = [];
        this.pendingLocalSeqs.clear();
        this.correctionCount = 0;
        this.correctionMode = 'none';
        this.lastCorrectionTick = -1;
        this.lastError = null;
        this.snapCorrectionCount = 0;
        this.smoothCorrectionCount = 0;
        this.smoothCorrection.active = false;
        this.smoothCorrection.initialError = null;
    }

    registerLocalInput(command: InputCmd) {
        if (command.action !== 'spawn_unit') return;
        if (command.payload.source !== 'player_hand') return;
        this.pendingLocalSeqs.add(command.seq);
    }

    ingestSnapshot(snapshot: AuthoritativeSnapshot, predictedState: SimulationBaseState) {
        this.acknowledge(snapshot.ackSeq);
        this.snapshots.push({
            tick: snapshot.tick,
            ackSeq: snapshot.ackSeq,
            state: { ...snapshot.state },
        });

        const overflow = this.snapshots.length - this.maxSnapshots;
        if (overflow > 0) {
            this.snapshots.splice(0, overflow);
        }

        this.evaluateReconciliation(snapshot.tick, snapshot.state, predictedState);
    }

    sample(renderTick: number): InterpolationSample {
        const targetTick = renderTick - this.interpolationDelayTicks;
        if (this.snapshots.length === 0) {
            return {
                available: false,
                targetTick,
                alpha: 0,
                fromTick: null,
                toTick: null,
                state: null,
            };
        }

        let from = this.snapshots[0];
        let to: AuthoritativeSnapshot | null = null;

        for (const sample of this.snapshots) {
            if (sample.tick <= targetTick) {
                from = sample;
                continue;
            }
            to = sample;
            break;
        }

        if (!to) {
            const corrected = this.applyCorrection({ ...from.state }, targetTick);
            return {
                available: true,
                targetTick,
                alpha: 1,
                fromTick: from.tick,
                toTick: from.tick,
                state: corrected,
            };
        }

        const span = Math.max(1, to.tick - from.tick);
        const alpha = Math.max(0, Math.min(1, (targetTick - from.tick) / span));
        const interpolated = this.interpolateState(from.state, to.state, alpha);
        const corrected = this.applyCorrection(interpolated, targetTick);
        return {
            available: true,
            targetTick,
            alpha,
            fromTick: from.tick,
            toTick: to.tick,
            state: corrected,
        };
    }

    getInterpolationDelayTicks(): number {
        return this.interpolationDelayTicks;
    }

    getSnapshotBufferSize(): number {
        return this.snapshots.length;
    }

    getPendingLocalInputCount(): number {
        return this.pendingLocalSeqs.size;
    }

    getCorrectionCount(): number {
        return this.correctionCount;
    }

    getCorrectionMode(): ReconciliationMode {
        return this.correctionMode;
    }

    getSnapCorrectionCount(): number {
        return this.snapCorrectionCount;
    }

    getSmoothCorrectionCount(): number {
        return this.smoothCorrectionCount;
    }

    getLastCorrectionTick(): number {
        return this.lastCorrectionTick;
    }

    getLastErrorMagnitude(): number {
        return this.lastError?.magnitude ?? 0;
    }

    getReconciliationTuning(): Readonly<ReconciliationTuning> {
        return this.tuning;
    }

    private acknowledge(ackSeq: number) {
        if (this.pendingLocalSeqs.size === 0) return;
        for (const seq of [...this.pendingLocalSeqs]) {
            if (seq <= ackSeq) {
                this.pendingLocalSeqs.delete(seq);
            }
        }
    }

    private evaluateReconciliation(
        tick: number,
        authoritative: SimulationBaseState,
        predicted: SimulationBaseState
    ) {
        const error: ReconciliationError = {
            blueElixir: predicted.blueElixir - authoritative.blueElixir,
            redElixir: predicted.redElixir - authoritative.redElixir,
            unitCount: predicted.unitCount - authoritative.unitCount,
            towerHpTotal: predicted.towerHpTotal - authoritative.towerHpTotal,
            blueCrowns: predicted.blueCrowns - authoritative.blueCrowns,
            redCrowns: predicted.redCrowns - authoritative.redCrowns,
            magnitude: 0,
        };

        error.magnitude =
            Math.abs(error.blueElixir) +
            Math.abs(error.redElixir) +
            Math.abs(error.unitCount) +
            Math.abs(error.towerHpTotal / 100) +
            Math.abs(error.blueCrowns) +
            Math.abs(error.redCrowns);
        this.lastError = error;

        // 로컬 입력이 pending이면 정정 판단을 유보한다.
        if (this.pendingLocalSeqs.size > 0) {
            return;
        }

        const isFieldThresholdExceeded =
            Math.abs(error.blueElixir) >= this.thresholds.blueElixir ||
            Math.abs(error.redElixir) >= this.thresholds.redElixir ||
            Math.abs(error.unitCount) >= this.thresholds.unitCount ||
            Math.abs(error.towerHpTotal) >= this.thresholds.towerHpTotal ||
            Math.abs(error.blueCrowns) >= this.thresholds.blueCrowns ||
            Math.abs(error.redCrowns) >= this.thresholds.redCrowns;
        if (!isFieldThresholdExceeded) {
            if (!this.smoothCorrection.active) {
                this.correctionMode = 'none';
            }
            return;
        }

        if (error.magnitude >= this.tuning.hardMagnitude) {
            this.startSnapCorrection(tick);
            return;
        }

        if (error.magnitude >= this.tuning.softMagnitude) {
            this.startSmoothCorrection(tick, error);
        }
    }

    private startSnapCorrection(tick: number) {
        this.correctionMode = 'snap';
        this.correctionCount += 1;
        this.snapCorrectionCount += 1;
        this.lastCorrectionTick = tick;
        this.smoothCorrection.active = false;
        this.smoothCorrection.initialError = null;
    }

    private startSmoothCorrection(tick: number, error: ReconciliationError) {
        if (this.smoothCorrection.active) return;

        this.correctionMode = 'smooth';
        this.correctionCount += 1;
        this.smoothCorrectionCount += 1;
        this.lastCorrectionTick = tick;
        this.smoothCorrection.active = true;
        this.smoothCorrection.startTick = tick;
        this.smoothCorrection.durationTicks = Math.max(1, this.tuning.smoothTicks);
        this.smoothCorrection.initialError = { ...error };
    }

    private applyCorrection(state: SimulationBaseState, tick: number): SimulationBaseState {
        if (this.correctionMode === 'snap') {
            // 스냅 보정은 즉시 authoritative 상태로 맞추고 모드를 종료한다.
            this.correctionMode = 'none';
            return state;
        }

        if (this.correctionMode !== 'smooth') {
            return state;
        }

        if (!this.smoothCorrection.active || !this.smoothCorrection.initialError) {
            this.correctionMode = 'none';
            return state;
        }

        const elapsed = tick - this.smoothCorrection.startTick;
        const progress = Math.max(0, Math.min(1, elapsed / this.smoothCorrection.durationTicks));
        if (progress >= 1) {
            this.smoothCorrection.active = false;
            this.smoothCorrection.initialError = null;
            this.correctionMode = 'none';
            return state;
        }

        // ease-out cubic: 빠르게 붙고 마지막에 부드럽게 수렴.
        const eased = 1 - Math.pow(1 - progress, 3);
        const remain = 1 - eased;
        const error = this.smoothCorrection.initialError;
        return {
            unitCount: state.unitCount + error.unitCount * remain,
            towerHpTotal: state.towerHpTotal + error.towerHpTotal * remain,
            blueElixir: state.blueElixir + error.blueElixir * remain,
            redElixir: state.redElixir + error.redElixir * remain,
            blueCrowns: state.blueCrowns + error.blueCrowns * remain,
            redCrowns: state.redCrowns + error.redCrowns * remain,
        };
    }

    private interpolateState(
        from: SimulationBaseState,
        to: SimulationBaseState,
        alpha: number
    ): SimulationBaseState {
        const lerp = (a: number, b: number) => a + (b - a) * alpha;

        return {
            unitCount: lerp(from.unitCount, to.unitCount),
            towerHpTotal: lerp(from.towerHpTotal, to.towerHpTotal),
            blueElixir: lerp(from.blueElixir, to.blueElixir),
            redElixir: lerp(from.redElixir, to.redElixir),
            blueCrowns: lerp(from.blueCrowns, to.blueCrowns),
            redCrowns: lerp(from.redCrowns, to.redCrowns),
        };
    }
}
