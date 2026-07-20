import type { InputCmd, SimulationBaseState } from '../systems/SimulationProtocol';

export interface RemoteBattleSnapshot {
    roomId: string;
    tick: number;
    state: 'waiting' | 'running' | 'finished';
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
}

export default class BattleSocketClient {
    private readonly options: BattleSocketOptions;
    private socket: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private reconnectAttempt = 0;
    private closedByClient = false;

    constructor(options: BattleSocketOptions) {
        this.options = options;
    }

    public connect(): void {
        this.closedByClient = false;
        this.openSocket();
    }

    public sendInput(command: InputCmd): boolean {
        if (this.socket?.readyState !== WebSocket.OPEN) return false;
        if (command.action === 'cast_active_skill') {
            this.socket.send(JSON.stringify({
                type: 'command',
                roomId: this.options.roomId,
                command: {
                    type: 'cast_active_skill',
                    playerId: this.options.playerId,
                    seq: command.seq,
                    unitId: command.payload.unitId,
                    skillKey: command.payload.skillKey,
                },
            }));
            return true;
        }
        if (command.action !== 'spawn_unit') return false;
        this.socket.send(JSON.stringify({
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
        }));
        return true;
    }

    public sendForfeit(seq: number): boolean {
        if (this.socket?.readyState !== WebSocket.OPEN) return false;
        this.socket.send(JSON.stringify({
            type: 'command',
            roomId: this.options.roomId,
            command: {
                type: 'forfeit',
                playerId: this.options.playerId,
                seq,
            },
        }));
        return true;
    }

    public close(): void {
        this.closedByClient = true;
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        this.socket?.close();
        this.socket = null;
        this.options.onConnectionState?.('closed');
    }

    public isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    private openSocket(): void {
        this.options.onConnectionState?.(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
        const socket = new WebSocket(this.options.url);
        this.socket = socket;
        socket.addEventListener('open', async () => {
            this.reconnectAttempt = 0;
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
            this.options.onConnectionState?.('connected');
        });
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as {
                type: string;
                snapshot?: RemoteBattleSnapshot;
                seq?: number;
                accepted?: boolean;
                reason?: string;
            };
            if ((message.type === 'joined' || message.type === 'snapshot') && message.snapshot) {
                const snapshot = message.snapshot;
                const localIsBlue = this.options.team === 'blue';
                this.options.onSnapshot(snapshot, {
                    unitCount: 0,
                    towerHpTotal: snapshot.blueKingHp + snapshot.redKingHp,
                    blueElixir: localIsBlue ? snapshot.blueElixir : snapshot.redElixir,
                    redElixir: localIsBlue ? snapshot.redElixir : snapshot.blueElixir,
                    blueCrowns: localIsBlue ? snapshot.blueCrowns : snapshot.redCrowns,
                    redCrowns: localIsBlue ? snapshot.redCrowns : snapshot.blueCrowns,
                });
            } else if (message.type === 'command_result') {
                this.options.onCommandResult?.(message.seq ?? -1, message.accepted === true, message.reason);
            }
        });
        socket.addEventListener('close', () => this.scheduleReconnect());
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
}
