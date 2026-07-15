import { CONSTANTS } from './Constants';

/**
 * Tile types for the game grid
 */
export const TileType = {
    EMPTY: 0,
    GROUND: 1,
    RIVER: 2,
    BRIDGE: 3,
} as const;

export type Lane = 'left' | 'right';

interface Point {
    x: number;
    y: number;
}

interface RiverCrossingPoints {
    approach: Point;
    entry: Point;
    exit: Point;
    clear: Point;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * GameMap handles the grid data, pathfinding constraints,
 * and spawn zone validation.
 */
export default class GameMap {
    private grid: number[][];
    private cols: number;
    private rows: number;
    private tileSize: number;
    private readonly arenaBounds: Rect = { x: 18, y: 24, w: 324, h: CONSTANTS.ARENA.UI_START - 38 };
    private readonly riverRect: Rect = {
        x: 0,
        y: CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2,
        w: CONSTANTS.SCREEN_WIDTH,
        h: CONSTANTS.ARENA.RIVER_HEIGHT,
    };
    private readonly bridgeRects: Rect[] = [
        {
            x: CONSTANTS.ARENA.BRIDGE_LEFT_X - CONSTANTS.ARENA.BRIDGE_WIDTH / 2,
            y: CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2 - 34,
            w: CONSTANTS.ARENA.BRIDGE_WIDTH,
            h: CONSTANTS.ARENA.RIVER_HEIGHT + 68,
        },
        {
            x: CONSTANTS.ARENA.BRIDGE_RIGHT_X - CONSTANTS.ARENA.BRIDGE_WIDTH / 2,
            y: CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2 - 34,
            w: CONSTANTS.ARENA.BRIDGE_WIDTH,
            h: CONSTANTS.ARENA.RIVER_HEIGHT + 68,
        },
    ];

    constructor() {
        this.cols = CONSTANTS.GRID.COLS;
        this.rows = CONSTANTS.GRID.ROWS;
        this.tileSize = CONSTANTS.GRID.TILE_SIZE;
        this.grid = this.buildGrid();
    }

    private buildGrid(): number[][] {
        const grid: number[][] = [];
        const riverTop = CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const riverRowStart = Math.floor(riverTop / this.tileSize);
        const riverRowEnd = Math.ceil((CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2) / this.tileSize);

        const bridgeLeftCol = Math.floor(CONSTANTS.ARENA.BRIDGE_LEFT_X / this.tileSize);
        const bridgeRightCol = Math.floor(CONSTANTS.ARENA.BRIDGE_RIGHT_X / this.tileSize);
        const bridgeWidthCols = Math.ceil(CONSTANTS.ARENA.BRIDGE_WIDTH / this.tileSize);

        for (let row = 0; row < this.rows; row++) {
            grid[row] = [];
            for (let col = 0; col < this.cols; col++) {
                if (row >= riverRowStart && row < riverRowEnd) {
                    const isLeftBridge = col >= bridgeLeftCol - 1 && col < bridgeLeftCol + bridgeWidthCols - 1;
                    const isRightBridge = col >= bridgeRightCol - 1 && col < bridgeRightCol + bridgeWidthCols - 1;

                    if (isLeftBridge || isRightBridge) {
                        grid[row][col] = TileType.BRIDGE;
                    } else {
                        grid[row][col] = TileType.RIVER;
                    }
                } else {
                    grid[row][col] = TileType.GROUND;
                }
            }
        }
        return grid;
    }

    /**
     * Check if a world position is walkable (not river)
     */
    isWalkable(x: number, y: number): boolean {
        if (!this.contains(this.arenaBounds, x, y)) return false;
        if (this.contains(this.riverRect, x, y) && !this.isOnBridge(x, y)) return false;

        const col = Math.floor(x / this.tileSize);
        const row = Math.floor(y / this.tileSize);
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return false;
        return this.grid[row][col] !== TileType.RIVER;
    }

    /**
     * Check if position is in a valid spawn area for a team
     */
    isValidSpawnArea(x: number, y: number, team: 'blue' | 'red'): boolean {
        if (team === 'blue') {
            return y >= CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN && y <= CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX
                && x >= 10 && x <= CONSTANTS.SCREEN_WIDTH - 10;
        } else {
            return y >= CONSTANTS.ARENA.SPAWN_AREA_RED_MIN && y <= CONSTANTS.ARENA.SPAWN_AREA_RED_MAX
                && x >= 10 && x <= CONSTANTS.SCREEN_WIDTH - 10;
        }
    }

    /**
     * Get nearest bridge position for a unit trying to cross the river
     */
    getNearestBridgeX(x: number): number {
        const leftDist = Math.abs(x - CONSTANTS.ARENA.BRIDGE_LEFT_X);
        const rightDist = Math.abs(x - CONSTANTS.ARENA.BRIDGE_RIGHT_X);
        return leftDist < rightDist ? CONSTANTS.ARENA.BRIDGE_LEFT_X : CONSTANTS.ARENA.BRIDGE_RIGHT_X;
    }

    getLane(x: number): Lane {
        return x < CONSTANTS.SCREEN_WIDTH / 2 ? 'left' : 'right';
    }

    getBridgeXForLane(lane: Lane): number {
        return lane === 'left' ? CONSTANTS.ARENA.BRIDGE_LEFT_X : CONSTANTS.ARENA.BRIDGE_RIGHT_X;
    }

    getLaneForPoint(x: number): Lane {
        return this.getLane(x);
    }

    getArenaSide(y: number): -1 | 0 | 1 {
        if (y < this.riverRect.y) return -1;
        if (y > this.riverRect.y + this.riverRect.h) return 1;
        return 0;
    }

    estimatePathDistanceForLane(lane: Lane, x: number, y: number, targetX: number, targetY: number): number {
        const riverTop = this.riverRect.y;
        const riverBottom = this.riverRect.y + this.riverRect.h;
        const startSide = y < riverTop ? -1 : y > riverBottom ? 1 : 0;
        const targetSide = targetY < riverTop ? -1 : targetY > riverBottom ? 1 : 0;
        const directDistance = Math.hypot(targetX - x, targetY - y);

        if (startSide !== 0 && startSide === targetSide) return directDistance;
        if (startSide === 0 && targetSide === 0) return directDistance;

        const bridgeX = this.getBridgeXForLane(lane);
        const lowerApproach = { x: bridgeX, y: riverBottom + 34 };
        const lowerEntry = { x: bridgeX, y: riverBottom + 8 };
        const upperEntry = { x: bridgeX, y: riverTop - 8 };
        const upperApproach = { x: bridgeX, y: riverTop - 34 };
        const waypoints: Point[] = [];

        if (startSide > 0 && targetSide < 0) {
            waypoints.push(lowerApproach, lowerEntry, upperEntry);
            waypoints.push(upperApproach);
        } else if (startSide < 0 && targetSide > 0) {
            waypoints.push(upperApproach, upperEntry, lowerEntry);
            waypoints.push(lowerApproach);
        } else if (startSide === 0 && targetSide < 0) {
            waypoints.push(upperEntry, upperApproach);
        } else if (startSide === 0 && targetSide > 0) {
            waypoints.push(lowerEntry, lowerApproach);
        } else if (startSide > 0 && targetSide === 0) {
            waypoints.push(lowerApproach, lowerEntry);
        } else if (startSide < 0 && targetSide === 0) {
            waypoints.push(upperApproach, upperEntry);
        } else if (targetSide === 0) {
            waypoints.push({ x: bridgeX, y: targetY });
        }

        let distance = 0;
        let current = { x, y };
        for (const waypoint of waypoints) {
            distance += Math.hypot(waypoint.x - current.x, waypoint.y - current.y);
            current = waypoint;
        }
        distance += Math.hypot(targetX - current.x, targetY - current.y);
        return distance;
    }

    getCrossingPointsForLane(lane: Lane, team: 'blue' | 'red'): RiverCrossingPoints {
        const bridgeX = this.getBridgeXForLane(lane);
        const riverTop = this.riverRect.y;
        const riverBottom = this.riverRect.y + this.riverRect.h;
        if (team === 'blue') {
            return {
                approach: { x: bridgeX, y: riverBottom + 34 },
                entry: { x: bridgeX, y: riverBottom + 8 },
                exit: { x: bridgeX, y: riverTop - 12 },
                clear: { x: bridgeX, y: riverTop - 40 },
            };
        }

        return {
            approach: { x: bridgeX, y: riverTop - 34 },
            entry: { x: bridgeX, y: riverTop - 8 },
            exit: { x: bridgeX, y: riverBottom + 12 },
            clear: { x: bridgeX, y: riverBottom + 40 },
        };
    }

    /**
     * Return a deterministic waypoint that keeps units on lane roads and forces
     * river crossings through the bridge assigned to their lane.
     */
    getWaypointTowards(x: number, y: number, targetX: number, targetY: number, team: 'blue' | 'red'): Point {
        const lane = this.getLane(x);
        return this.getWaypointTowardsForLane(lane, x, y, targetX, targetY, team);
    }

    getWaypointTowardsForLane(lane: Lane, x: number, y: number, targetX: number, targetY: number, team: 'blue' | 'red'): Point {
        const riverTop = this.riverRect.y;
        const riverBottom = this.riverRect.y + this.riverRect.h;
        const crossingRiver = team === 'blue'
            ? y > riverBottom && targetY < riverTop
            : y < riverTop && targetY > riverBottom;

        if (!crossingRiver) {
            return this.projectToWalkable(targetX, targetY);
        }

        const points = this.getCrossingPointsForLane(lane, team);
        const bridgeX = points.entry.x;
        const alignedToBridge = Math.abs(x - bridgeX) <= 9;
        const beforeEntry = team === 'blue' ? y > points.entry.y : y < points.entry.y;
        const inCrossingBand = this.isOnBridge(x, y) || this.isInRiver(y) || Math.abs(y - CONSTANTS.ARENA.RIVER_Y) < 62;

        if (!alignedToBridge) {
            return beforeEntry && !inCrossingBand ? points.approach : points.entry;
        }

        if (beforeEntry && !this.isInRiver(y)) {
            return points.entry;
        }

        if (this.isInRiver(y) || this.isOnBridge(x, y)) {
            return points.exit;
        }

        return points.clear;
    }

    getStrictBridgeWaypointForLane(lane: Lane, x: number, y: number, targetY: number, team: 'blue' | 'red'): Point | null {
        const riverTop = this.riverRect.y;
        const riverBottom = this.riverRect.y + this.riverRect.h;
        const targetAcrossRiver = team === 'blue'
            ? targetY < riverTop
            : targetY > riverBottom;
        if (!targetAcrossRiver) return null;

        const points = this.getCrossingPointsForLane(lane, team);
        const bridgeX = points.entry.x;
        const alignedToBridge = Math.abs(x - bridgeX) <= 10;

        if (team === 'blue') {
            if (y > points.entry.y) return alignedToBridge ? points.entry : points.approach;
            if (y > points.clear.y) return points.clear;
            return null;
        }

        if (y < points.entry.y) return alignedToBridge ? points.entry : points.approach;
        if (y < points.clear.y) return points.clear;
        return null;
    }

    getAdvanceWaypoint(x: number, y: number, team: 'blue' | 'red'): Point {
        const lane = this.getLane(x);
        return this.getAdvanceWaypointForLane(lane, x, y, team);
    }

    getAdvanceWaypointForLane(lane: Lane, x: number, y: number, team: 'blue' | 'red'): Point {
        const direction = team === 'blue' ? -1 : 1;
        const riverTop = this.riverRect.y;
        const riverBottom = this.riverRect.y + this.riverRect.h;
        const points = this.getCrossingPointsForLane(lane, team);
        const bridgeX = points.entry.x;

        if ((team === 'blue' && y > riverBottom + 24) || (team === 'red' && y < riverTop - 24)) {
            if (Math.abs(x - bridgeX) > 9) return points.approach;
            return points.entry;
        }

        if (this.isOnBridge(x, y) || this.isInRiver(y) || Math.abs(y - CONSTANTS.ARENA.RIVER_Y) < 48) {
            return points.exit;
        }

        return this.projectToWalkable(bridgeX, y + direction * 80);
    }

    projectToWalkable(x: number, y: number): Point {
        const minX = this.arenaBounds.x;
        const maxX = this.arenaBounds.x + this.arenaBounds.w;
        const minY = this.arenaBounds.y;
        const maxY = this.arenaBounds.y + this.arenaBounds.h;
        let px = Math.max(minX, Math.min(maxX, x));
        let py = Math.max(minY, Math.min(maxY, y));

        if (this.contains(this.riverRect, px, py) && !this.isOnBridge(px, py)) {
            px = this.getNearestBridgeX(px);
        }

        return { x: px, y: py };
    }

    isOnBridge(x: number, y: number): boolean {
        return this.bridgeRects.some((rect) => this.contains(rect, x, y));
    }

    getBridgeCorridorLane(x: number, y: number, paddingX: number = 12, paddingY: number = 18): Lane | null {
        for (let index = 0; index < this.bridgeRects.length; index++) {
            const rect = this.bridgeRects[index];
            const expanded = {
                x: rect.x - paddingX,
                y: rect.y - paddingY,
                w: rect.w + paddingX * 2,
                h: rect.h + paddingY * 2,
            };
            if (this.contains(expanded, x, y)) return index === 0 ? 'left' : 'right';
        }
        return null;
    }

    isInBridgeCrossingZone(x: number, y: number): boolean {
        if (this.isOnBridge(x, y)) return true;
        return Math.abs(y - CONSTANTS.ARENA.RIVER_Y) < 78;
    }

    /**
     * Determine if Y position is in river zone
     */
    isInRiver(y: number): boolean {
        return y >= CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2
            && y <= CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2;
    }

    getDebugRects() {
        return {
            arenaBounds: this.arenaBounds,
            riverRect: this.riverRect,
            bridgeRects: this.bridgeRects,
        };
    }

    /**
     * Check if Y is approaching the river from a given direction
     */
    isApproachingRiver(y: number, team: 'blue' | 'red'): boolean {
        const margin = 30;
        if (team === 'blue') {
            return y <= CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2 + margin
                && y >= CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2 - margin;
        } else {
            return y >= CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2 - margin
                && y <= CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2 + margin;
        }
    }

    getGrid(): number[][] {
        return this.grid;
    }

    getTileSize(): number {
        return this.tileSize;
    }

    private contains(rect: Rect, x: number, y: number): boolean {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }
}
