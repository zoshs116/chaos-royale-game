import type { MmrApplyRequest, MmrUpdate, TeamSnapshot } from './types';
import type { ServerStorage } from '../../../storage';

export interface MmrServiceOptions {
    storage: ServerStorage;
    defaultRating?: number;
}

export default class MmrService {
    private readonly storage: ServerStorage;
    private readonly defaultRating: number;

    constructor(options: MmrServiceOptions) {
        this.storage = options.storage;
        this.defaultRating = options.defaultRating ?? 1000;
    }

    public async applyResult(request: MmrApplyRequest, nowMs: number): Promise<MmrUpdate[]> {
        const updates: MmrUpdate[] = [];
        const teamsById = new Map<string, TeamSnapshot>();
        for (const team of request.teams) {
            teamsById.set(team.teamId, team);
        }

        const blueTeam = teamsById.get('blue');
        const redTeam = teamsById.get('red');
        if (!blueTeam || !redTeam) {
            throw new Error('mmr apply requires both blue/red teams.');
        }

        const crownGap = Math.abs(blueTeam.crowns - redTeam.crowns);
        const winnerBonus = Math.min(10, crownGap * 2);

        for (const team of request.teams) {
            for (const playerId of team.playerIds) {
                const before = await this.getRating(playerId);
                const delta = this.calculateDelta(request.winnerTeamId, team.teamId, winnerBonus);
                const after = this.clampRating(before + delta);
                await this.storage.upsertPlayerRating({
                    playerId,
                    rating: after,
                    updatedAtUtc: new Date(nowMs).toISOString()
                });
                updates.push({
                    playerId,
                    before,
                    after,
                    delta
                });
            }
        }

        return updates;
    }

    public async getRating(playerId: string): Promise<number> {
        const record = await this.storage.getPlayerRating(playerId);
        return record?.rating ?? this.defaultRating;
    }

    private calculateDelta(
        winnerTeamId: MmrApplyRequest['winnerTeamId'],
        teamId: TeamSnapshot['teamId'],
        winnerBonus: number
    ): number {
        if (winnerTeamId === 'draw') return 0;
        if (winnerTeamId === teamId) return 30 + winnerBonus;
        return -(30 + winnerBonus);
    }

    private clampRating(value: number): number {
        return Math.max(0, Math.min(5000, value));
    }
}
