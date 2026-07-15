import ReplayService from './ReplayService';
import ReplayServiceError from './errors';
import type { GetReplayRequest } from './types';

export interface HandlerContext {
    nowMs: number;
}

export interface HandlerResult<TBody = unknown> {
    status: number;
    body: TBody;
}

export interface ReplayHandlers {
    getReplay: (request: GetReplayRequest, context: HandlerContext) => Promise<HandlerResult>;
}

export function createReplayHandlers(service: ReplayService): ReplayHandlers {
    return {
        async getReplay(request: GetReplayRequest, context: HandlerContext): Promise<HandlerResult> {
            return executeHandler(async () => {
                const replay = await service.getReplay(request, context.nowMs);
                return {
                    status: 200,
                    body: replay
                };
            });
        }
    };
}

async function executeHandler(fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof ReplayServiceError) {
            return {
                status: error.status,
                body: {
                    code: error.code,
                    message: error.message
                }
            };
        }

        const unknownError = error as Error;
        return {
            status: 500,
            body: {
                code: 'internal_error',
                message: unknownError.message || 'internal server error'
            }
        };
    }
}
