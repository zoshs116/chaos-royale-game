import MatchResultService from './MatchResultService';
import MatchResultServiceError from './errors';
import type { GetMatchSummaryRequest, MatchResultRequest } from './types';

export interface HandlerContext {
    nowMs: number;
}

export interface HandlerResult<TBody = unknown> {
    status: number;
    body: TBody;
}

export interface MatchResultHandlers {
    submitMatchResult: (request: MatchResultRequest, context: HandlerContext) => Promise<HandlerResult>;
    getMatchSummary: (request: GetMatchSummaryRequest, context: HandlerContext) => Promise<HandlerResult>;
}

export function createMatchResultHandlers(service: MatchResultService): MatchResultHandlers {
    return {
        async submitMatchResult(request: MatchResultRequest, context: HandlerContext): Promise<HandlerResult> {
            return executeHandler(async () => {
                const result = await service.submitResult(request, context.nowMs);
                return {
                    status: 202,
                    body: result
                };
            });
        },
        async getMatchSummary(request: GetMatchSummaryRequest, _context: HandlerContext): Promise<HandlerResult> {
            return executeHandler(async () => {
                const summary = await service.getSummary(request.matchId);
                if (!summary) {
                    return {
                        status: 404,
                        body: {
                            code: 'match_summary_not_found',
                            message: 'match summary not found.'
                        }
                    };
                }

                return {
                    status: 200,
                    body: summary
                };
            });
        }
    };
}

async function executeHandler(fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof MatchResultServiceError) {
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
