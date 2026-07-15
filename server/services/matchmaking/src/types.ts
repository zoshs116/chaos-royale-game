export const QUEUE_TYPES = ['ladder_1v1', 'custom_1v1', 'party_2v2'] as const;
export type QueueType = (typeof QUEUE_TYPES)[number];

export const REGION_IDS = ['ap-northeast', 'ap-southeast', 'us-west', 'us-east', 'eu-central'] as const;
export type RegionId = (typeof REGION_IDS)[number];
export type RegionPreference = 'auto' | RegionId;

export type WinnerTeamId = 'blue' | 'red' | 'draw';

export interface DeckCard {
    cardId: string;
    level: number;
}

export interface EnqueueRequest {
    playerId: string;
    queueType: QueueType;
    deck: DeckCard[];
    mmr: number;
    regionPreference: RegionPreference;
    pingByRegion: Partial<Record<RegionId, number>>;
    clientSnapshotHash: string;
}

export interface EnqueueResponse {
    ticketId: string;
    status: 'queued';
    estimatedWaitSec: number;
    queueRegion: RegionId;
    enqueuedAtUtc: string;
}

export interface CancelMatchmakingRequest {
    playerId: string;
    ticketId: string;
    reason?: 'manual' | 'timeout' | 'disconnect';
}

export interface CancelMatchmakingResponse {
    ticketId: string;
    status: 'canceled';
    canceledAtUtc: string;
}

export interface MatchmakingTicket {
    ticketId: string;
    playerId: string;
    queueType: QueueType;
    deck: DeckCard[];
    mmr: number;
    regionPreference: RegionPreference;
    pingByRegion: Partial<Record<RegionId, number>>;
    clientSnapshotHash: string;
    enqueuedAtMs: number;
    status: 'queued' | 'matched' | 'canceled';
    matchedRoomId?: string;
}

export interface CreateMatchRoomRequest {
    queueType: QueueType;
    region: RegionId;
    maxPlayers: number;
    ownerPlayerId?: string;
}

export interface JoinMatchRoomRequest {
    roomId: string;
    playerId: string;
}

export interface FinishMatchRoomRequest {
    roomId: string;
    winnerTeamId: WinnerTeamId;
    resultDigestSha256: string;
    endedAtUtc: string;
}

export interface CleanupMatchRoomRequest {
    roomId: string;
    reason: 'completed' | 'aborted' | 'timeout';
}

export interface MatchRoomSnapshot {
    roomId: string;
    queueType: QueueType;
    region: RegionId;
    state: 'created' | 'queued' | 'provisioning' | 'running' | 'finishing' | 'archived' | 'failed';
    revision: number;
    maxPlayers: number;
    playerIds: string[];
    winnerTeamId?: WinnerTeamId;
    resultDigestSha256?: string;
    createdAtUtc: string;
    updatedAtUtc: string;
}

export interface MatchRoomActionResponse {
    room: MatchRoomSnapshot;
}

export interface CleanupMatchRoomResponse {
    roomId: string;
    cleanedUp: boolean;
    archivedRevision: number;
    cleanedAtUtc: string;
}

export interface MatchAssignment {
    roomId: string;
    queueType: QueueType;
    region: RegionId;
    playerIds: string[];
    ticketIds: string[];
    matchedAtUtc: string;
}
