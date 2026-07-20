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

    public tick(): BattleSnapshot[] {
        const snapshots = [...this.rooms.values()].map((room) => room.step());
        const now = Date.now();
        for (const snapshot of snapshots) {
            if (snapshot.state === 'finished') this.finishedAt.set(snapshot.roomId, this.finishedAt.get(snapshot.roomId) ?? now);
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
