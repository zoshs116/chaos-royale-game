export interface MmrUpdate {
    playerId: string;
    before: number;
    after: number;
    delta: number;
}

export interface TeamSnapshot {
    teamId: 'blue' | 'red';
    playerIds: string[];
    crowns: number;
}

export interface MmrApplyRequest {
    winnerTeamId: 'blue' | 'red' | 'draw';
    teams: TeamSnapshot[];
}
