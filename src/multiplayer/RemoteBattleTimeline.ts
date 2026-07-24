import type { RemoteBattleSnapshot } from './BattleSocketClient';

export interface RemoteBattleRenderSample {
    from: RemoteBattleSnapshot;
    to: RemoteBattleSnapshot;
    alpha: number;
    targetServerTimeMs: number;
}

export interface RemoteTimelineDiagnostics {
    bufferedSnapshots: number;
    droppedSnapshots: number;
    latestTick: number;
    latestSequence: number;
    renderDelayMs: number;
}

interface RemoteBattleTimelineOptions {
    renderDelayMs?: number;
    maxSnapshots?: number;
}

interface SnapshotIndexes {
    units: Map<string, RemoteBattleSnapshot['units'][number]>;
    projectiles: Map<string, RemoteBattleSnapshot['projectiles'][number]>;
    zones: Map<string, RemoteBattleSnapshot['skillZones'][number]>;
    towers: Map<string, RemoteBattleSnapshot['towers'][number]>;
}

export default class RemoteBattleTimeline {
    private readonly renderDelayMs: number;
    private readonly maxSnapshots: number;
    private readonly snapshots: RemoteBattleSnapshot[] = [];
    private latestSequence = -1;
    private latestTick = -1;
    private droppedSnapshots = 0;
    private readonly indexCache = new WeakMap<RemoteBattleSnapshot, SnapshotIndexes>();

    constructor(options: RemoteBattleTimelineOptions = {}) {
        this.renderDelayMs = options.renderDelayMs ?? 120;
        this.maxSnapshots = options.maxSnapshots ?? 90;
    }

    public reset(): void {
        this.snapshots.length = 0;
        this.latestSequence = -1;
        this.latestTick = -1;
        this.droppedSnapshots = 0;
    }

    public ingest(snapshot: RemoteBattleSnapshot): boolean {
        if (snapshot.sequence <= this.latestSequence || snapshot.tick < this.latestTick) {
            this.droppedSnapshots += 1;
            return false;
        }
        this.latestSequence = snapshot.sequence;
        this.latestTick = snapshot.tick;
        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSnapshots) this.snapshots.splice(0, this.snapshots.length - this.maxSnapshots);
        return true;
    }

    public sample(estimatedServerTimeMs: number): RemoteBattleRenderSample | null {
        if (this.snapshots.length === 0) return null;
        const targetServerTimeMs = estimatedServerTimeMs - this.renderDelayMs;
        const first = this.snapshots[0] as RemoteBattleSnapshot;
        if (targetServerTimeMs <= first.serverTimeMs) {
            return { from: first, to: first, alpha: 0, targetServerTimeMs };
        }

        for (let index = 1; index < this.snapshots.length; index += 1) {
            const to = this.snapshots[index] as RemoteBattleSnapshot;
            if (to.serverTimeMs < targetServerTimeMs) continue;
            const from = this.snapshots[index - 1] as RemoteBattleSnapshot;
            const durationMs = Math.max(1, to.serverTimeMs - from.serverTimeMs);
            const alpha = clamp01((targetServerTimeMs - from.serverTimeMs) / durationMs);
            this.pruneBefore(index - 1);
            return { from, to, alpha, targetServerTimeMs };
        }

        const latest = this.snapshots[this.snapshots.length - 1] as RemoteBattleSnapshot;
        this.pruneBefore(Math.max(0, this.snapshots.length - 2));
        return { from: latest, to: latest, alpha: 1, targetServerTimeMs };
    }

    public getDiagnostics(): RemoteTimelineDiagnostics {
        return {
            bufferedSnapshots: this.snapshots.length,
            droppedSnapshots: this.droppedSnapshots,
            latestTick: this.latestTick,
            latestSequence: this.latestSequence,
            renderDelayMs: this.renderDelayMs,
        };
    }

    public materialize(sample: RemoteBattleRenderSample): RemoteBattleSnapshot {
        const { from, to, alpha } = sample;
        if (from === to || alpha >= 1) return to;
        if (alpha <= 0) return from;

        const indexes = this.getIndexes(to);

        return {
            ...from,
            remainingMs: lerp(from.remainingMs, to.remainingMs, alpha),
            blueElixir: lerp(from.blueElixir, to.blueElixir, alpha),
            redElixir: lerp(from.redElixir, to.redElixir, alpha),
            units: from.units.map(unit => {
                const target = indexes.units.get(unit.id);
                if (!target) return unit;
                return {
                    ...unit,
                    x: lerp(unit.x, target.x, alpha),
                    y: lerp(unit.y, target.y, alpha),
                    elevation: lerp(unit.elevation, target.elevation, alpha),
                    directionX: lerp(unit.directionX, target.directionX, alpha),
                    directionY: lerp(unit.directionY, target.directionY, alpha),
                };
            }),
            projectiles: from.projectiles.map(projectile => {
                const target = indexes.projectiles.get(projectile.id);
                if (!target) return projectile;
                return {
                    ...projectile,
                    x: lerp(projectile.x, target.x, alpha),
                    y: lerp(projectile.y, target.y, alpha),
                    directionX: lerp(projectile.directionX, target.directionX, alpha),
                    directionY: lerp(projectile.directionY, target.directionY, alpha),
                };
            }),
            skillZones: from.skillZones.map(zone => {
                const target = indexes.zones.get(zone.id);
                if (!target) return zone;
                return {
                    ...zone,
                    x: lerp(zone.x, target.x, alpha),
                    y: lerp(zone.y, target.y, alpha),
                    radius: lerp(zone.radius, target.radius, alpha),
                    remainingMs: lerp(zone.remainingMs, target.remainingMs, alpha),
                };
            }),
            towers: from.towers.map(tower => {
                const target = indexes.towers.get(tower.id);
                if (!target) return tower;
                return {
                    ...tower,
                    x: lerp(tower.x, target.x, alpha),
                    y: lerp(tower.y, target.y, alpha),
                };
            }),
        };
    }

    private pruneBefore(index: number): void {
        if (index <= 1) return;
        this.snapshots.splice(0, index - 1);
    }

    private getIndexes(snapshot: RemoteBattleSnapshot): SnapshotIndexes {
        const cached = this.indexCache.get(snapshot);
        if (cached) return cached;
        const indexes: SnapshotIndexes = {
            units: new Map(snapshot.units.map(unit => [unit.id, unit])),
            projectiles: new Map(snapshot.projectiles.map(projectile => [projectile.id, projectile])),
            zones: new Map(snapshot.skillZones.map(zone => [zone.id, zone])),
            towers: new Map(snapshot.towers.map(tower => [tower.id, tower])),
        };
        this.indexCache.set(snapshot, indexes);
        return indexes;
    }
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, alpha: number): number {
    return from + (to - from) * alpha;
}
