import { GATEWAY_ROUTE_MANIFEST } from './app';
import { createServerStorage } from '../../storage';
import {
    createMatchmakingHandlers,
    MatchmakingService,
    MatchRoomService,
    type CancelMatchmakingRequest,
    type CleanupMatchRoomRequest,
    type CreateMatchRoomRequest,
    type EnqueueRequest,
    type FinishMatchRoomRequest,
    type JoinMatchRoomRequest
} from '../../services/matchmaking/src';
import { MmrService } from '../../services/mmr/src';
import {
    createReplayHandlers,
    ReplayService,
    type GetReplayRequest
} from '../../services/replay/src';
import {
    createMatchResultHandlers,
    MatchResultService,
    type GetMatchSummaryRequest,
    type MatchResultRequest
} from '../../services/matches/src';

interface HandlerResult<TBody = unknown> {
    status: number;
    body: TBody;
}

export interface GatewayOperationRequest<TBody = unknown> {
    body?: TBody;
    params?: Record<string, string>;
    nowMs?: number;
}

export type GatewayOperationId = (typeof GATEWAY_ROUTE_MANIFEST)[number]['operationId'];
type GatewayHandler = (request: GatewayOperationRequest) => Promise<HandlerResult> | HandlerResult;

const storage = await createServerStorage();

const roomService = new MatchRoomService();
const matchmakingService = new MatchmakingService({ roomService });
const matchmakingHandlers = createMatchmakingHandlers(matchmakingService);
const mmrService = new MmrService({ storage });
const replayService = new ReplayService({ storage });
const replayHandlers = createReplayHandlers(replayService);
const matchResultService = new MatchResultService({ storage, mmrService, replayService });
const matchResultHandlers = createMatchResultHandlers(matchResultService);

const OPERATION_HANDLERS: Record<GatewayOperationId, GatewayHandler> = {
    login: (_request: GatewayOperationRequest): HandlerResult => {
        return notImplemented('login');
    },
    enqueueMatchmaking: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as EnqueueRequest;
        return matchmakingHandlers.enqueueMatchmaking(payload, { nowMs: resolveNowMs(request.nowMs) });
    },
    cancelMatchmaking: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as CancelMatchmakingRequest;
        return matchmakingHandlers.cancelMatchmaking(payload, { nowMs: resolveNowMs(request.nowMs) });
    },
    getMatchmakingPolicy: (request: GatewayOperationRequest): HandlerResult => {
        return matchmakingHandlers.getMatchmakingPolicy({ nowMs: resolveNowMs(request.nowMs) });
    },
    runMatchmakingTick: (request: GatewayOperationRequest): HandlerResult => {
        return matchmakingHandlers.runQueueTick({ nowMs: resolveNowMs(request.nowMs) });
    },
    createMatchRoom: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as CreateMatchRoomRequest;
        return matchmakingHandlers.createMatchRoom(payload, { nowMs: resolveNowMs(request.nowMs) });
    },
    joinMatchRoom: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as JoinMatchRoomRequest;
        const roomId = resolveRoomId(payload.roomId, request.params?.roomId);
        return matchmakingHandlers.joinMatchRoom(
            {
                ...payload,
                roomId
            },
            { nowMs: resolveNowMs(request.nowMs) }
        );
    },
    finishMatchRoom: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as FinishMatchRoomRequest;
        const roomId = resolveRoomId(payload.roomId, request.params?.roomId);
        return matchmakingHandlers.finishMatchRoom(
            {
                ...payload,
                roomId
            },
            { nowMs: resolveNowMs(request.nowMs) }
        );
    },
    cleanupMatchRoom: (request: GatewayOperationRequest): HandlerResult => {
        const payload = request.body as CleanupMatchRoomRequest;
        const roomId = resolveRoomId(payload.roomId, request.params?.roomId);
        return matchmakingHandlers.cleanupMatchRoom(
            {
                ...payload,
                roomId
            },
            { nowMs: resolveNowMs(request.nowMs) }
        );
    },
    submitMatchResult: async (request: GatewayOperationRequest): Promise<HandlerResult> => {
        const payload = request.body as MatchResultRequest;
        return matchResultHandlers.submitMatchResult(payload, { nowMs: resolveNowMs(request.nowMs) });
    },
    getMatchSummary: async (request: GatewayOperationRequest): Promise<HandlerResult> => {
        const payload: GetMatchSummaryRequest = {
            matchId: request.params?.matchId ?? ''
        };
        return matchResultHandlers.getMatchSummary(payload, { nowMs: resolveNowMs(request.nowMs) });
    },
    getReplay: async (request: GatewayOperationRequest): Promise<HandlerResult> => {
        const payload: GetReplayRequest = {
            matchId: request.params?.matchId ?? ''
        };
        return replayHandlers.getReplay(payload, { nowMs: resolveNowMs(request.nowMs) });
    }
};

export async function dispatchGatewayOperation(
    operationId: GatewayOperationId,
    request: GatewayOperationRequest
): Promise<HandlerResult> {
    const handler = OPERATION_HANDLERS[operationId];
    if (!handler) {
        return {
            status: 404,
            body: {
                code: 'operation_not_found',
                message: `unknown operation: ${operationId}`
            }
        };
    }

    return await handler(request);
}

export function listGatewayOperations(): GatewayOperationId[] {
    return GATEWAY_ROUTE_MANIFEST.map((spec) => spec.operationId) as GatewayOperationId[];
}

export async function closeGatewayResources(): Promise<void> {
    await storage.close();
}

function resolveNowMs(nowMs: number | undefined): number {
    return nowMs ?? Date.now();
}

function resolveRoomId(bodyRoomId: string | undefined, pathRoomId: string | undefined): string {
    const roomId = bodyRoomId ?? pathRoomId;
    if (!roomId) {
        throw new Error('roomId is required.');
    }
    return roomId;
}

function notImplemented(operationId: string): HandlerResult {
    return {
        status: 501,
        body: {
            code: 'not_implemented',
            message: `${operationId} is not implemented in skeleton phase.`
        }
    };
}
