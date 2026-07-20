import { getAuthoritativeCombatProfile, type AuthoritativeCombatProfile } from './CombatProfile';
import {
    getActiveSkillDefinition,
    type ActiveSkillImpactWave,
    type ActiveSkillKey,
    type ActiveSkillPhase,
} from '../../../src/data/ActiveSkillData';

export type BattleTeam = 'blue' | 'red';
export type BattleState = 'waiting' | 'running' | 'finished';
export type BattleUnitState = 'spawning' | 'idle' | 'moving' | 'attacking' | 'jumping' | 'stunned' | 'casting';

export interface BattlePlayerConfig {
    playerId: string;
    team: BattleTeam;
    deck: string[];
}

export interface BattleSpawnCommand {
    type: 'spawn';
    playerId: string;
    seq: number;
    unitKey: string;
    x: number;
    y: number;
    handIndex: number;
}

export interface BattleForfeitCommand {
    type: 'forfeit';
    playerId: string;
    seq: number;
}

export interface BattleCastActiveSkillCommand {
    type: 'cast_active_skill';
    playerId: string;
    seq: number;
    unitId: string;
    skillKey: ActiveSkillKey;
}

export type BattleCommand = BattleSpawnCommand | BattleForfeitCommand | BattleCastActiveSkillCommand;

export interface BattleUnitSnapshot {
    id: string;
    ownerId: string;
    team: BattleTeam;
    unitKey: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    state: BattleUnitState;
    targetId: string | null;
    attackSerial: number;
    hitSerial: number;
    jumpSerial: number;
    directionX: number;
    directionY: number;
    elevation: number;
    activeSkillKey: ActiveSkillKey | null;
    activeSkillPhase: ActiveSkillPhase | null;
    activeSkillCooldownRemainingMs: number;
    activeSkillCastSerial: number;
}

export interface BattleProjectileSnapshot {
    id: string;
    team: BattleTeam;
    projectileKey: string;
    x: number;
    y: number;
    directionX: number;
    directionY: number;
    targetId: string;
}

export interface BattleTowerSnapshot {
    id: string;
    team: BattleTeam;
    type: 'king' | 'princess';
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    active: boolean;
}

export interface BattleSnapshot {
    roomId: string;
    tick: number;
    state: BattleState;
    remainingMs: number;
    blueElixir: number;
    redElixir: number;
    blueKingHp: number;
    redKingHp: number;
    blueCrowns: number;
    redCrowns: number;
    ackByPlayer: Record<string, number>;
    players: Array<{
        playerId: string;
        team: BattleTeam;
        connected: boolean;
        hand: string[];
        nextUnitKey: string;
    }>;
    inputCount: number;
    startedAtUtc: string | null;
    endedAtUtc: string | null;
    units: BattleUnitSnapshot[];
    projectiles: BattleProjectileSnapshot[];
    towers: BattleTowerSnapshot[];
    winner: BattleTeam | 'draw' | null;
}

type PlayerState = BattlePlayerConfig & {
    hand: string[];
    drawIndex: number;
    elixir: number;
    lastSeq: number;
    connected: boolean;
    disconnectedAtMs: number | null;
};

type BattleTarget = BattleUnit | BattleTower;

type PendingAttack = {
    targetId: string;
    resolvesAtMs: number;
    kind: 'melee' | 'projectile';
};

type BattleUnit = BattleUnitSnapshot & {
    profile: AuthoritativeCombatProfile;
    lane: 'left' | 'right';
    spawnReadyAtMs: number;
    acquisitionReadyAtMs: number;
    firstHitReadyAtMs: number;
    nextAttackAtMs: number;
    pendingAttack: PendingAttack | null;
    towerTargetCommitted: boolean;
    stunnedUntilMs: number;
    jumpCooldownUntilMs: number;
    jumpStartedAtMs: number;
    jumpEndsAtMs: number;
    jumpStartX: number;
    jumpStartY: number;
    jumpTargetX: number;
    jumpTargetY: number;
    activeSkillReadyAtMs: number;
    activeSkillStartedAtMs: number;
    activeSkillImpactAtMs: number;
    activeSkillEndsAtMs: number;
    activeSkillStartX: number;
    activeSkillStartY: number;
    activeSkillLandingX: number;
    activeSkillLandingY: number;
    activeSkillNextWaveIndex: number;
};

type BattleTower = BattleTowerSnapshot & {
    damage: number;
    range: number;
    collisionRadius: number;
    attackCooldownMs: number;
    nextAttackAtMs: number;
};

type BattleProjectile = BattleProjectileSnapshot & {
    attackerId: string;
    damage: number;
    splashRadius: number;
    speed: number;
    ageMs: number;
    maxLifetimeMs: number;
};

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const BATTLE_DURATION_MS = 180_000;
const DISCONNECT_GRACE_MS = 15_000;
const MAX_ELIXIR = 10;
const START_ELIXIR = 5;
const ELIXIR_REGEN_MS = 2_800;
const DOUBLE_ELIXIR_REGEN_MS = 1_400;
const DOUBLE_ELIXIR_AT_MS = 120_000;
const MIN_X = 20;
const MAX_X = 340;
const MIN_Y = 20;
const MAX_Y = 630;
const BLUE_MIN_Y = 360;
const BLUE_MAX_Y = 630;
const RED_MIN_Y = 20;
const RED_MAX_Y = 300;
const RIVER_Y = 320;
const RIVER_HALF_HEIGHT = 32;
const RIVER_TOP = RIVER_Y - RIVER_HALF_HEIGHT;
const RIVER_BOTTOM = RIVER_Y + RIVER_HALF_HEIGHT;
const BRIDGE_X = [86, 266] as const;
const BRIDGE_HALF_WIDTH = 34;
const BRIDGE_APPROACH = 48;

const TOWER_DEFINITIONS: Array<Omit<BattleTower, 'hp' | 'active' | 'nextAttackAtMs'>> = [
    { id: 'blue:king', team: 'blue', type: 'king', x: 180, y: 560, maxHp: 4000, damage: 110, range: 130, collisionRadius: 28, attackCooldownMs: 1000 },
    { id: 'blue:princess:left', team: 'blue', type: 'princess', x: 86, y: 496, maxHp: 2500, damage: 80, range: 180, collisionRadius: 22, attackCooldownMs: 800 },
    { id: 'blue:princess:right', team: 'blue', type: 'princess', x: 270, y: 496, maxHp: 2500, damage: 80, range: 180, collisionRadius: 22, attackCooldownMs: 800 },
    { id: 'red:king', team: 'red', type: 'king', x: 180, y: 118, maxHp: 4000, damage: 110, range: 130, collisionRadius: 28, attackCooldownMs: 1000 },
    { id: 'red:princess:left', team: 'red', type: 'princess', x: 86, y: 152, maxHp: 2500, damage: 80, range: 180, collisionRadius: 22, attackCooldownMs: 800 },
    { id: 'red:princess:right', team: 'red', type: 'princess', x: 270, y: 152, maxHp: 2500, damage: 80, range: 180, collisionRadius: 22, attackCooldownMs: 800 },
];

export default class AuthoritativeBattleRoom {
    private readonly players = new Map<string, PlayerState>();
    private readonly units: BattleUnit[] = [];
    private readonly projectiles: BattleProjectile[] = [];
    private readonly towers: BattleTower[] = TOWER_DEFINITIONS.map((tower) => ({
        ...tower,
        hp: tower.maxHp,
        active: true,
        nextAttackAtMs: 0,
    }));
    private tick = 0;
    private elapsedMs = 0;
    private state: BattleState = 'waiting';
    private winner: BattleSnapshot['winner'] = null;
    private blueCrowns = 0;
    private redCrowns = 0;
    private unitCounter = 0;
    private projectileCounter = 0;
    private inputCount = 0;
    private startedAtMs: number | null = null;
    private endedAtMs: number | null = null;

    constructor(public readonly roomId: string) {}

    public join(config: BattlePlayerConfig): BattleSnapshot {
        const deck = normalizeDeck(config.deck);
        const existing = this.players.get(config.playerId);
        if (existing) {
            if (existing.team !== config.team) throw new Error('player team does not match the existing seat');
            existing.connected = true;
            existing.disconnectedAtMs = null;
            return this.snapshot();
        }
        if (this.state === 'finished') throw new Error('match is already finished');
        if ([...this.players.values()].some((player) => player.team === config.team)) {
            throw new Error(`team ${config.team} is already occupied`);
        }
        this.players.set(config.playerId, {
            ...config,
            deck,
            hand: deck.slice(0, Math.min(4, deck.length)),
            drawIndex: Math.min(4, deck.length) % deck.length,
            elixir: START_ELIXIR,
            lastSeq: 0,
            connected: true,
            disconnectedAtMs: null,
        });
        if (this.players.size === 2) {
            this.state = 'running';
            this.startedAtMs ??= Date.now();
        }
        return this.snapshot();
    }

    public disconnect(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player || !player.connected) return;
        player.connected = false;
        player.disconnectedAtMs = this.elapsedMs;
    }

    public enqueue(command: BattleCommand): { accepted: boolean; reason?: string } {
        const player = this.players.get(command.playerId);
        if (!player) return { accepted: false, reason: 'player_not_in_room' };
        if (this.state !== 'running') return { accepted: false, reason: 'match_not_running' };
        if (!Number.isSafeInteger(command.seq) || command.seq <= player.lastSeq) {
            return { accepted: false, reason: 'duplicate_or_stale_sequence' };
        }
        player.lastSeq = command.seq;
        this.inputCount += 1;
        if (command.type === 'forfeit') {
            this.finish(oppositeTeam(player.team));
            return { accepted: true };
        }
        if (command.type === 'cast_active_skill') {
            return this.applyCastActiveSkill(player, command);
        }
        return this.applySpawn(player, command);
    }

    public step(): BattleSnapshot {
        if (this.state !== 'running') return this.snapshot();
        this.tick += 1;
        this.elapsedMs += TICK_MS;
        this.forfeitDisconnectedPlayers();
        if (this.state !== 'running') return this.snapshot();
        this.regenerateElixir();
        this.resolvePendingAttacks();
        this.updateProjectiles();
        this.updateUnits();
        this.resolveEntityCollisions();
        this.updateTowers();
        this.removeDeadUnits();
        this.checkFinished();
        return this.snapshot();
    }

    public snapshot(): BattleSnapshot {
        const ackByPlayer: Record<string, number> = {};
        let blueElixir = 0;
        let redElixir = 0;
        for (const player of this.players.values()) {
            ackByPlayer[player.playerId] = player.lastSeq;
            if (player.team === 'blue') blueElixir = player.elixir;
            else redElixir = player.elixir;
        }
        const blueKing = this.getKing('blue');
        const redKing = this.getKing('red');
        return {
            roomId: this.roomId,
            tick: this.tick,
            state: this.state,
            remainingMs: Math.max(0, BATTLE_DURATION_MS - this.elapsedMs),
            blueElixir,
            redElixir,
            blueKingHp: blueKing.hp,
            redKingHp: redKing.hp,
            blueCrowns: this.blueCrowns,
            redCrowns: this.redCrowns,
            ackByPlayer,
            players: [...this.players.values()].map((player) => ({
                playerId: player.playerId,
                team: player.team,
                connected: player.connected,
                hand: [...player.hand],
                nextUnitKey: player.deck[player.drawIndex] ?? player.deck[0],
            })),
            inputCount: this.inputCount,
            startedAtUtc: this.startedAtMs === null ? null : new Date(this.startedAtMs).toISOString(),
            endedAtUtc: this.endedAtMs === null ? null : new Date(this.endedAtMs).toISOString(),
            units: this.units.map(({
                profile: _profile,
                lane: _lane,
                spawnReadyAtMs: _spawn,
                acquisitionReadyAtMs: _acquire,
                firstHitReadyAtMs: _first,
                nextAttackAtMs: _next,
                pendingAttack: _pending,
                towerTargetCommitted: _committed,
                stunnedUntilMs: _stunned,
                jumpCooldownUntilMs: _jumpCooldown,
                jumpStartedAtMs: _jumpStarted,
                jumpEndsAtMs: _jumpEnds,
                jumpStartX: _jumpStartX,
                jumpStartY: _jumpStartY,
                jumpTargetX: _jumpTargetX,
                jumpTargetY: _jumpTargetY,
                activeSkillReadyAtMs: _skillReady,
                activeSkillStartedAtMs: _skillStarted,
                activeSkillImpactAtMs: _skillImpact,
                activeSkillEndsAtMs: _skillEnds,
                activeSkillStartX: _skillStartX,
                activeSkillStartY: _skillStartY,
                activeSkillLandingX: _skillLandingX,
                activeSkillLandingY: _skillLandingY,
                activeSkillNextWaveIndex: _skillWaveIndex,
                ...unit
            }) => ({ ...unit })),
            projectiles: this.projectiles.map(({ attackerId: _attacker, damage: _damage, splashRadius: _splash, speed: _speed, ageMs: _age, maxLifetimeMs: _lifetime, ...projectile }) => ({ ...projectile })),
            towers: this.towers.map(({ damage: _damage, range: _range, collisionRadius: _radius, attackCooldownMs: _cooldown, nextAttackAtMs: _next, ...tower }) => ({ ...tower })),
            winner: this.winner,
        };
    }

    private applySpawn(player: PlayerState, command: BattleSpawnCommand): { accepted: boolean; reason?: string } {
        if (!Number.isInteger(command.handIndex) || command.handIndex < 0 || command.handIndex >= player.hand.length) {
            return { accepted: false, reason: 'invalid_hand_index' };
        }
        const handUnit = player.hand[command.handIndex];
        const profile = getAuthoritativeCombatProfile(command.unitKey);
        if (!profile || handUnit !== command.unitKey) return { accepted: false, reason: 'card_not_in_hand' };
        const cost = profile.cost;
        if (player.elixir + 0.0001 < cost) return { accepted: false, reason: 'not_enough_elixir' };
        if (!this.isValidSpawnPosition(player.team, command.x, command.y)) {
            return { accepted: false, reason: 'invalid_spawn_position' };
        }

        player.elixir -= cost;
        const replacement = player.deck[player.drawIndex];
        if (replacement) {
            player.hand[command.handIndex] = replacement;
            player.drawIndex = (player.drawIndex + 1) % player.deck.length;
        }
        for (const offset of profile.spawnOffsets) {
            this.unitCounter += 1;
            const forward = player.team === 'blue' ? 1 : -1;
            const x = clamp(command.x + offset.x, MIN_X, MAX_X);
            const y = clamp(command.y + offset.y * forward, MIN_Y, MAX_Y);
            this.units.push({
                id: `${this.roomId}:u:${this.unitCounter}`,
                ownerId: player.playerId,
                team: player.team,
                unitKey: command.unitKey,
                x,
                y,
                hp: profile.hp,
                maxHp: profile.hp,
                state: 'spawning',
                targetId: null,
                attackSerial: 0,
                hitSerial: 0,
                jumpSerial: 0,
                directionX: 0,
                directionY: player.team === 'blue' ? -1 : 1,
                elevation: 0,
                activeSkillKey: profile.activeSkill,
                activeSkillPhase: profile.activeSkill ? 'ready' : null,
                activeSkillCooldownRemainingMs: 0,
                activeSkillCastSerial: 0,
                profile,
                lane: laneFromX(x),
                spawnReadyAtMs: this.elapsedMs + profile.deployDelayMs,
                acquisitionReadyAtMs: this.elapsedMs + profile.deployDelayMs + profile.acquisitionDelayMs,
                firstHitReadyAtMs: 0,
                nextAttackAtMs: 0,
                pendingAttack: null,
                towerTargetCommitted: false,
                stunnedUntilMs: 0,
                jumpCooldownUntilMs: 0,
                jumpStartedAtMs: 0,
                jumpEndsAtMs: 0,
                jumpStartX: x,
                jumpStartY: y,
                jumpTargetX: x,
                jumpTargetY: y,
                activeSkillReadyAtMs: 0,
                activeSkillStartedAtMs: 0,
                activeSkillImpactAtMs: 0,
                activeSkillEndsAtMs: 0,
                activeSkillStartX: x,
                activeSkillStartY: y,
                activeSkillLandingX: x,
                activeSkillLandingY: y,
                activeSkillNextWaveIndex: 0,
            });
        }
        return { accepted: true };
    }

    private applyCastActiveSkill(
        player: PlayerState,
        command: BattleCastActiveSkillCommand,
    ): { accepted: boolean; reason?: string } {
        const unit = this.units.find(candidate => candidate.id === command.unitId);
        if (!unit || unit.ownerId !== player.playerId || unit.team !== player.team) {
            return { accepted: false, reason: 'unit_not_owned' };
        }
        if (unit.hp <= 0) return { accepted: false, reason: 'unit_not_alive' };
        if (!unit.activeSkillKey || unit.activeSkillKey !== command.skillKey || unit.profile.activeSkill !== command.skillKey) {
            return { accepted: false, reason: 'skill_not_available' };
        }
        if (unit.state === 'spawning' || unit.state === 'jumping' || unit.state === 'stunned' || unit.state === 'casting') {
            return { accepted: false, reason: 'unit_cannot_cast_now' };
        }
        if (this.elapsedMs < unit.activeSkillReadyAtMs) return { accepted: false, reason: 'skill_on_cooldown' };

        const definition = getActiveSkillDefinition(command.skillKey);
        if (!definition) return { accepted: false, reason: 'unknown_skill' };
        const lockedTarget = this.findTargetById(unit.targetId);
        if (lockedTarget && isAlive(lockedTarget)) this.faceTarget(unit, lockedTarget.x, lockedTarget.y);
        else {
            unit.directionX = unit.directionX === 0 ? (unit.x < 180 ? 1 : -1) : unit.directionX;
            unit.directionY = unit.team === 'blue' ? -1 : 1;
        }
        const direction = skillDirection(unit.directionX, unit.directionY);
        const timing = definition.timingByDirection[direction];
        const landing = this.getActiveSkillLandingPoint(unit, definition.forwardDistance);
        unit.state = 'casting';
        unit.pendingAttack = null;
        unit.firstHitReadyAtMs = 0;
        unit.activeSkillPhase = 'casting';
        unit.activeSkillCooldownRemainingMs = definition.cooldownMs;
        unit.activeSkillReadyAtMs = this.elapsedMs + definition.cooldownMs;
        unit.activeSkillStartedAtMs = this.elapsedMs;
        unit.activeSkillImpactAtMs = this.elapsedMs + timing.impactMs;
        unit.activeSkillEndsAtMs = this.elapsedMs + timing.totalMs;
        unit.activeSkillStartX = unit.x;
        unit.activeSkillStartY = unit.y;
        unit.activeSkillLandingX = landing.x;
        unit.activeSkillLandingY = landing.y;
        unit.activeSkillNextWaveIndex = 0;
        unit.activeSkillCastSerial += 1;
        return { accepted: true };
    }

    private regenerateElixir(): void {
        const regenMs = this.elapsedMs >= DOUBLE_ELIXIR_AT_MS ? DOUBLE_ELIXIR_REGEN_MS : ELIXIR_REGEN_MS;
        const amount = TICK_MS / regenMs;
        for (const player of this.players.values()) player.elixir = Math.min(MAX_ELIXIR, player.elixir + amount);
    }

    private updateUnits(): void {
        for (const unit of [...this.units].sort((a, b) => a.id.localeCompare(b.id))) {
            if (unit.hp <= 0) continue;
            if (unit.activeSkillKey) {
                unit.activeSkillCooldownRemainingMs = Math.max(0, unit.activeSkillReadyAtMs - this.elapsedMs);
                if (unit.activeSkillPhase === 'cooldown' && unit.activeSkillCooldownRemainingMs <= 0) {
                    unit.activeSkillPhase = 'ready';
                }
            }
            if (unit.state === 'jumping') {
                this.updateJump(unit);
                continue;
            }
            if (this.elapsedMs < unit.spawnReadyAtMs) {
                unit.state = 'spawning';
                continue;
            }
            if (this.elapsedMs < unit.stunnedUntilMs) {
                if (unit.activeSkillPhase === 'casting') {
                    unit.activeSkillPhase = unit.activeSkillCooldownRemainingMs > 0 ? 'cooldown' : 'ready';
                    unit.activeSkillNextWaveIndex = definitionWaveCount(unit.activeSkillKey);
                    unit.x = unit.activeSkillLandingX;
                    unit.y = unit.activeSkillLandingY;
                    unit.elevation = 0;
                    this.projectUnitToWalkable(unit);
                }
                unit.state = 'stunned';
                unit.pendingAttack = null;
                continue;
            }
            if (unit.activeSkillPhase === 'casting') {
                this.updateActiveSkillCast(unit);
                continue;
            }
            if (unit.pendingAttack) {
                unit.state = 'attacking';
                continue;
            }

            const target = this.resolveUnitTarget(unit);
            this.assignTarget(unit, target);
            if (!target) {
                unit.state = 'idle';
                continue;
            }
            this.faceTarget(unit, target.x, target.y);
            if (this.isInAttackRange(unit, target, true)) {
                unit.state = 'attacking';
                if (unit.firstHitReadyAtMs === 0) unit.firstHitReadyAtMs = this.elapsedMs + unit.profile.firstHitDelayMs;
                if (this.elapsedMs >= unit.firstHitReadyAtMs && this.elapsedMs >= unit.nextAttackAtMs) {
                    this.beginAttack(unit, target);
                }
                continue;
            }

            unit.firstHitReadyAtMs = 0;
            unit.state = 'moving';
            this.moveTowardTarget(unit, target);
        }
    }

    private updateActiveSkillCast(unit: BattleUnit): void {
        const definition = getActiveSkillDefinition(unit.activeSkillKey);
        if (!definition) {
            unit.activeSkillPhase = null;
            unit.state = 'idle';
            return;
        }
        unit.state = 'casting';
        const flightDuration = Math.max(1, unit.activeSkillImpactAtMs - unit.activeSkillStartedAtMs);
        const flightProgress = clamp((this.elapsedMs - unit.activeSkillStartedAtMs) / flightDuration, 0, 1);
        if (flightProgress < 1) {
            const travelProgress = (1 - Math.cos(Math.PI * flightProgress)) / 2;
            unit.x = lerp(unit.activeSkillStartX, unit.activeSkillLandingX, travelProgress);
            unit.y = lerp(unit.activeSkillStartY, unit.activeSkillLandingY, travelProgress);
            let elevationProgress: number;
            if (flightProgress < 0.42) {
                const ascent = flightProgress / 0.42;
                elevationProgress = 1 - Math.pow(1 - ascent, 3);
            } else if (flightProgress < 0.66) {
                elevationProgress = 1;
            } else {
                const descent = (flightProgress - 0.66) / 0.34;
                elevationProgress = 1 - Math.pow(descent, 3);
            }
            unit.elevation = Math.max(0, elevationProgress) * definition.liftHeight;
        } else {
            unit.x = unit.activeSkillLandingX;
            unit.y = unit.activeSkillLandingY;
            unit.elevation = 0;
        }
        while (unit.activeSkillNextWaveIndex < definition.impactWaves.length) {
            const wave = definition.impactWaves[unit.activeSkillNextWaveIndex];
            if (this.elapsedMs < unit.activeSkillImpactAtMs + wave.delayAfterLandingMs) break;
            this.resolveActiveSkillImpact(unit, definition, wave);
            unit.activeSkillNextWaveIndex += 1;
        }
        if (this.elapsedMs < unit.activeSkillEndsAtMs) return;
        unit.activeSkillPhase = unit.activeSkillCooldownRemainingMs > 0 ? 'cooldown' : 'ready';
        unit.state = 'idle';
        unit.acquisitionReadyAtMs = this.elapsedMs;
    }

    private resolveActiveSkillImpact(
        unit: BattleUnit,
        definition: NonNullable<ReturnType<typeof getActiveSkillDefinition>>,
        wave: ActiveSkillImpactWave,
    ): void {
        const impactX = unit.activeSkillLandingX;
        const impactY = unit.activeSkillLandingY;
        for (const target of this.units) {
            if (target === unit || target.team === unit.team || target.hp <= 0 || !definition.targetMask.units) continue;
            if (target.profile.movementType === 'air' && !definition.targetMask.air) continue;
            if (target.profile.movementType === 'ground' && !definition.targetMask.ground) continue;
            if (Math.hypot(target.x - impactX, target.y - impactY) > wave.radius + target.profile.collisionRadius) continue;
            this.damageTarget(target, wave.damage, unit.team);
        }
        if (!definition.targetMask.towers) return;
        const towerDamage = Math.max(1, Math.round(wave.damage * wave.towerDamageMultiplier));
        for (const tower of this.towers) {
            if (tower.team === unit.team || !tower.active || tower.hp <= 0) continue;
            if (Math.hypot(tower.x - impactX, tower.y - impactY) > wave.radius + tower.collisionRadius) continue;
            this.damageTarget(tower, towerDamage, unit.team);
        }
    }

    private getActiveSkillLandingPoint(unit: BattleUnit, distance: number): { x: number; y: number } {
        const length = Math.hypot(unit.directionX, unit.directionY);
        const directionX = length > 0.001 ? unit.directionX / length : 0;
        const directionY = length > 0.001 ? unit.directionY / length : unit.team === 'blue' ? -1 : 1;
        const pointAt = (travel: number) => ({
            x: clamp(unit.x + directionX * travel, MIN_X, MAX_X),
            y: clamp(unit.y + directionY * travel, MIN_Y, MAX_Y),
        });
        const desired = pointAt(distance);
        if (isWalkableGroundPoint(desired.x, desired.y)) return desired;
        for (let step = 7; step >= 0; step -= 1) {
            const candidate = pointAt(distance * (step / 8));
            if (isWalkableGroundPoint(candidate.x, candidate.y)) return candidate;
        }
        return { x: unit.x, y: unit.y };
    }

    private resolvePendingAttacks(): void {
        for (const unit of this.units) {
            const pending = unit.pendingAttack;
            if (!pending || pending.resolvesAtMs > this.elapsedMs) continue;
            unit.pendingAttack = null;
            if (unit.hp <= 0 || this.elapsedMs < unit.stunnedUntilMs) continue;
            const target = this.findTargetById(pending.targetId);
            if (!target || !isAlive(target)) continue;
            if (pending.kind === 'melee') {
                if (!this.isInAttackRange(unit, target, true)) continue;
                this.damageTarget(target, unit.profile.damage, unit.team);
                unit.hitSerial += 1;
            } else if (unit.profile.projectile) {
                this.launchProjectile(unit, target);
                if (unit.profile.recoilDistance > 0) this.applyRecoil(unit, target, unit.profile.recoilDistance);
            }
        }
    }

    private beginAttack(unit: BattleUnit, target: BattleTarget): void {
        unit.attackSerial += 1;
        unit.nextAttackAtMs = this.elapsedMs + unit.profile.attackIntervalMs;
        unit.pendingAttack = {
            targetId: target.id,
            resolvesAtMs: this.elapsedMs + unit.profile.attackWindupMs,
            kind: unit.profile.projectile ? 'projectile' : 'melee',
        };
        if (isTower(target)) unit.towerTargetCommitted = true;
    }

    private updateProjectiles(): void {
        for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
            const projectile = this.projectiles[index];
            projectile.ageMs += TICK_MS;
            const target = this.findTargetById(projectile.targetId);
            if (!target || !isAlive(target) || projectile.ageMs > projectile.maxLifetimeMs) {
                this.projectiles.splice(index, 1);
                continue;
            }
            const dx = target.x - projectile.x;
            const dy = target.y - projectile.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= 9 || projectile.speed * (TICK_MS / 1000) >= distance) {
                if (projectile.splashRadius > 0) this.applySplashDamage(target.x, target.y, projectile);
                else this.damageTarget(target, projectile.damage, projectile.team);
                const attacker = this.units.find((unit) => unit.id === projectile.attackerId);
                if (attacker) attacker.hitSerial += 1;
                this.projectiles.splice(index, 1);
                continue;
            }
            projectile.directionX = dx / distance;
            projectile.directionY = dy / distance;
            const step = projectile.speed * (TICK_MS / 1000);
            projectile.x += projectile.directionX * step;
            projectile.y += projectile.directionY * step;
        }
    }

    private launchProjectile(attacker: BattleUnit | BattleTower, target: BattleTarget): void {
        const profile = isTower(attacker) ? null : attacker.profile.projectile;
        this.projectileCounter += 1;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        this.projectiles.push({
            id: `${this.roomId}:p:${this.projectileCounter}`,
            attackerId: attacker.id,
            team: attacker.team,
            projectileKey: profile?.key ?? 'projectile_tower',
            x: attacker.x,
            y: attacker.y - 5,
            directionX: dx / distance,
            directionY: dy / distance,
            targetId: target.id,
            damage: isTower(attacker) ? attacker.damage : attacker.profile.damage,
            splashRadius: profile?.splashRadius ?? 0,
            speed: profile?.speed ?? 320,
            ageMs: 0,
            maxLifetimeMs: profile?.key.includes('cannon') ? 2_600 : profile?.key.includes('spear') ? 1_900 : 2_200,
        });
    }

    private updateTowers(): void {
        for (const tower of this.towers) {
            if (!tower.active || tower.hp <= 0 || this.elapsedMs < tower.nextAttackAtMs) continue;
            const target = this.units
                .filter((unit) => unit.team !== tower.team && unit.hp > 0 && unit.state !== 'spawning')
                .map((unit) => ({ unit, distance: edgeDistance(tower, unit) }))
                .filter((entry) => entry.distance <= tower.range)
                .sort((a, b) => a.distance - b.distance || a.unit.id.localeCompare(b.unit.id))[0]?.unit;
            if (!target) continue;
            tower.nextAttackAtMs = this.elapsedMs + tower.attackCooldownMs;
            this.launchProjectile(tower, target);
        }
    }

    private resolveUnitTarget(unit: BattleUnit): BattleTarget | null {
        const locked = this.findTargetById(unit.targetId);
        if (locked && isAlive(locked)) {
            if (!isTower(locked) && unit.profile.canTargetUnits && this.canTargetMovementType(unit, locked)) return locked;
            if (isTower(locked) && unit.profile.canTargetTowers && unit.towerTargetCommitted) return locked;
        }
        if (this.elapsedMs < unit.acquisitionReadyAtMs) return locked && isAlive(locked) ? locked : this.findTowerFallback(unit);

        if (unit.profile.targetPolicy !== 'building-only' && unit.profile.canTargetUnits) {
            const enemy = this.findNearestVisibleEnemyUnit(unit);
            if (enemy) return enemy;
        }
        return unit.profile.canTargetTowers ? this.findTowerFallback(unit) : null;
    }

    private assignTarget(unit: BattleUnit, target: BattleTarget | null): void {
        const nextId = target?.id ?? null;
        if (unit.targetId === nextId) return;
        unit.targetId = nextId;
        unit.firstHitReadyAtMs = 0;
        unit.pendingAttack = null;
        unit.towerTargetCommitted = false;
        if (target && isTower(target) && target.type === 'princess') unit.lane = laneFromX(target.x);
    }

    private findNearestVisibleEnemyUnit(unit: BattleUnit): BattleUnit | null {
        const actorSide = arenaSide(unit.y);
        return this.units
            .filter((candidate) => candidate !== unit && candidate.team !== unit.team && candidate.hp > 0 && candidate.state !== 'spawning')
            .filter((candidate) => this.canTargetMovementType(unit, candidate))
            .map((candidate) => {
                const directDistance = Math.hypot(candidate.x - unit.x, candidate.y - unit.y);
                const candidateSide = arenaSide(candidate.y);
                const sameSide = actorSide === 0 || candidateSide === 0 || actorSide === candidateSide;
                const sameBridge = bridgeLaneAt(unit.x, unit.y) !== null && bridgeLaneAt(unit.x, unit.y) === bridgeLaneAt(candidate.x, candidate.y);
                const visible = directDistance <= unit.profile.sightRange && (sameSide || (sameBridge && directDistance <= 92));
                return { candidate, directDistance, visible };
            })
            .filter((entry) => entry.visible)
            .sort((a, b) => a.directDistance - b.directDistance || a.candidate.id.localeCompare(b.candidate.id))[0]?.candidate ?? null;
    }

    private canTargetMovementType(unit: BattleUnit, candidate: BattleUnit): boolean {
        if (candidate.profile.movementType === 'ground') return unit.profile.canTargetGround;
        return unit.profile.canTargetAir;
    }

    private findTowerFallback(unit: BattleUnit): BattleTower | null {
        const enemyTowers = this.towers.filter((tower) => tower.team !== unit.team && tower.active && tower.hp > 0);
        const sameLanePrincess = enemyTowers.find((tower) => tower.type === 'princess' && laneFromX(tower.x) === unit.lane);
        if (sameLanePrincess) return sameLanePrincess;
        const king = enemyTowers.find((tower) => tower.type === 'king');
        return king ?? enemyTowers.sort((a, b) => edgeDistance(unit, a) - edgeDistance(unit, b) || a.id.localeCompare(b.id))[0] ?? null;
    }

    private findTargetById(id: string | null): BattleTarget | null {
        if (!id) return null;
        return this.units.find((unit) => unit.id === id) ?? this.towers.find((tower) => tower.id === id) ?? null;
    }

    private isInAttackRange(unit: BattleUnit, target: BattleTarget, useExitPadding = false): boolean {
        const padding = unit.profile.rangePadding + (useExitPadding ? unit.profile.attackExitPadding : 0);
        return edgeDistance(unit, target) <= unit.profile.range + padding;
    }

    private moveTowardTarget(unit: BattleUnit, target: BattleTarget): void {
        if (unit.profile.movementRoute === 'river-jump' && this.tryStartRiverJump(unit, target)) return;
        let destination = this.getApproachPoint(unit, target);
        if (unit.profile.movementRoute === 'ground-bridge') destination = this.getGroundWaypoint(unit, destination.x, destination.y);
        this.moveUnit(unit, destination.x, destination.y, unit.profile.speed);
    }

    private getApproachPoint(unit: BattleUnit, target: BattleTarget): { x: number; y: number } {
        if (unit.profile.projectile) return { x: target.x, y: target.y };
        const radius = collisionRadius(target) + unit.profile.collisionRadius + 3;
        const slot = stableSlot(unit.id, target.id, isTower(target) ? 16 : 10);
        const angle = (slot / (isTower(target) ? 16 : 10)) * Math.PI * 2;
        return { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
    }

    private getGroundWaypoint(unit: BattleUnit, targetX: number, targetY: number): { x: number; y: number } {
        const crossing = (unit.y > RIVER_BOTTOM && targetY < RIVER_TOP) || (unit.y < RIVER_TOP && targetY > RIVER_BOTTOM);
        const nearRiver = Math.abs(unit.y - RIVER_Y) <= RIVER_HALF_HEIGHT + BRIDGE_APPROACH;
        if (!crossing && !nearRiver) return { x: targetX, y: targetY };
        const bridgeX = unit.lane === 'left' ? BRIDGE_X[0] : BRIDGE_X[1];
        if (Math.abs(unit.x - bridgeX) > 18) {
            return { x: bridgeX, y: unit.team === 'blue' ? RIVER_BOTTOM + 18 : RIVER_TOP - 18 };
        }
        if (nearRiver) {
            return { x: bridgeX, y: unit.team === 'blue' ? RIVER_TOP - 24 : RIVER_BOTTOM + 24 };
        }
        return { x: targetX, y: targetY };
    }

    private tryStartRiverJump(unit: BattleUnit, target: BattleTarget): boolean {
        const jump = unit.profile.jump;
        if (!jump || this.elapsedMs < unit.jumpCooldownUntilMs) return false;
        const crossing = (unit.y > RIVER_BOTTOM && target.y < RIVER_TOP) || (unit.y < RIVER_TOP && target.y > RIVER_BOTTOM);
        const nearTakeoff = unit.team === 'blue' ? unit.y <= RIVER_BOTTOM + 44 : unit.y >= RIVER_TOP - 44;
        if (!crossing || !nearTakeoff) return false;
        const landingY = unit.team === 'blue' ? RIVER_TOP - jump.landingOffset : RIVER_BOTTOM + jump.landingOffset;
        const landingX = clamp(unit.x + clamp((target.x - unit.x) * 0.18, -24, 24), MIN_X, MAX_X);
        const distance = Math.hypot(landingX - unit.x, landingY - unit.y);
        unit.state = 'jumping';
        unit.jumpSerial += 1;
        unit.jumpStartedAtMs = this.elapsedMs;
        unit.jumpEndsAtMs = this.elapsedMs + Math.max(260, (distance / jump.speed) * 1000);
        unit.jumpStartX = unit.x;
        unit.jumpStartY = unit.y;
        unit.jumpTargetX = landingX;
        unit.jumpTargetY = landingY;
        unit.directionX = (landingX - unit.x) / Math.max(1, distance);
        unit.directionY = (landingY - unit.y) / Math.max(1, distance);
        return true;
    }

    private updateJump(unit: BattleUnit): void {
        const duration = Math.max(1, unit.jumpEndsAtMs - unit.jumpStartedAtMs);
        const progress = clamp((this.elapsedMs - unit.jumpStartedAtMs) / duration, 0, 1);
        unit.x = lerp(unit.jumpStartX, unit.jumpTargetX, progress);
        unit.y = lerp(unit.jumpStartY, unit.jumpTargetY, progress);
        unit.elevation = Math.sin(Math.PI * progress) * 24;
        if (progress < 1) return;
        unit.elevation = 0;
        unit.state = 'moving';
        unit.jumpCooldownUntilMs = this.elapsedMs + (unit.profile.jump?.cooldownMs ?? 850);
    }

    private moveUnit(unit: BattleUnit, targetX: number, targetY: number, speed: number): void {
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 0.001) return;
        const step = Math.min(speed * (TICK_MS / 1000), distance);
        unit.directionX = dx / distance;
        unit.directionY = dy / distance;
        unit.x = clamp(unit.x + unit.directionX * step, MIN_X, MAX_X);
        unit.y = clamp(unit.y + unit.directionY * step, MIN_Y, MAX_Y);
        this.projectUnitToWalkable(unit);
    }

    private resolveEntityCollisions(): void {
        const collidableUnits = this.units
            .filter((unit) => unit.hp > 0 && unit.state !== 'jumping' && unit.state !== 'spawning' && unit.elevation <= 0.5 && unit.profile.collisionRadius > 0)
            .sort((a, b) => a.id.localeCompare(b.id));
        for (let pass = 0; pass < 3; pass += 1) {
            for (let left = 0; left < collidableUnits.length; left += 1) {
                for (let right = left + 1; right < collidableUnits.length; right += 1) {
                    this.separateUnits(collidableUnits[left], collidableUnits[right]);
                }
                for (const tower of this.towers) {
                    if (tower.active) this.separateUnitAndTower(collidableUnits[left], tower);
                }
            }
        }
    }

    private separateUnits(a: BattleUnit, b: BattleUnit): void {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
            dx = a.id < b.id ? 0.01 : -0.01;
            dy = 0;
            distance = 0.01;
        }
        const bothOnBridge = isOnBridge(a.x, a.y) && isOnBridge(b.x, b.y);
        const required = (a.profile.collisionRadius + b.profile.collisionRadius) * (bothOnBridge ? 0.78 : 1);
        const overlap = required - distance;
        if (overlap <= 0) return;
        let nx = dx / distance;
        let ny = dy / distance;
        if (bothOnBridge) {
            nx = 0;
            ny = Math.abs(dy) > 0.01 ? Math.sign(dy) : a.id < b.id ? 1 : -1;
        }
        const inverseA = 1 / Math.max(0.1, a.profile.collisionMass);
        const inverseB = 1 / Math.max(0.1, b.profile.collisionMass);
        const total = inverseA + inverseB;
        this.offsetUnit(a, -nx * overlap * 0.66 * (inverseA / total), -ny * overlap * 0.66 * (inverseA / total));
        this.offsetUnit(b, nx * overlap * 0.66 * (inverseB / total), ny * overlap * 0.66 * (inverseB / total));
    }

    private separateUnitAndTower(unit: BattleUnit, tower: BattleTower): void {
        const dx = unit.x - tower.x;
        const dy = unit.y - tower.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const overlap = unit.profile.collisionRadius + tower.collisionRadius - distance;
        if (overlap <= 0) return;
        this.offsetUnit(unit, (dx / distance) * overlap * 0.9, (dy / distance) * overlap * 0.9);
    }

    private offsetUnit(unit: BattleUnit, dx: number, dy: number): void {
        unit.x = clamp(unit.x + dx, MIN_X, MAX_X);
        unit.y = clamp(unit.y + dy, MIN_Y, MAX_Y);
        this.projectUnitToWalkable(unit);
    }

    private projectUnitToWalkable(unit: BattleUnit): void {
        if (unit.profile.movementType === 'air' || unit.state === 'jumping') return;
        if (unit.y >= RIVER_TOP && unit.y <= RIVER_BOTTOM && !isOnBridge(unit.x, unit.y)) {
            unit.y = unit.y < RIVER_Y ? RIVER_TOP - 1 : RIVER_BOTTOM + 1;
        }
    }

    private applyRecoil(unit: BattleUnit, target: BattleTarget, distance: number): void {
        const dx = unit.x - target.x;
        const dy = unit.y - target.y;
        const magnitude = Math.max(0.001, Math.hypot(dx, dy));
        this.offsetUnit(unit, (dx / magnitude) * distance, (dy / magnitude) * distance);
    }

    private applySplashDamage(x: number, y: number, projectile: BattleProjectile): void {
        for (const unit of this.units) {
            if (unit.team === projectile.team || unit.hp <= 0) continue;
            if (Math.hypot(unit.x - x, unit.y - y) <= projectile.splashRadius) {
                this.damageTarget(unit, projectile.damage, projectile.team);
            }
        }
        for (const tower of this.towers) {
            if (tower.team === projectile.team || !tower.active) continue;
            if (Math.hypot(tower.x - x, tower.y - y) <= projectile.splashRadius) {
                this.damageTarget(tower, projectile.damage, projectile.team);
            }
        }
    }

    private damageTarget(target: BattleTarget, damage: number, attackingTeam: BattleTeam): void {
        target.hp -= damage;
        if (isTower(target) && target.hp <= 0) this.destroyTower(target, attackingTeam);
    }

    private faceTarget(unit: BattleUnit, x: number, y: number): void {
        const dx = x - unit.x;
        const dy = y - unit.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 0.001) return;
        unit.directionX = dx / distance;
        unit.directionY = dy / distance;
    }

    private destroyTower(tower: BattleTower, attackingTeam: BattleTeam): void {
        if (!tower.active) return;
        tower.hp = 0;
        tower.active = false;
        if (tower.type === 'king') {
            if (attackingTeam === 'blue') this.blueCrowns = 3;
            else this.redCrowns = 3;
            this.finish(attackingTeam);
            return;
        }
        if (attackingTeam === 'blue') this.blueCrowns = Math.min(2, this.blueCrowns + 1);
        else this.redCrowns = Math.min(2, this.redCrowns + 1);
    }

    private removeDeadUnits(): void {
        for (let index = this.units.length - 1; index >= 0; index -= 1) {
            if (this.units[index].hp > 0) continue;
            const deadId = this.units[index].id;
            this.units.splice(index, 1);
            for (const unit of this.units) {
                if (unit.targetId === deadId) this.assignTarget(unit, null);
                if (unit.pendingAttack?.targetId === deadId) unit.pendingAttack = null;
            }
            for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
                const projectile = this.projectiles[projectileIndex];
                if (projectile.targetId === deadId || projectile.attackerId === deadId) this.projectiles.splice(projectileIndex, 1);
            }
        }
    }

    private checkFinished(): void {
        if (this.state !== 'running' || this.elapsedMs < BATTLE_DURATION_MS) return;
        const blueHp = this.towers.filter((tower) => tower.team === 'blue').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
        const redHp = this.towers.filter((tower) => tower.team === 'red').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
        this.finish(blueHp === redHp ? 'draw' : blueHp > redHp ? 'blue' : 'red');
    }

    private forfeitDisconnectedPlayers(): void {
        for (const player of this.players.values()) {
            if (player.connected || player.disconnectedAtMs === null) continue;
            if (this.elapsedMs - player.disconnectedAtMs >= DISCONNECT_GRACE_MS) {
                this.finish(oppositeTeam(player.team));
                return;
            }
        }
    }

    private finish(winner: BattleSnapshot['winner']): void {
        if (this.state === 'finished') return;
        this.winner = winner;
        this.state = 'finished';
        this.endedAtMs ??= Date.now();
    }

    private getKing(team: BattleTeam): BattleTower {
        const tower = this.towers.find((candidate) => candidate.team === team && candidate.type === 'king');
        if (!tower) throw new Error(`missing ${team} king tower`);
        return tower;
    }

    private isValidSpawnPosition(team: BattleTeam, x: number, y: number): boolean {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < MIN_X || x > MAX_X) return false;
        return team === 'blue' ? y >= BLUE_MIN_Y && y <= BLUE_MAX_Y : y >= RED_MIN_Y && y <= RED_MAX_Y;
    }
}

function normalizeDeck(deck: string[]): string[] {
    if (deck.length < 1 || deck.length > 8) throw new Error('deck must contain between 1 and 8 cards');
    if (deck.some((unitKey) => !getAuthoritativeCombatProfile(unitKey))) throw new Error('deck contains an unknown unit');
    return [...new Set(deck)].slice(0, 8);
}

function isTower(target: BattleTarget): target is BattleTower {
    return 'type' in target;
}

function isAlive(target: BattleTarget): boolean {
    return target.hp > 0 && (!isTower(target) || target.active);
}

function collisionRadius(target: BattleTarget): number {
    return isTower(target) ? target.collisionRadius : target.profile.collisionRadius;
}

function edgeDistance(a: BattleTarget, b: BattleTarget): number {
    return Math.max(0, Math.hypot(b.x - a.x, b.y - a.y) - collisionRadius(a) - collisionRadius(b));
}

function laneFromX(x: number): 'left' | 'right' {
    return x < 180 ? 'left' : 'right';
}

function arenaSide(y: number): -1 | 0 | 1 {
    if (y < RIVER_TOP) return -1;
    if (y > RIVER_BOTTOM) return 1;
    return 0;
}

function bridgeLaneAt(x: number, y: number): 'left' | 'right' | null {
    if (Math.abs(y - RIVER_Y) > RIVER_HALF_HEIGHT + BRIDGE_APPROACH) return null;
    if (Math.abs(x - BRIDGE_X[0]) <= BRIDGE_HALF_WIDTH) return 'left';
    if (Math.abs(x - BRIDGE_X[1]) <= BRIDGE_HALF_WIDTH) return 'right';
    return null;
}

function isOnBridge(x: number, y: number): boolean {
    return y >= RIVER_TOP - 6 && y <= RIVER_BOTTOM + 6 && bridgeLaneAt(x, y) !== null;
}

function isWalkableGroundPoint(x: number, y: number): boolean {
    return y < RIVER_TOP || y > RIVER_BOTTOM || isOnBridge(x, y);
}

function definitionWaveCount(skillKey: ActiveSkillKey | null): number {
    return getActiveSkillDefinition(skillKey)?.impactWaves.length ?? 0;
}

function stableSlot(attackerId: string, targetId: string, count: number): number {
    let hash = 0;
    const value = `${attackerId}:${targetId}`;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash) % count;
}

function oppositeTeam(team: BattleTeam): BattleTeam {
    return team === 'blue' ? 'red' : 'blue';
}

function skillDirection(
    directionX: number,
    directionY: number,
): 'north-east' | 'north-west' | 'south-east' | 'south-west' {
    const vertical = directionY < 0 ? 'north' : 'south';
    const horizontal = directionX < 0 ? 'west' : 'east';
    return `${vertical}-${horizontal}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
}
