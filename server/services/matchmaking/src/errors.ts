export default class MatchmakingServiceError extends Error {
    public readonly code: string;
    public readonly status: number;

    constructor(code: string, status: number, message: string) {
        super(message);
        this.name = 'MatchmakingServiceError';
        this.code = code;
        this.status = status;
    }
}
