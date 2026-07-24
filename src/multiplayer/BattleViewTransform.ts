import { CONSTANTS } from '../systems/Constants';

export type CanonicalBattleTeam = 'blue' | 'red';

export interface BattlePoint {
    x: number;
    y: number;
}

export interface BattleVector {
    x: number;
    y: number;
}

const MIRROR_Y = CONSTANTS.TOWERS.BLUE_KING.y + CONSTANTS.TOWERS.RED_KING.y;

export default class BattleViewTransform {
    public readonly localTeam: CanonicalBattleTeam;
    private readonly mirrored: boolean;

    constructor(localTeam: CanonicalBattleTeam) {
        this.localTeam = localTeam;
        this.mirrored = localTeam === 'red';
    }

    public worldToViewPoint(point: BattlePoint): BattlePoint {
        if (!this.mirrored) return { ...point };
        return {
            x: CONSTANTS.SCREEN_WIDTH - point.x,
            y: MIRROR_Y - point.y,
        };
    }

    public viewToWorldPoint(point: BattlePoint): BattlePoint {
        return this.worldToViewPoint(point);
    }

    public worldToViewVector(vector: BattleVector): BattleVector {
        if (!this.mirrored) return { ...vector };
        return { x: -vector.x, y: -vector.y };
    }

    public worldToVisualTeam(team: CanonicalBattleTeam): CanonicalBattleTeam {
        return team === this.localTeam ? 'blue' : 'red';
    }

    public isMirrored(): boolean {
        return this.mirrored;
    }
}
