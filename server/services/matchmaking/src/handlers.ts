import MatchmakingService from './MatchmakingService';
import MatchmakingServiceError from './errors';
import type {
    CancelMatchmakingRequest,
    CleanupMatchRoomRequest,
    CreateMatchRoomRequest,
    EnqueueRequest,
    FinishMatchRoomRequest,
    JoinMatchRoomRequest
} from './types';

export interface HandlerContext {
    nowMs: number;
}

export interface HandlerResult<TBody = unknown> {
    status: number;
    body: TBody;
}

interface ErrorBody {
    code: string;
    message: string;
}

export interface MatchmakingHandlers {
    enqueueMatchmaking: (request: EnqueueRequest, context: HandlerContext) => HandlerResult;
    cancelMatchmaking: (request: CancelMatchmakingRequest, context: HandlerContext) => HandlerResult;
    createMatchRoom: (request: CreateMatchRoomRequest, context: HandlerContext) => HandlerResult;
    joinMatchRoom: (request: JoinMatchRoomRequest, context: HandlerContext) => HandlerResult;
    finishMatchRoom: (request: FinishMatchRoomRequest, context: HandlerContext) => HandlerResult;
    cleanupMatchRoom: (request: CleanupMatchRoomRequest, context: HandlerContext) => HandlerResult;
    runQueueTick: (context: HandlerContext) => HandlerResult;
    getMatchmakingPolicy: (context: HandlerContext) => HandlerResult;
}

export function createMatchmakingHandlers(service: MatchmakingService): MatchmakingHandlers {
    return {
        enqueueMatchmaking(request: EnqueueRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.enqueue(request, context.nowMs);
                return {
                    status: 202,
                    body: response
                };
            });
        },

        cancelMatchmaking(request: CancelMatchmakingRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.cancel(request, context.nowMs);
                return {
                    status: 200,
                    body: response
                };
            });
        },

        createMatchRoom(request: CreateMatchRoomRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.createRoom(request, context.nowMs);
                return {
                    status: 201,
                    body: response
                };
            });
        },

        joinMatchRoom(request: JoinMatchRoomRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.joinRoom(request, context.nowMs);
                return {
                    status: 200,
                    body: response
                };
            });
        },

        finishMatchRoom(request: FinishMatchRoomRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.finishRoom(request, context.nowMs);
                return {
                    status: 200,
                    body: response
                };
            });
        },

        cleanupMatchRoom(request: CleanupMatchRoomRequest, context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const response = service.cleanupRoom(request, context.nowMs);
                return {
                    status: 200,
                    body: response
                };
            });
        },

        runQueueTick(context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                const assignments = service.runMatchmaking(context.nowMs);
                return {
                    status: 200,
                    body: {
                        assignments
                    }
                };
            });
        },

        getMatchmakingPolicy(_context: HandlerContext): HandlerResult {
            return executeHandler(() => {
                return {
                    status: 200,
                    body: service.getPolicy()
                };
            });
        }
    };
}

function executeHandler(fn: () => HandlerResult): HandlerResult {
    try {
        return fn();
    } catch (error) {
        if (error instanceof MatchmakingServiceError) {
            return {
                status: error.status,
                body: {
                    code: error.code,
                    message: error.message
                } satisfies ErrorBody
            };
        }

        const unknownError = error as Error;
        return {
            status: 500,
            body: {
                code: 'internal_error',
                message: unknownError.message || 'internal server error'
            } satisfies ErrorBody
        };
    }
}
