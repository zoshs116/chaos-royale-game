import type { ServerStorage } from '../../../storage';
import type { MatchResultRequest } from '../../matches/src/types';

export interface ProgressionUpdate {
    playerId: string;
    winsDelta: number;
    lossesDelta: number;
    trophiesBefore: number;
    trophiesAfter: number;
    trophiesDelta: number;
    goldDelta: number;
    gemsDelta: number;
}

export default class ProgressionService {
    constructor(private readonly storage: ServerStorage) {}

    public async applyResult(request: MatchResultRequest, nowMs: number): Promise<ProgressionUpdate[]> {
        const updates: ProgressionUpdate[] = [];
        for (const team of request.teams) {
            const won = request.winnerTeamId === team.teamId;
            const lost = request.winnerTeamId !== 'draw' && !won;
            for (const playerId of team.playerIds) {
                const current = await this.storage.getPlayerProgression(playerId) ?? {
                    playerId,
                    wins: 0,
                    losses: 0,
                    trophies: 0,
                    gold: 0,
                    gems: 0,
                    updatedAtUtc: new Date(nowMs).toISOString(),
                };
                const trophiesDelta = won ? 30 : lost ? -30 : 0;
                const trophiesAfter = Math.max(0, current.trophies + trophiesDelta);
                const goldDelta = won ? 150 : 50;
                const gemsDelta = 0;
                await this.storage.upsertPlayerProgression({
                    ...current,
                    wins: current.wins + (won ? 1 : 0),
                    losses: current.losses + (lost ? 1 : 0),
                    trophies: trophiesAfter,
                    gold: current.gold + goldDelta,
                    gems: current.gems + gemsDelta,
                    updatedAtUtc: new Date(nowMs).toISOString(),
                });
                updates.push({
                    playerId,
                    winsDelta: won ? 1 : 0,
                    lossesDelta: lost ? 1 : 0,
                    trophiesBefore: current.trophies,
                    trophiesAfter,
                    trophiesDelta: trophiesAfter - current.trophies,
                    goldDelta,
                    gemsDelta,
                });
            }
        }
        return updates;
    }
}
