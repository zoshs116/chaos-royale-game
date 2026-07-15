export default class MatchResultServiceError extends Error {
    public readonly code: string;
    public readonly status: number;

    constructor(code: string, status: number, message: string) {
        super(message);
        this.name = 'MatchResultServiceError';
        this.code = code;
        this.status = status;
    }
}
