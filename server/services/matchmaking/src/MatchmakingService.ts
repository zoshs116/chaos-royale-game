import MatchmakingServiceError from './errors';
import MatchRoomService from './MatchRoomService';
import {
    DEFAULT_MATCHMAKING_POLICY,
    getQueuePolicy,
    isTicketPairCompatible,
    type MatchmakingPolicy,
    trySelectMatchRegion
} from './MatchmakingPolicy';
import type {
    CancelMatchmakingRequest,
    CancelMatchmakingResponse,
    CleanupMatchRoomRequest,
    CleanupMatchRoomResponse,
    CreateMatchRoomRequest,
    EnqueueRequest,
    EnqueueResponse,
    FinishMatchRoomRequest,
    JoinMatchRoomRequest,
    MatchAssignment,
    MatchRoomActionResponse,
    MatchmakingTicket,
    QueueType,
    RegionId
} from './types';

export interface MatchmakingServiceOptions {
    policy?: MatchmakingPolicy;
    roomService?: MatchRoomService;
}

export default class MatchmakingService {
    private readonly policy: MatchmakingPolicy;
    private readonly roomService: MatchRoomService;
    private ticketCounter: number = 0;
    private readonly ticketById: Map<string, MatchmakingTicket> = new Map<string, MatchmakingTicket>();
    private readonly activeTicketIdByPlayer: Map<string, string> = new Map<string, string>();
    private readonly queueByType: Record<QueueType, string[]> = {
        ladder_1v1: [],
        custom_1v1: [],
        party_2v2: []
    };

    constructor(options: MatchmakingServiceOptions = {}) {
        this.policy = options.policy ?? DEFAULT_MATCHMAKING_POLICY;
        this.roomService = options.roomService ?? new MatchRoomService();
    }

    public enqueue(request: EnqueueRequest, nowMs: number): EnqueueResponse {
        this.validateDeckSize(request.deck.length);

        if (this.activeTicketIdByPlayer.has(request.playerId)) {
            throw new MatchmakingServiceError('already_queued', 409, 'player already has active queue ticket.');
        }

        const queuePolicy = getQueuePolicy(this.policy, request.queueType);
        const ticketId = this.nextTicketId();
        const ticket: MatchmakingTicket = {
            ticketId,
            playerId: request.playerId,
            queueType: request.queueType,
            deck: request.deck,
            mmr: request.mmr,
            regionPreference: request.regionPreference,
            pingByRegion: request.pingByRegion,
            clientSnapshotHash: request.clientSnapshotHash,
            enqueuedAtMs: nowMs,
            status: 'queued'
        };

        this.ticketById.set(ticketId, ticket);
        this.activeTicketIdByPlayer.set(request.playerId, ticketId);
        this.queueByType[request.queueType].push(ticketId);

        const queueRegion = this.estimateQueueRegion(ticket);

        return {
            ticketId,
            status: 'queued',
            estimatedWaitSec: queuePolicy.estimatedWaitSec,
            queueRegion,
            enqueuedAtUtc: new Date(nowMs).toISOString()
        };
    }

    public cancel(request: CancelMatchmakingRequest, nowMs: number): CancelMatchmakingResponse {
        const ticket = this.ticketById.get(request.ticketId);
        if (!ticket || ticket.status !== 'queued') {
            throw new MatchmakingServiceError('ticket_not_found', 404, 'queue ticket not found.');
        }

        if (ticket.playerId !== request.playerId) {
            throw new MatchmakingServiceError('ticket_forbidden', 403, 'ticket does not belong to player.');
        }

        ticket.status = 'canceled';
        this.activeTicketIdByPlayer.delete(ticket.playerId);
        this.removeTicketFromQueue(ticket.queueType, ticket.ticketId);

        return {
            ticketId: ticket.ticketId,
            status: 'canceled',
            canceledAtUtc: new Date(nowMs).toISOString()
        };
    }

    public createRoom(request: CreateMatchRoomRequest, nowMs: number): MatchRoomActionResponse {
        return {
            room: this.roomService.createRoom(request, nowMs)
        };
    }

    public joinRoom(request: JoinMatchRoomRequest, nowMs: number): MatchRoomActionResponse {
        return {
            room: this.roomService.joinRoom(request, nowMs)
        };
    }

    public finishRoom(request: FinishMatchRoomRequest, nowMs: number): MatchRoomActionResponse {
        return {
            room: this.roomService.finishRoom(request, nowMs)
        };
    }

    public cleanupRoom(request: CleanupMatchRoomRequest, nowMs: number): CleanupMatchRoomResponse {
        return this.roomService.cleanupRoom(request, nowMs);
    }

    public runMatchmaking(nowMs: number): MatchAssignment[] {
        const assignments: MatchAssignment[] = [];
        const queueTypes: QueueType[] = ['ladder_1v1', 'custom_1v1', 'party_2v2'];
        for (const queueType of queueTypes) {
            assignments.push(...this.matchQueueType(queueType, nowMs));
        }
        return assignments;
    }

    public getPolicy(): MatchmakingPolicy {
        return this.policy;
    }

    private matchQueueType(queueType: QueueType, nowMs: number): MatchAssignment[] {
        const queue = this.queueByType[queueType];
        const playersPerRoom = getQueuePolicy(this.policy, queueType).playersPerRoom;
        const assignments: MatchAssignment[] = [];
        let cursor = 0;

        while (queue.length >= playersPerRoom && cursor < queue.length) {
            const anchorTicket = this.getActiveTicket(queue[cursor]);
            if (!anchorTicket) {
                queue.splice(cursor, 1);
                continue;
            }

            const selected = this.selectCompatibleTickets(anchorTicket, queueType, playersPerRoom, nowMs);
            if (selected.length < playersPerRoom) {
                cursor += 1;
                continue;
            }

            const region = trySelectMatchRegion(this.policy, selected, nowMs);
            if (!region) {
                cursor += 1;
                continue;
            }

            const room = this.roomService.createRoom(
                {
                    queueType,
                    region,
                    maxPlayers: playersPerRoom
                },
                nowMs
            );

            const ticketIds: string[] = [];
            const playerIds: string[] = [];
            for (const ticket of selected) {
                this.roomService.joinRoom(
                    {
                        roomId: room.roomId,
                        playerId: ticket.playerId
                    },
                    nowMs
                );

                ticket.status = 'matched';
                ticket.matchedRoomId = room.roomId;
                this.activeTicketIdByPlayer.delete(ticket.playerId);
                this.removeTicketFromQueue(ticket.queueType, ticket.ticketId);
                ticketIds.push(ticket.ticketId);
                playerIds.push(ticket.playerId);
            }

            assignments.push({
                roomId: room.roomId,
                queueType,
                region,
                playerIds,
                ticketIds,
                matchedAtUtc: new Date(nowMs).toISOString()
            });
        }

        return assignments;
    }

    private selectCompatibleTickets(
        anchor: MatchmakingTicket,
        queueType: QueueType,
        playersPerRoom: number,
        nowMs: number
    ): MatchmakingTicket[] {
        const queue = this.queueByType[queueType];
        const selected: MatchmakingTicket[] = [anchor];

        for (const ticketId of queue) {
            if (selected.length >= playersPerRoom) break;
            if (ticketId === anchor.ticketId) continue;

            const candidate = this.getActiveTicket(ticketId);
            if (!candidate) continue;

            const isCompatible = selected.every((existing: MatchmakingTicket): boolean => {
                return isTicketPairCompatible(this.policy, existing, candidate, nowMs);
            });

            if (isCompatible) {
                selected.push(candidate);
            }
        }

        return selected;
    }

    private getActiveTicket(ticketId: string): MatchmakingTicket | null {
        const ticket = this.ticketById.get(ticketId);
        if (!ticket || ticket.status !== 'queued') {
            return null;
        }
        return ticket;
    }

    private removeTicketFromQueue(queueType: QueueType, ticketId: string): void {
        const queue = this.queueByType[queueType];
        const index = queue.indexOf(ticketId);
        if (index >= 0) {
            queue.splice(index, 1);
        }
    }

    private estimateQueueRegion(ticket: MatchmakingTicket): RegionId {
        const immediateRegion = trySelectMatchRegion(this.policy, [ticket], ticket.enqueuedAtMs);
        if (immediateRegion) return immediateRegion;
        return 'ap-northeast';
    }

    private validateDeckSize(deckSize: number): void {
        if (deckSize !== 8) {
            throw new MatchmakingServiceError('invalid_deck', 400, 'deck must contain exactly 8 cards.');
        }
    }

    private nextTicketId(): string {
        this.ticketCounter += 1;
        return `q_${this.ticketCounter.toString().padStart(8, '0')}`;
    }
}
