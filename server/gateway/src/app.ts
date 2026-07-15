export type GatewayService =
    | 'auth-service'
    | 'matchmaking-service'
    | 'match-simulator'
    | 'matches-service'
    | 'replay-service'
    | 'room-service';

export type HttpMethod = 'GET' | 'POST';

export interface GatewayRouteSpec {
    method: HttpMethod;
    path: string;
    operationId: string;
    owner: GatewayService;
    requestSchemaRef?: string;
    responseSchemaRef?: string;
}

export const GATEWAY_ROUTE_MANIFEST: readonly GatewayRouteSpec[] = [
    {
        method: 'POST',
        path: '/v1/auth/login',
        operationId: 'login',
        owner: 'auth-service',
        requestSchemaRef: '#/components/schemas/LoginRequest',
        responseSchemaRef: '#/components/schemas/LoginResponse'
    },
    {
        method: 'POST',
        path: '/v1/matchmaking/enqueue',
        operationId: 'enqueueMatchmaking',
        owner: 'matchmaking-service',
        requestSchemaRef: '#/components/schemas/EnqueueRequest',
        responseSchemaRef: '#/components/schemas/EnqueueResponse'
    },
    {
        method: 'POST',
        path: '/v1/matchmaking/cancel',
        operationId: 'cancelMatchmaking',
        owner: 'matchmaking-service',
        requestSchemaRef: '#/components/schemas/CancelMatchmakingRequest',
        responseSchemaRef: '#/components/schemas/CancelMatchmakingResponse'
    },
    {
        method: 'GET',
        path: '/v1/matchmaking/policy',
        operationId: 'getMatchmakingPolicy',
        owner: 'matchmaking-service',
        responseSchemaRef: '#/components/schemas/MatchmakingPolicy'
    },
    {
        method: 'POST',
        path: '/v1/matchmaking/tick',
        operationId: 'runMatchmakingTick',
        owner: 'matchmaking-service',
        responseSchemaRef: '#/components/schemas/MatchAssignmentsResponse'
    },
    {
        method: 'POST',
        path: '/v1/match-rooms/create',
        operationId: 'createMatchRoom',
        owner: 'room-service',
        requestSchemaRef: '#/components/schemas/CreateMatchRoomRequest',
        responseSchemaRef: '#/components/schemas/MatchRoomActionResponse'
    },
    {
        method: 'POST',
        path: '/v1/match-rooms/{roomId}/join',
        operationId: 'joinMatchRoom',
        owner: 'room-service',
        requestSchemaRef: '#/components/schemas/JoinMatchRoomRequest',
        responseSchemaRef: '#/components/schemas/MatchRoomActionResponse'
    },
    {
        method: 'POST',
        path: '/v1/match-rooms/{roomId}/finish',
        operationId: 'finishMatchRoom',
        owner: 'room-service',
        requestSchemaRef: '#/components/schemas/FinishMatchRoomRequest',
        responseSchemaRef: '#/components/schemas/MatchRoomActionResponse'
    },
    {
        method: 'POST',
        path: '/v1/match-rooms/{roomId}/cleanup',
        operationId: 'cleanupMatchRoom',
        owner: 'room-service',
        requestSchemaRef: '#/components/schemas/CleanupMatchRoomRequest',
        responseSchemaRef: '#/components/schemas/CleanupMatchRoomResponse'
    },
    {
        method: 'POST',
        path: '/v1/matches/result',
        operationId: 'submitMatchResult',
        owner: 'matches-service',
        requestSchemaRef: '#/components/schemas/MatchResultRequest',
        responseSchemaRef: '#/components/schemas/MatchResultResponse'
    },
    {
        method: 'GET',
        path: '/v1/matches/{matchId}/summary',
        operationId: 'getMatchSummary',
        owner: 'matches-service',
        responseSchemaRef: '#/components/schemas/MatchSummaryResponse'
    },
    {
        method: 'GET',
        path: '/v1/replays/{matchId}',
        operationId: 'getReplay',
        owner: 'replay-service',
        responseSchemaRef: '#/components/schemas/ReplayResponse'
    }
] as const;

export function findRouteByOperationId(operationId: string): GatewayRouteSpec | null {
    const route = GATEWAY_ROUTE_MANIFEST.find((spec: GatewayRouteSpec): boolean => {
        return spec.operationId === operationId;
    });

    return route ?? null;
}
