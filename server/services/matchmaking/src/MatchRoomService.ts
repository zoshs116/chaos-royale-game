import MatchLifecycleMachine from '../../../match-simulator/src/lifecycle/MatchLifecycleMachine';
import type { MatchLifecycleState } from '../../../match-simulator/src/lifecycle/MatchLifecycleMachine';
import MatchmakingServiceError from './errors';
import type {
    CleanupMatchRoomRequest,
    CleanupMatchRoomResponse,
    CreateMatchRoomRequest,
    FinishMatchRoomRequest,
    JoinMatchRoomRequest,
    MatchRoomSnapshot,
    WinnerTeamId
} from './types';

interface MatchRoomRecord {
    roomId: string;
    queueType: CreateMatchRoomRequest['queueType'];
    region: CreateMatchRoomRequest['region'];
    maxPlayers: number;
    playerIds: string[];
    machine: MatchLifecycleMachine;
    winnerTeamId?: WinnerTeamId;
    resultDigestSha256?: string;
    createdAtMs: number;
    updatedAtMs: number;
}

export default class MatchRoomService {
    private roomCounter: number = 0;
    private readonly activeRooms: Map<string, MatchRoomRecord> = new Map<string, MatchRoomRecord>();
    private readonly archivedRooms: Map<string, MatchRoomRecord> = new Map<string, MatchRoomRecord>();

    public createRoom(request: CreateMatchRoomRequest, nowMs: number): MatchRoomSnapshot {
        if (request.maxPlayers < 2 || request.maxPlayers > 4) {
            throw new MatchmakingServiceError('invalid_room_size', 400, 'maxPlayers must be between 2 and 4.');
        }

        const roomId = this.nextRoomId();
        const machine = new MatchLifecycleMachine(roomId);
        const record: MatchRoomRecord = {
            roomId,
            queueType: request.queueType,
            region: request.region,
            maxPlayers: request.maxPlayers,
            playerIds: [],
            machine,
            createdAtMs: nowMs,
            updatedAtMs: nowMs
        };

        this.activeRooms.set(roomId, record);

        if (request.ownerPlayerId) {
            this.joinRoom(
                {
                    roomId,
                    playerId: request.ownerPlayerId
                },
                nowMs
            );
        }

        return this.toSnapshot(record);
    }

    public joinRoom(request: JoinMatchRoomRequest, nowMs: number): MatchRoomSnapshot {
        const record = this.activeRooms.get(request.roomId);
        if (!record) {
            throw new MatchmakingServiceError('room_not_found', 404, 'match room not found.');
        }

        if (record.playerIds.includes(request.playerId)) {
            return this.toSnapshot(record);
        }

        if (record.playerIds.length >= record.maxPlayers) {
            throw new MatchmakingServiceError('room_full', 409, 'match room is full.');
        }

        if (record.machine.can('queue_assigned')) {
            record.machine.transition('queue_assigned');
        }

        record.playerIds.push(request.playerId);
        record.updatedAtMs = nowMs;

        if (record.playerIds.length >= record.maxPlayers) {
            if (record.machine.can('server_reserved')) {
                record.machine.transition('server_reserved');
            }
            if (record.machine.can('start_match')) {
                record.machine.transition('start_match');
            }
            record.updatedAtMs = nowMs;
        }

        return this.toSnapshot(record);
    }

    public finishRoom(request: FinishMatchRoomRequest, nowMs: number): MatchRoomSnapshot {
        const record = this.activeRooms.get(request.roomId);
        if (!record) {
            throw new MatchmakingServiceError('room_not_found', 404, 'match room not found.');
        }

        if (!record.machine.can('submit_result')) {
            throw new MatchmakingServiceError(
                'invalid_room_state',
                409,
                'room is not in running state for finish.'
            );
        }

        record.machine.transition('submit_result');
        record.winnerTeamId = request.winnerTeamId;
        record.resultDigestSha256 = request.resultDigestSha256;
        record.updatedAtMs = nowMs;
        return this.toSnapshot(record);
    }

    public cleanupRoom(request: CleanupMatchRoomRequest, nowMs: number): CleanupMatchRoomResponse {
        const record = this.activeRooms.get(request.roomId);
        if (!record) {
            throw new MatchmakingServiceError('room_not_found', 404, 'match room not found.');
        }

        if (!record.machine.can('archive_done')) {
            throw new MatchmakingServiceError(
                'invalid_room_state',
                409,
                'room must be finishing before cleanup.'
            );
        }

        record.machine.transition('archive_done');
        record.updatedAtMs = nowMs;
        this.activeRooms.delete(request.roomId);
        this.archivedRooms.set(request.roomId, record);

        return {
            roomId: record.roomId,
            cleanedUp: true,
            archivedRevision: record.machine.getSnapshot().revision,
            cleanedAtUtc: new Date(nowMs).toISOString()
        };
    }

    public getRoom(roomId: string): MatchRoomSnapshot | null {
        const activeRecord = this.activeRooms.get(roomId);
        if (activeRecord) return this.toSnapshot(activeRecord);

        const archivedRecord = this.archivedRooms.get(roomId);
        if (archivedRecord) return this.toSnapshot(archivedRecord);

        return null;
    }

    private toSnapshot(record: MatchRoomRecord): MatchRoomSnapshot {
        const lifecycle = record.machine.getSnapshot();
        return {
            roomId: record.roomId,
            queueType: record.queueType,
            region: record.region,
            state: lifecycle.state as MatchLifecycleState,
            revision: lifecycle.revision,
            maxPlayers: record.maxPlayers,
            playerIds: [...record.playerIds],
            winnerTeamId: record.winnerTeamId,
            resultDigestSha256: record.resultDigestSha256,
            createdAtUtc: new Date(record.createdAtMs).toISOString(),
            updatedAtUtc: new Date(record.updatedAtMs).toISOString()
        };
    }

    private nextRoomId(): string {
        this.roomCounter += 1;
        return `r_${this.roomCounter.toString().padStart(8, '0')}`;
    }
}
