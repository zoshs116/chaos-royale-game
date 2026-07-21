import AuthoritativeBattleRoom, {
    type BattleCommand,
    type BattlePlayerConfig,
    type BattleSnapshot,
} from '../../match-simulator/src/AuthoritativeBattleRoom';

export default class BattleRoomRegistry {
    private readonly rooms = new Map<string, AuthoritativeBattleRoom>();
    private readonly finishedAt = new Map<string, number>();

    public join(roomId: string, config: BattlePlayerConfig): BattleSnapshot {
        const room = this.rooms.get(roomId) ?? new AuthoritativeBattleRoom(roomId);
        this.rooms.set(roomId, room);
        return room.join(config);
    }

    public enqueue(roomId: string, command: BattleCommand): { accepted: boolean; reason?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { accepted: false, reason: 'room_not_found' };
        return room.enqueue(command);
    }

    public disconnect(roomId: string, playerId: string): void {
        this.rooms.get(roomId)?.disconnect(playerId);
    }

    public tick(options: { includeRunning?: boolean; includePaused?: boolean } = {}): BattleSnapshot[] {
        const includeRunning = options.includeRunning ?? true;
        const includePaused = options.includePaused ?? true;
        const snapshots: BattleSnapshot[] = [];
        const now = Date.now();
        for (const room of this.rooms.values()) {
            const previousState = room.getState();
            room.advance();
            const state = room.getState();
            if (state === 'finished') {
                const firstFinishedSnapshot = !this.finishedAt.has(room.roomId);
                this.finishedAt.set(room.roomId, this.finishedAt.get(room.roomId) ?? now);
                if (firstFinishedSnapshot) snapshots.push(room.snapshot());
                continue;
            }
            if (state !== 'running') continue;
            if ((room.isPaused() && includePaused) || (!room.isPaused() && includeRunning) || state !== previousState) {
                snapshots.push(room.snapshot());
            }
        }
        for (const [roomId, finishedAt] of this.finishedAt) {
            if (now - finishedAt < 5 * 60 * 1000) continue;
            this.rooms.delete(roomId);
            this.finishedAt.delete(roomId);
        }
        return snapshots;
    }

    public get(roomId: string): BattleSnapshot | null {
        return this.rooms.get(roomId)?.snapshot() ?? null;
    }
}
