import type { InputCmd, SimulationBaseState } from '../systems/SimulationProtocol';

export interface RemoteBattleSnapshot {
    roomId: string;
    tick: number;
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
        hand: string[];
        nextUnitKey: string;
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
    onServerError?: (code: string, message: string) => void;
}

interface PendingMessage {
    payload: string;
    sent: boolean;
}

export default class BattleSocketClient {
    private readonly options: BattleSocketOptions;
    private socket: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private reconnectAttempt = 0;
    private closedByClient = false;
    private joined = false;
    private joinTimer: number | null = null;
    private pingTimer: number | null = null;
    private readonly pendingMessages = new Map<number, PendingMessage>();

    constructor(options: BattleSocketOptions) {
        this.options = options;
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
            payload = JSON.stringify({
                type: 'command',
                roomId: this.options.roomId,
                command: {
                    type: 'spawn',
                    playerId: this.options.playerId,
                    seq: command.seq,
                    unitKey: command.payload.unitKey,
                    x: this.options.team === 'blue' ? command.payload.x : 360 - command.payload.x,
                    y: this.options.team === 'blue' ? command.payload.y : 678 - command.payload.y,
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

    private openSocket(): void {
        this.options.onConnectionState?.(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
        const socket = new WebSocket(this.options.url);
        this.socket = socket;
        socket.addEventListener('open', async () => {
            const token = await this.options.tokenProvider?.();
            if (socket.readyState !== WebSocket.OPEN) return;
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
            const message = JSON.parse(String(event.data)) as {
                type: string;
                snapshot?: RemoteBattleSnapshot;
                seq?: number;
                accepted?: boolean;
                reason?: string;
                code?: string;
                message?: string;
                sentAt?: number;
            };
            if ((message.type === 'joined' || message.type === 'snapshot') && message.snapshot) {
                const snapshot = message.snapshot;
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
            } else if (message.type === 'command_result') {
                if (typeof message.seq === 'number') this.pendingMessages.delete(message.seq);
                this.options.onCommandResult?.(message.seq ?? -1, message.accepted === true, message.reason);
            } else if (message.type === 'pong' && typeof message.sentAt === 'number') {
                this.options.onLatency?.(Math.max(0, Date.now() - message.sentAt));
            } else if (message.type === 'error') {
                this.options.onServerError?.(message.code ?? 'server_error', message.message ?? 'server error');
            }
        });
        socket.addEventListener('close', () => {
            this.joined = false;
            for (const pending of this.pendingMessages.values()) pending.sent = false;
            if (this.joinTimer !== null) window.clearTimeout(this.joinTimer);
            if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
            this.joinTimer = null;
            this.pingTimer = null;
            this.scheduleReconnect();
        });
        socket.addEventListener('error', () => socket.close());
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
        this.pingTimer = window.setInterval(() => {
            if (!this.joined || this.socket?.readyState !== WebSocket.OPEN) return;
            this.socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        }, 5_000);
    }
}
