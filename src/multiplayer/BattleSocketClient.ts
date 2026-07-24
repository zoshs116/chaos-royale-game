import type { InputCmd, SimulationBaseState } from '../systems/SimulationProtocol';
import ServerClockEstimator, { type ClockDiagnostics } from './ServerClockEstimator';
import BattleViewTransform from './BattleViewTransform';

export interface BattleNetworkDiagnostics extends ClockDiagnostics {
    snapshotAgeMs: number;
    snapshotBytes: number;
    parseMs: number;
    receivedTick: number;
    receivedSequence: number;
    staleSnapshots: number;
}

export interface RemoteBattleSnapshot {
    roomId: string;
    tick: number;
    sequence: number;
    serverTimeMs: number;
    state: 'waiting' | 'running' | 'finished';
    paused: boolean;
    disconnectGraceRemainingMs: number | null;
    remainingMs: number;
    blueElixir: number;
    redElixir: number;
    blueKingHp: number;
    redKingHp: number;
    blueCrowns: number;
    redCrowns: number;
    ackByPlayer: Record<string, number>;
    players: Array<{
        playerId: string;
        team: 'blue' | 'red';
        connected: boolean;
        hand: Array<string | null>;
        nextUnitKey: string | null;
    }>;
    units: Array<{
        id: string;
        ownerId: string;
        team: 'blue' | 'red';
        unitKey: string;
        x: number;
        y: number;
        hp: number;
        maxHp: number;
        state: 'spawning' | 'idle' | 'moving' | 'attacking' | 'jumping' | 'stunned' | 'casting';
        targetId: string | null;
        attackSerial: number;
        hitSerial: number;
        jumpSerial: number;
        directionX: number;
        directionY: number;
        elevation: number;
        activeSkillKey: string | null;
        activeSkillPhase: 'ready' | 'casting' | 'cooldown' | null;
        activeSkillCooldownRemainingMs: number;
        activeSkillCastSerial: number;
        spawnTick: number;
        attackTick: number;
        hitTick: number;
        jumpTick: number;
        activeSkillCastTick: number;
    }>;
    projectiles: Array<{
        id: string;
        team: 'blue' | 'red';
        projectileKey: string;
        x: number;
        y: number;
        directionX: number;
        directionY: number;
        targetId: string;
    }>;
    skillZones: Array<{
        id: string;
        skillKey: string;
        team: 'blue' | 'red';
        x: number;
        y: number;
        radius: number;
        remainingMs: number;
    }>;
    towers: Array<{
        id: string;
        team: 'blue' | 'red';
        type: 'king' | 'princess';
        x: number;
        y: number;
        hp: number;
        maxHp: number;
        active: boolean;
    }>;
    winner: 'blue' | 'red' | 'draw' | null;
    finishReason: 'king_destroyed' | 'time_limit' | 'forfeit' | 'disconnect_timeout' | null;
}

interface BattleSocketOptions {
    url: string;
    roomId: string;
    playerId: string;
    team: 'blue' | 'red';
    deck: string[];
    tokenProvider?: () => Promise<string | undefined>;
    onSnapshot: (snapshot: RemoteBattleSnapshot, baseState: SimulationBaseState) => void;
    onCommandResult?: (seq: number, accepted: boolean, reason?: string) => void;
    onConnectionState?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
    onLatency?: (latencyMs: number) => void;
    onNetworkDiagnostics?: (diagnostics: BattleNetworkDiagnostics) => void;
    onServerError?: (code: string, message: string) => void;
}

interface PendingMessage {
    payload: string;
    sent: boolean;
}

export default class BattleSocketClient {
    private readonly options: BattleSocketOptions;
    private readonly viewTransform: BattleViewTransform;
    private socket: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private reconnectAttempt = 0;
    private closedByClient = false;
    private joined = false;
    private joinTimer: number | null = null;
    private pingTimer: number | null = null;
    private readonly pendingMessages = new Map<number, PendingMessage>();
    private readonly clock = new ServerClockEstimator();
    private lastSnapshotSequence = -1;
    private staleSnapshots = 0;
    private diagnostics: BattleNetworkDiagnostics = {
        rttMs: 0,
        jitterMs: 0,
        offsetMs: 0,
        sampleCount: 0,
        snapshotAgeMs: 0,
        snapshotBytes: 0,
        parseMs: 0,
        receivedTick: -1,
        receivedSequence: -1,
        staleSnapshots: 0,
    };

    constructor(options: BattleSocketOptions) {
        this.options = options;
        this.viewTransform = new BattleViewTransform(options.team);
    }

    public connect(): void {
        this.closedByClient = false;
        this.openSocket();
    }

    public sendInput(command: InputCmd): boolean {
        if (this.closedByClient) return false;
        let payload: string;
        if (command.action === 'cast_active_skill') {
            payload = JSON.stringify({
                type: 'command',
                roomId: this.options.roomId,
                command: {
                    type: 'cast_active_skill',
                    playerId: this.options.playerId,
                    seq: command.seq,
                    unitId: command.payload.unitId,
                    skillKey: command.payload.skillKey,
                },
            });
        } else {
            if (command.action !== 'spawn_unit') return false;
            const worldPoint = this.viewTransform.viewToWorldPoint({
                x: command.payload.x,
                y: command.payload.y,
            });
            payload = JSON.stringify({
                type: 'command',
                roomId: this.options.roomId,
                command: {
                    type: 'spawn',
                    playerId: this.options.playerId,
                    seq: command.seq,
                    unitKey: command.payload.unitKey,
                    x: worldPoint.x,
                    y: worldPoint.y,
                    handIndex: command.payload.handIndex,
                },
            });
        }
        this.pendingMessages.set(command.seq, { payload, sent: false });
        this.flushPendingMessages();
        return true;
    }

    public sendForfeit(seq: number): boolean {
        if (this.closedByClient) return false;
        const payload = JSON.stringify({
            type: 'command',
            roomId: this.options.roomId,
            command: {
                type: 'forfeit',
                playerId: this.options.playerId,
                seq,
            },
        });
        this.pendingMessages.set(seq, { payload, sent: false });
        this.flushPendingMessages();
        return true;
    }

    public close(): void {
        this.closedByClient = true;
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        if (this.joinTimer !== null) window.clearTimeout(this.joinTimer);
        if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
        this.reconnectTimer = null;
        this.joinTimer = null;
        this.pingTimer = null;
        this.joined = false;
        this.pendingMessages.clear();
        this.socket?.close();
        this.socket = null;
        this.options.onConnectionState?.('closed');
    }

    public isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN && this.joined;
    }

    public getEstimatedServerTimeMs(clientNowMs = Date.now()): number {
        return this.clock.estimateServerTime(clientNowMs);
    }

    public getNetworkDiagnostics(): Readonly<BattleNetworkDiagnostics> {
        return this.diagnostics;
    }

    private openSocket(): void {
        this.options.onConnectionState?.(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
        const socket = new WebSocket(this.options.url);
        this.socket = socket;
        this.clock.reset();
        this.lastSnapshotSequence = -1;
        socket.addEventListener('open', async () => {
            const token = await this.options.tokenProvider?.();
            if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify({
                type: 'join',
                roomId: this.options.roomId,
                token,
                player: {
                    playerId: this.options.playerId,
                    team: this.options.team,
                    deck: this.options.deck,
                },
            }));
            this.joinTimer = window.setTimeout(() => {
                if (!this.joined && socket.readyState === WebSocket.OPEN) socket.close();
            }, 10_000);
        });
        socket.addEventListener('message', (event) => {
            if (this.socket !== socket) return;
            const receivedAtMs = Date.now();
            const raw = String(event.data);
            const parseStartedAt = performance.now();
            const message = JSON.parse(raw) as {
                type: string;
                snapshot?: RemoteBattleSnapshot;
                seq?: number;
                accepted?: boolean;
                reason?: string;
                code?: string;
                message?: string;
                sentAt?: number;
                serverAt?: number;
            };
            const parseMs = performance.now() - parseStartedAt;
            if ((message.type === 'joined' || message.type === 'snapshot') && message.snapshot) {
                const snapshot = message.snapshot;
                this.clock.bootstrap(snapshot.serverTimeMs, receivedAtMs);
                if (snapshot.sequence <= this.lastSnapshotSequence) {
                    this.staleSnapshots += 1;
                    this.publishDiagnostics(snapshot, raw.length, parseMs, receivedAtMs);
                    return;
                }
                this.lastSnapshotSequence = snapshot.sequence;
                if (message.type === 'joined') {
                    this.joined = true;
                    this.reconnectAttempt = 0;
                    if (this.joinTimer !== null) window.clearTimeout(this.joinTimer);
                    this.joinTimer = null;
                    this.options.onConnectionState?.('connected');
                    this.startPingLoop();
                }
                const acknowledgedSeq = snapshot.ackByPlayer[this.options.playerId] ?? 0;
                for (const seq of this.pendingMessages.keys()) {
                    if (seq <= acknowledgedSeq) this.pendingMessages.delete(seq);
                }
                const localIsBlue = this.options.team === 'blue';
                this.options.onSnapshot(snapshot, {
                    unitCount: 0,
                    towerHpTotal: snapshot.blueKingHp + snapshot.redKingHp,
                    blueElixir: localIsBlue ? snapshot.blueElixir : snapshot.redElixir,
                    redElixir: localIsBlue ? snapshot.redElixir : snapshot.blueElixir,
                    blueCrowns: localIsBlue ? snapshot.blueCrowns : snapshot.redCrowns,
                    redCrowns: localIsBlue ? snapshot.redCrowns : snapshot.blueCrowns,
                });
                if (message.type === 'joined') this.flushPendingMessages();
                this.publishDiagnostics(snapshot, raw.length, parseMs, receivedAtMs);
            } else if (message.type === 'command_result') {
                if (typeof message.seq === 'number') this.pendingMessages.delete(message.seq);
                this.options.onCommandResult?.(message.seq ?? -1, message.accepted === true, message.reason);
            } else if (message.type === 'pong' && typeof message.sentAt === 'number' && typeof message.serverAt === 'number') {
                const clock = this.clock.addPong(message.sentAt, receivedAtMs, message.serverAt);
                this.options.onLatency?.(clock.rttMs);
                this.diagnostics = { ...this.diagnostics, ...clock };
                this.options.onNetworkDiagnostics?.(this.diagnostics);
            } else if (message.type === 'error') {
                this.options.onServerError?.(message.code ?? 'server_error', message.message ?? 'server error');
            }
        });
        socket.addEventListener('close', () => {
            if (this.socket !== socket) return;
            this.joined = false;
            for (const pending of this.pendingMessages.values()) pending.sent = false;
            if (this.joinTimer !== null) window.clearTimeout(this.joinTimer);
            if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
            this.joinTimer = null;
            this.pingTimer = null;
            this.scheduleReconnect();
        });
        socket.addEventListener('error', () => {
            if (this.socket === socket) socket.close();
        });
    }

    private scheduleReconnect(): void {
        if (this.closedByClient || this.reconnectTimer !== null) return;
        this.options.onConnectionState?.('reconnecting');
        const delay = Math.min(5000, 300 * 2 ** this.reconnectAttempt);
        this.reconnectAttempt += 1;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
        }, delay);
    }

    private flushPendingMessages(): void {
        if (!this.joined || this.socket?.readyState !== WebSocket.OPEN) return;
        for (const pending of this.pendingMessages.values()) {
            if (pending.sent) continue;
            this.socket.send(pending.payload);
            pending.sent = true;
        }
    }

    private startPingLoop(): void {
        if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
        this.sendPing();
        this.pingTimer = window.setInterval(() => {
            this.sendPing();
        }, 2_000);
    }

    private sendPing(): void {
        if (!this.joined || this.socket?.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
    }

    private publishDiagnostics(
        snapshot: RemoteBattleSnapshot,
        snapshotBytes: number,
        parseMs: number,
        receivedAtMs: number,
    ): void {
        const clock = this.clock.getDiagnostics();
        this.diagnostics = {
            ...clock,
            snapshotAgeMs: Math.max(0, this.clock.estimateServerTime(receivedAtMs) - snapshot.serverTimeMs),
            snapshotBytes,
            parseMs,
            receivedTick: snapshot.tick,
            receivedSequence: snapshot.sequence,
            staleSnapshots: this.staleSnapshots,
        };
        this.options.onNetworkDiagnostics?.(this.diagnostics);
    }
}
