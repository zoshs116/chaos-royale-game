import { getAuthoritativeCombatProfile, type AuthoritativeCombatProfile } from './CombatProfile';
import {
    getActiveSkillDefinition,
    type ActiveSkillImpactWave,
    type ActiveSkillKey,
    type ActiveSkillPhase,
} from '../../../src/data/ActiveSkillData';
import {
    resolveSharedCombatTarget,
    type SharedTargetView,
} from '../../../src/systems/combat/SharedTargeting';

export type BattleTeam = 'blue' | 'red';
export type BattleState = 'waiting' | 'running' | 'finished';
export type BattleFinishReason = 'king_destroyed' | 'time_limit' | 'forfeit' | 'disconnect_timeout';
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
    spawnTick: number;
    attackTick: number;
    hitTick: number;
    jumpTick: number;
    activeSkillCastTick: number;
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

export interface BattleSkillZoneSnapshot {
    id: string;
    skillKey: ActiveSkillKey;
    team: BattleTeam;
    x: number;
    y: number;
    radius: number;
    remainingMs: number;
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
    sequence: number;
    serverTimeMs: number;
    state: BattleState;
    paused: boolean;
    disconnectGraceRemainingMs: number | null;
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
        hand: Array<string | null>;
        nextUnitKey: string | null;
    }>;
    inputCount: number;
    startedAtUtc: string | null;
    endedAtUtc: string | null;
    units: BattleUnitSnapshot[];
    projectiles: BattleProjectileSnapshot[];
    skillZones: BattleSkillZoneSnapshot[];
    towers: BattleTowerSnapshot[];
    winner: BattleTeam | 'draw' | null;
    finishReason: BattleFinishReason | null;
}

type PlayerState = BattlePlayerConfig & {
    hand: Array<string | null>;
    drawIndex: number;
    elixir: number;
    lastSeq: number;
    connected: boolean;
    disconnectedAtRealMs: number | null;
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
    knockupStartedAtMs: number;
    knockupUntilMs: number;
    knockupHeight: number;
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
    activeSkillEffectX: number;
    activeSkillEffectY: number;
    activeSkillNextWaveIndex: number;
    progressCheckAtMs: number;
    progressX: number;
    progressY: number;
    stalledChecks: number;
    ignoredTargetId: string | null;
    ignoreTargetUntilMs: number;
};

type BattleSkillZone = BattleSkillZoneSnapshot & {
    expiresAtMs: number;
    nextTickAtMs: number;
    tickIntervalMs: number;
    damagePerTick: number;
    root: boolean;
    casterId: string;
    nextFollowUpAtMs: number;
    followUpIntervalMs: number;
    followUpDamage: number;
    affectsTowers: boolean;
    towerDamageMultiplier: number;
};

type BattleTower = BattleTowerSnapshot & {
    damage: number;
    range: number;
    collisionRadius: number;
    attackCooldownMs: number;
    nextAttackAtMs: number;
    disabledUntilMs: number;
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
const DISCONNECT_GRACE_MS = 45_000;
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

const TOWER_DEFINITIONS: Array<Omit<BattleTower, 'hp' | 'active' | 'nextAttackAtMs' | 'disabledUntilMs'>> = [
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
    private readonly skillZones: BattleSkillZone[] = [];
    private readonly towers: BattleTower[] = TOWER_DEFINITIONS.map((tower) => ({
        ...tower,
        hp: tower.maxHp,
        active: true,
        nextAttackAtMs: 0,
        disabledUntilMs: 0,
    }));
    private tick = 0;
    private elapsedMs = 0;
    private state: BattleState = 'waiting';
    private winner: BattleSnapshot['winner'] = null;
    private finishReason: BattleFinishReason | null = null;
    private blueCrowns = 0;
    private redCrowns = 0;
    private unitCounter = 0;
    private skillZoneCounter = 0;
    private projectileCounter = 0;
    private inputCount = 0;
    private snapshotSequence = 0;
    private startedAtMs: number | null = null;
    private endedAtMs: number | null = null;

    constructor(
        public readonly roomId: string,
        private readonly now: () => number = Date.now,
    ) {}

    public join(config: BattlePlayerConfig): BattleSnapshot {
        const deck = normalizeDeck(config.deck);
        const existing = this.players.get(config.playerId);
        if (existing) {
            if (existing.team !== config.team) throw new Error('player team does not match the existing seat');
            existing.connected = true;
            existing.disconnectedAtRealMs = null;
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
            disconnectedAtRealMs: null,
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
        player.disconnectedAtRealMs = this.now();
    }

    public enqueue(command: BattleCommand): { accepted: boolean; reason?: string } {
        const player = this.players.get(command.playerId);
        if (!player) return { accepted: false, reason: 'player_not_in_room' };
        if (this.state !== 'running') return { accepted: false, reason: 'match_not_running' };
        if (!Number.isSafeInteger(command.seq)) {
            return { accepted: false, reason: 'duplicate_or_stale_sequence' };
        }
        if (command.seq <= player.lastSeq) return { accepted: true, reason: 'already_applied' };
        player.lastSeq = command.seq;
        this.inputCount += 1;
        if (command.type === 'forfeit') {
            this.finish(oppositeTeam(player.team), 'forfeit');
            return { accepted: true };
        }
        if (this.isPausedForReconnect()) return { accepted: false, reason: 'match_paused' };
        if (command.type === 'cast_active_skill') {
            return this.applyCastActiveSkill(player, command);
        }
        return this.applySpawn(player, command);
    }

    public step(): BattleSnapshot {
        this.advance();
        return this.snapshot();
    }

    public advance(): void {
        if (this.state !== 'running') return;
        this.forfeitDisconnectedPlayers();
        if (this.state !== 'running' || this.isPausedForReconnect()) return;
        this.tick += 1;
        this.elapsedMs += TICK_MS;
        this.regenerateElixir();
        this.resolvePendingAttacks();
        this.updateProjectiles();
        this.updateActiveSkillZones();
        this.updateUnits();
        this.resolveEntityCollisions();
        this.updateTowers();
        this.removeDeadUnits();
        this.checkFinished();
    }

    public getState(): BattleState {
        return this.state;
    }

    public isPaused(): boolean {
        return this.state === 'running' && this.isPausedForReconnect();
    }

    public snapshot(): BattleSnapshot {
        this.snapshotSequence += 1;
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
        const disconnectGraceRemainingMs = this.getDisconnectGraceRemainingMs();
        return {
            roomId: this.roomId,
            tick: this.tick,
            sequence: this.snapshotSequence,
            serverTimeMs: this.now(),
            state: this.state,
            paused: this.state === 'running' && disconnectGraceRemainingMs !== null,
            disconnectGraceRemainingMs,
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
                nextUnitKey: this.peekNextAvailableCard(player),
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
                knockupStartedAtMs: _knockupStarted,
                knockupUntilMs: _knockupUntil,
                knockupHeight: _knockupHeight,
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
                activeSkillEffectX: _skillEffectX,
                activeSkillEffectY: _skillEffectY,
                activeSkillNextWaveIndex: _skillWaveIndex,
                progressCheckAtMs: _progressCheck,
                progressX: _progressX,
                progressY: _progressY,
                stalledChecks: _stalledChecks,
                ignoredTargetId: _ignoredTargetId,
                ignoreTargetUntilMs: _ignoreTargetUntil,
                ...unit
            }) => ({ ...unit })),
            projectiles: this.projectiles.map(({ attackerId: _attacker, damage: _damage, splashRadius: _splash, speed: _speed, ageMs: _age, maxLifetimeMs: _lifetime, ...projectile }) => ({ ...projectile })),
            skillZones: this.skillZones.map(({ expiresAtMs: _expires, nextTickAtMs: _nextTick, tickIntervalMs: _interval, damagePerTick: _damage, root: _root, casterId: _casterId, nextFollowUpAtMs: _nextFollowUp, followUpIntervalMs: _followUpInterval, followUpDamage: _followUpDamage, affectsTowers: _affectsTowers, towerDamageMultiplier: _towerMultiplier, ...zone }) => ({
                ...zone,
                remainingMs: Math.max(0, _expires - this.elapsedMs),
            })),
            towers: this.towers.map(({ damage: _damage, range: _range, collisionRadius: _radius, attackCooldownMs: _cooldown, nextAttackAtMs: _next, disabledUntilMs: _disabled, ...tower }) => ({ ...tower })),
            winner: this.winner,
            finishReason: this.finishReason,
        };
    }

    private getLockedActiveSkillUnitKeys(playerId: string, additionallyLockedUnitKey?: string): Set<string> {
        const locked = new Set(
            this.units
                .filter(unit => unit.ownerId === playerId && unit.hp > 0 && Boolean(unit.profile.activeSkill))
                .map(unit => unit.unitKey),
        );
        if (additionallyLockedUnitKey && getAuthoritativeCombatProfile(additionallyLockedUnitKey)?.activeSkill) {
            locked.add(additionallyLockedUnitKey);
        }
        return locked;
    }

    private drawNextAvailableCard(player: PlayerState, additionallyLockedUnitKey?: string): string | null {
        const locked = this.getLockedActiveSkillUnitKeys(player.playerId, additionallyLockedUnitKey);
        for (let attempt = 0; attempt < player.deck.length; attempt += 1) {
            const unitKey = player.deck[player.drawIndex];
            player.drawIndex = (player.drawIndex + 1) % player.deck.length;
            if (!locked.has(unitKey)) return unitKey;
        }
        return null;
    }

    private peekNextAvailableCard(player: PlayerState): string | null {
        const locked = this.getLockedActiveSkillUnitKeys(player.playerId);
        for (let attempt = 0; attempt < player.deck.length; attempt += 1) {
            const unitKey = player.deck[(player.drawIndex + attempt) % player.deck.length];
            if (!locked.has(unitKey)) return unitKey;
        }
        return null;
    }

    private refillAvailableHandSlots(player: PlayerState): void {
        for (let handIndex = 0; handIndex < player.hand.length; handIndex += 1) {
            if (player.hand[handIndex] !== null) continue;
            const replacement = this.drawNextAvailableCard(player);
            if (!replacement) return;
            player.hand[handIndex] = replacement;
        }
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
        player.hand[command.handIndex] = this.drawNextAvailableCard(player, command.unitKey);
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
                spawnTick: this.tick,
                attackTick: -1,
                hitTick: -1,
                jumpTick: -1,
                activeSkillCastTick: -1,
                profile,
                lane: laneFromX(x),
                spawnReadyAtMs: this.elapsedMs + profile.deployDelayMs,
                acquisitionReadyAtMs: this.elapsedMs + profile.deployDelayMs + profile.acquisitionDelayMs,
                firstHitReadyAtMs: 0,
                nextAttackAtMs: 0,
                pendingAttack: null,
                towerTargetCommitted: false,
                stunnedUntilMs: 0,
                knockupStartedAtMs: 0,
                knockupUntilMs: 0,
                knockupHeight: 0,
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
                activeSkillEffectX: x,
                activeSkillEffectY: y,
                activeSkillNextWaveIndex: 0,
                progressCheckAtMs: this.elapsedMs + 650,
                progressX: x,
                progressY: y,
                stalledChecks: 0,
                ignoredTargetId: null,
                ignoreTargetUntilMs: 0,
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
        const travelDistance = definition.movementMode === 'backward-vault'
            ? -definition.forwardDistance
            : definition.forwardDistance;
        const landing = this.getActiveSkillLandingPoint(unit, travelDistance);
        const effectPoint = this.getActiveSkillEffectPoint(unit, landing, definition.effectForwardDistance);
        unit.state = 'casting';
        unit.pendingAttack = null;
        unit.firstHitReadyAtMs = 0;
        unit.activeSkillPhase = 'casting';
        unit.activeSkillCooldownRemainingMs = definition.cooldownMs;
        unit.activeSkillReadyAtMs = this.elapsedMs + definition.cooldownMs;
        unit.activeSkillStartedAtMs = this.elapsedMs;
        unit.activeSkillImpactAtMs = this.elapsedMs + timing.impactMs;
        unit.activeSkillEndsAtMs = this.elapsedMs + Math.max(
            timing.totalMs,
            timing.impactMs + (definition.sustainedFollowUp?.channelDurationMs ?? 0),
        );
        unit.activeSkillStartX = unit.x;
        unit.activeSkillStartY = unit.y;
        unit.activeSkillLandingX = landing.x;
        unit.activeSkillLandingY = landing.y;
        unit.activeSkillEffectX = effectPoint.x;
        unit.activeSkillEffectY = effectPoint.y;
        unit.activeSkillNextWaveIndex = 0;
        unit.activeSkillCastSerial += 1;
        unit.activeSkillCastTick = this.tick;
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
            this.updateKnockupElevation(unit);
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
                this.resetRouteProgress(unit);
                continue;
            }
            this.faceTarget(unit, target.x, target.y);
            if (this.isInAttackRange(unit, target, true)) {
                unit.state = 'attacking';
                this.resetRouteProgress(unit);
                if (unit.firstHitReadyAtMs === 0) unit.firstHitReadyAtMs = this.elapsedMs + unit.profile.firstHitDelayMs;
                if (this.elapsedMs >= unit.firstHitReadyAtMs && this.elapsedMs >= unit.nextAttackAtMs) {
                    this.beginAttack(unit, target);
                }
                continue;
            }

            unit.firstHitReadyAtMs = 0;
            unit.state = 'moving';
            this.moveTowardTarget(unit, target);
            this.updateRouteProgress(unit, target);
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
            if (definition.movementMode === 'stationary-release') {
                unit.x = unit.activeSkillStartX;
                unit.y = unit.activeSkillStartY;
                unit.elevation = 0;
            } else {
            const backwardVault = definition.movementMode === 'backward-vault';
            const vaultEnd = 0.72;
            const vaultProgress = clamp(flightProgress / vaultEnd, 0, 1);
            const slideProgress = clamp((flightProgress - vaultEnd) / (1 - vaultEnd), 0, 1);
            const travelProgress = backwardVault
                ? flightProgress < vaultEnd
                    ? 0.72 * ((1 - Math.cos(Math.PI * vaultProgress)) / 2)
                    : 0.72 + 0.28 * (1 - Math.pow(1 - slideProgress, 3))
                : (1 - Math.cos(Math.PI * flightProgress)) / 2;
            unit.x = lerp(unit.activeSkillStartX, unit.activeSkillLandingX, travelProgress);
            unit.y = lerp(unit.activeSkillStartY, unit.activeSkillLandingY, travelProgress);
            let elevationProgress: number;
            if (backwardVault) {
                elevationProgress = flightProgress < vaultEnd ? Math.sin(Math.PI * vaultProgress) : 0;
            } else if (flightProgress < 0.42) {
                const ascent = flightProgress / 0.42;
                elevationProgress = 1 - Math.pow(1 - ascent, 3);
            } else if (flightProgress < 0.66) {
                elevationProgress = 1;
            } else {
                const descent = (flightProgress - 0.66) / 0.34;
                elevationProgress = 1 - Math.pow(descent, 3);
            }
            unit.elevation = Math.max(0, elevationProgress) * definition.liftHeight;
            }
        } else {
            unit.x = unit.activeSkillLandingX;
            unit.y = unit.activeSkillLandingY;
            unit.elevation = 0;
        }
        while (unit.activeSkillNextWaveIndex < definition.impactWaves.length) {
            const wave = definition.impactWaves[unit.activeSkillNextWaveIndex];
            if (this.elapsedMs < unit.activeSkillImpactAtMs + wave.delayAfterLandingMs) break;
            this.resolveActiveSkillImpact(unit, definition, wave);
            if (unit.activeSkillNextWaveIndex === 0) this.createActiveSkillZone(unit, definition);
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
        const impactX = unit.activeSkillEffectX;
        const impactY = unit.activeSkillEffectY;
        unit.activeSkillEffectX = impactX;
        unit.activeSkillEffectY = impactY;
        const directionLength = Math.max(0.001, Math.hypot(impactX - unit.activeSkillStartX, impactY - unit.activeSkillStartY));
        const knockbackX = (impactX - unit.activeSkillStartX) / directionLength;
        const knockbackY = (impactY - unit.activeSkillStartY) / directionLength;
        for (const target of this.units) {
            if (target === unit || target.team === unit.team || target.hp <= 0 || !definition.targetMask.units) continue;
            if (target.profile.movementType === 'air' && !definition.targetMask.air) continue;
            if (target.profile.movementType === 'ground' && !definition.targetMask.ground) continue;
            const isHit = definition.key === 'dragon_blade' && definition.travelingProjectile
                ? this.isInsideDragonBladePath(
                    unit,
                    target,
                    impactX,
                    impactY,
                    definition.travelingProjectile.collisionRadius,
                )
                : Math.hypot(target.x - impactX, target.y - impactY) <= wave.radius + target.profile.collisionRadius;
            if (!isHit) continue;
            this.damageTarget(target, wave.damage, unit.team);
            if (
                target.hp > 0
                && wave.knockupHeight
                && wave.knockupDurationMs
            ) {
                target.pendingAttack = null;
                target.targetId = null;
                target.towerTargetCommitted = false;
                target.firstHitReadyAtMs = 0;
                target.stunnedUntilMs = Math.max(
                    target.stunnedUntilMs,
                    this.elapsedMs + wave.knockupDurationMs,
                );
                target.knockupStartedAtMs = this.elapsedMs;
                target.knockupUntilMs = this.elapsedMs + wave.knockupDurationMs;
                target.knockupHeight = wave.knockupHeight;
                target.state = 'stunned';
                target.jumpEndsAtMs = 0;
            }
            if (definition.key === 'dragon_blade' && target.hp > 0 && definition.travelingProjectile) {
                target.pendingAttack = null;
                target.targetId = null;
                target.towerTargetCommitted = false;
                target.firstHitReadyAtMs = 0;
                target.stunnedUntilMs = Math.max(
                    target.stunnedUntilMs,
                    this.elapsedMs + definition.travelingProjectile.knockbackDurationMs,
                );
                this.offsetUnit(
                    target,
                    knockbackX * definition.travelingProjectile.knockbackDistance,
                    knockbackY * definition.travelingProjectile.knockbackDistance,
                );
            }
        }
        if (!definition.targetMask.towers) return;
        const towerDamage = Math.round(wave.damage * wave.towerDamageMultiplier);
        for (const tower of this.towers) {
            if (tower.team === unit.team || !tower.active || tower.hp <= 0) continue;
            const isHit = definition.key === 'dragon_blade' && definition.travelingProjectile
                ? this.isInsideDragonBladePath(
                    unit,
                    tower,
                    impactX,
                    impactY,
                    definition.travelingProjectile.collisionRadius,
                )
                : Math.hypot(tower.x - impactX, tower.y - impactY) <= wave.radius + tower.collisionRadius;
            if (!isHit) continue;
            if (towerDamage > 0) this.damageTarget(tower, towerDamage, unit.team);
            if (definition.persistentZone?.root) {
                tower.disabledUntilMs = Math.max(
                    tower.disabledUntilMs,
                    this.elapsedMs + definition.persistentZone.durationMs,
                );
            }
        }
    }

    private updateKnockupElevation(unit: BattleUnit): void {
        if (unit.knockupUntilMs <= this.elapsedMs || unit.knockupUntilMs <= unit.knockupStartedAtMs) {
            if (unit.knockupHeight > 0) {
                unit.elevation = 0;
                unit.knockupStartedAtMs = 0;
                unit.knockupUntilMs = 0;
                unit.knockupHeight = 0;
            }
            return;
        }
        const duration = unit.knockupUntilMs - unit.knockupStartedAtMs;
        const progress = clamp((this.elapsedMs - unit.knockupStartedAtMs) / Math.max(1, duration), 0, 1);
        unit.elevation = Math.sin(Math.PI * progress) * unit.knockupHeight;
    }

    private isInsideDragonBladePath(
        caster: BattleUnit,
        target: BattleTarget,
        destinationX: number,
        destinationY: number,
        projectileRadius: number,
    ): boolean {
        const startX = caster.activeSkillStartX;
        const startY = caster.activeSkillStartY;
        const dx = destinationX - startX;
        const dy = destinationY - startY;
        const lengthSquared = Math.max(0.001, dx * dx + dy * dy);
        const projection = clamp(((target.x - startX) * dx + (target.y - startY) * dy) / lengthSquared, 0, 1);
        const projectedX = startX + dx * projection;
        const projectedY = startY + dy * projection;
        return Math.hypot(target.x - projectedX, target.y - projectedY)
            <= projectileRadius + collisionRadius(target);
    }

    private createActiveSkillZone(
        unit: BattleUnit,
        definition: NonNullable<ReturnType<typeof getActiveSkillDefinition>>,
    ): void {
        const persistent = definition.persistentZone;
        if (!persistent) return;
        this.skillZones.push({
            id: `${this.roomId}:skill-zone:${++this.skillZoneCounter}`,
            skillKey: definition.key,
            team: unit.team,
            x: unit.activeSkillEffectX,
            y: unit.activeSkillEffectY,
            radius: definition.radius,
            remainingMs: persistent.durationMs,
            expiresAtMs: this.elapsedMs + persistent.durationMs,
            nextTickAtMs: this.elapsedMs + persistent.tickIntervalMs,
            tickIntervalMs: persistent.tickIntervalMs,
            damagePerTick: persistent.damagePerTick,
            root: persistent.root,
            casterId: unit.id,
            nextFollowUpAtMs: definition.sustainedFollowUp
                ? this.elapsedMs + definition.sustainedFollowUp.initialDelayMs
                : Number.POSITIVE_INFINITY,
            followUpIntervalMs: definition.sustainedFollowUp?.intervalMs ?? 0,
            followUpDamage: definition.sustainedFollowUp?.damagePerShot ?? 0,
            affectsTowers: definition.targetMask.towers,
            towerDamageMultiplier: definition.towerDamageMultiplier,
        });
    }

    private updateActiveSkillZones(): void {
        for (let index = this.skillZones.length - 1; index >= 0; index -= 1) {
            const zone = this.skillZones[index];
            if (this.elapsedMs >= zone.expiresAtMs) {
                this.skillZones.splice(index, 1);
                continue;
            }
            zone.remainingMs = Math.max(0, zone.expiresAtMs - this.elapsedMs);
            const targets = this.units.filter((target) => (
                target.hp > 0
                && target.team !== zone.team
                && target.profile.movementType === 'ground'
                && Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius + target.profile.collisionRadius
            ));
            const towers = zone.affectsTowers
                ? this.towers.filter((tower) => (
                    tower.active
                    && tower.hp > 0
                    && tower.team !== zone.team
                    && Math.hypot(tower.x - zone.x, tower.y - zone.y) <= zone.radius + tower.collisionRadius
                ))
                : [];
            if (zone.root) {
                const rootRefreshMs = Math.max(TICK_MS * 3, 120);
                for (const target of targets) {
                    target.stunnedUntilMs = Math.max(target.stunnedUntilMs, this.elapsedMs + rootRefreshMs);
                    target.pendingAttack = null;
                }
                for (const tower of towers) {
                    tower.disabledUntilMs = Math.max(tower.disabledUntilMs, this.elapsedMs + rootRefreshMs);
                }
            }
            while (this.elapsedMs >= zone.nextTickAtMs && zone.nextTickAtMs < zone.expiresAtMs) {
                for (const target of targets) this.damageTarget(target, zone.damagePerTick, zone.team);
                const towerTickDamage = Math.round(zone.damagePerTick * zone.towerDamageMultiplier);
                if (towerTickDamage > 0) {
                    for (const tower of towers) this.damageTarget(tower, towerTickDamage, zone.team);
                }
                zone.nextTickAtMs += zone.tickIntervalMs;
            }
            while (
                zone.followUpIntervalMs > 0
                && zone.followUpDamage > 0
                && this.elapsedMs >= zone.nextFollowUpAtMs
                && zone.nextFollowUpAtMs < zone.expiresAtMs
            ) {
                const caster = this.units.find((unit) => unit.id === zone.casterId && unit.hp > 0);
                const target = caster
                    ? [...targets].sort((left, right) => (
                        Math.hypot(left.x - caster.x, left.y - caster.y)
                        - Math.hypot(right.x - caster.x, right.y - caster.y)
                        || left.id.localeCompare(right.id)
                    ))[0]
                    : undefined;
                if (target) this.damageTarget(target, zone.followUpDamage, zone.team);
                zone.nextFollowUpAtMs += zone.followUpIntervalMs;
            }
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

    private getActiveSkillEffectPoint(
        unit: BattleUnit,
        landing: { x: number; y: number },
        distance: number,
    ): { x: number; y: number } {
        const length = Math.hypot(unit.directionX, unit.directionY);
        const directionX = length > 0.001 ? unit.directionX / length : 0;
        const directionY = length > 0.001 ? unit.directionY / length : unit.team === 'blue' ? -1 : 1;
        return {
            x: clamp(landing.x + directionX * distance, MIN_X, MAX_X),
            y: clamp(landing.y + directionY * distance, MIN_Y, MAX_Y),
        };
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
                const impactX = target.x;
                const impactY = target.y;
                this.damageTarget(target, unit.profile.damage, unit.team);
                if (unit.profile.meleeSplashRadius > 0) {
                    for (const secondary of this.units) {
                        if (
                            secondary === target
                            || secondary === unit
                            || secondary.team === unit.team
                            || secondary.hp <= 0
                            || secondary.profile.movementType === 'air'
                        ) continue;
                        if (
                            Math.hypot(secondary.x - impactX, secondary.y - impactY)
                            > unit.profile.meleeSplashRadius + secondary.profile.collisionRadius
                        ) continue;
                        this.damageTarget(secondary, unit.profile.damage, unit.team);
                    }
                }
                unit.hitSerial += 1;
                unit.hitTick = this.tick;
            } else if (unit.profile.projectile) {
                this.launchProjectile(unit, target);
                if (unit.profile.recoilDistance > 0) this.applyRecoil(unit, target, unit.profile.recoilDistance);
            }
        }
    }

    private beginAttack(unit: BattleUnit, target: BattleTarget): void {
        unit.attackSerial += 1;
        unit.attackTick = this.tick;
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
                if (attacker) {
                    attacker.hitSerial += 1;
                    attacker.hitTick = this.tick;
                }
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
            if (!tower.active || tower.hp <= 0 || this.elapsedMs < tower.nextAttackAtMs || this.elapsedMs < tower.disabledUntilMs) continue;
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
        if (unit.ignoredTargetId && this.elapsedMs >= unit.ignoreTargetUntilMs) {
            unit.ignoredTargetId = null;
            unit.ignoreTargetUntilMs = 0;
        }
        const lockedCandidate = this.findTargetById(unit.targetId);
        const locked = lockedCandidate?.id === unit.ignoredTargetId ? null : lockedCandidate;
        if (this.elapsedMs < unit.acquisitionReadyAtMs) return locked && isAlive(locked) ? locked : this.findTowerFallback(unit);

        const makeView = (target: BattleTarget): SharedTargetView<BattleTarget> => ({
            source: target,
            stableId: target.id,
            x: target.x,
            y: target.y,
            team: target.team,
            alive: isAlive(target) && (isTower(target) || target.state !== 'spawning'),
            isTower: isTower(target),
            isKingTower: isTower(target) && target.type === 'king',
            towerActive: isTower(target) ? target.active : true,
            movementType: isTower(target) ? 'ground' : target.profile.movementType,
            lane: isTower(target) ? laneFromX(target.x) : target.lane,
            arenaSide: arenaSide(target.y),
            bridgeCorridor: bridgeLaneAt(target.x, target.y),
            routeDistance: this.estimateRouteDistance(unit, target),
        });

        return resolveSharedCombatTarget(
            makeView(unit),
            locked ? makeView(locked) : null,
            [...this.units, ...this.towers]
                .filter(candidate => candidate.id !== unit.ignoredTargetId)
                .map(makeView),
            {
                policy: unit.profile.targetPolicy,
                mask: {
                    units: unit.profile.canTargetUnits,
                    towers: unit.profile.canTargetTowers,
                    ground: unit.profile.canTargetGround,
                    air: unit.profile.canTargetAir,
                },
                sightRange: unit.profile.sightRange,
                crossLaneCloseRange: unit.profile.crossLaneCloseRange,
                sameLanePenalty: unit.profile.sameLanePenalty,
                bridgeCrossLaneAllowed: unit.profile.bridgeCrossLaneAllowed,
                bridgeEngagementRange: unit.profile.bridgeEngagementRange,
                centerX: 180,
                centerPullHalfWidth: unit.profile.centerPullHalfWidth,
                rearAggroRange: unit.profile.rearAggroRange,
                backtrackTolerance: unit.profile.backtrackTolerance,
                preserveCurrentTower: unit.towerTargetCommitted,
            },
        ).target;
    }

    private assignTarget(unit: BattleUnit, target: BattleTarget | null): void {
        const nextId = target?.id ?? null;
        if (unit.targetId === nextId) return;
        unit.targetId = nextId;
        unit.firstHitReadyAtMs = 0;
        unit.pendingAttack = null;
        unit.towerTargetCommitted = false;
        unit.progressCheckAtMs = this.elapsedMs + 650;
        unit.progressX = unit.x;
        unit.progressY = unit.y;
        unit.stalledChecks = 0;
        if (target && isTower(target) && target.type === 'princess') unit.lane = laneFromX(target.x);
    }

    private resetRouteProgress(unit: BattleUnit): void {
        unit.progressCheckAtMs = this.elapsedMs + 650;
        unit.progressX = unit.x;
        unit.progressY = unit.y;
        unit.stalledChecks = 0;
    }

    private updateRouteProgress(unit: BattleUnit, target: BattleTarget): void {
        if (this.elapsedMs < unit.progressCheckAtMs) return;
        const progressed = Math.hypot(unit.x - unit.progressX, unit.y - unit.progressY);
        unit.progressCheckAtMs = this.elapsedMs + 650;
        unit.progressX = unit.x;
        unit.progressY = unit.y;
        if (progressed >= 3.5 || unit.state !== 'moving') {
            unit.stalledChecks = 0;
            return;
        }

        unit.stalledChecks += 1;
        if (unit.stalledChecks < 4 || isTower(target)) return;
        unit.ignoredTargetId = target.id;
        unit.ignoreTargetUntilMs = this.elapsedMs + 900;
        unit.acquisitionReadyAtMs = this.elapsedMs + 120;
        this.assignTarget(unit, null);
        unit.state = 'moving';
    }

    private estimateRouteDistance(unit: BattleUnit, target: BattleTarget): number {
        const direct = Math.hypot(target.x - unit.x, target.y - unit.y);
        if (unit.profile.movementRoute !== 'ground-bridge') return direct;
        const actorSide = arenaSide(unit.y);
        const targetSide = arenaSide(target.y);
        if (actorSide === 0 || targetSide === 0 || actorSide === targetSide) return direct;

        const bridgeX = unit.lane === 'left' ? BRIDGE_X[0] : BRIDGE_X[1];
        const entryY = unit.team === 'blue' ? RIVER_BOTTOM + 18 : RIVER_TOP - 18;
        const exitY = unit.team === 'blue' ? RIVER_TOP - 24 : RIVER_BOTTOM + 24;
        return Math.hypot(bridgeX - unit.x, entryY - unit.y)
            + Math.abs(exitY - entryY)
            + Math.hypot(target.x - bridgeX, target.y - exitY);
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
        const nearTakeoff = unit.team === 'blue' ? unit.y <= RIVER_BOTTOM + 56 : unit.y >= RIVER_TOP - 56;
        if (!crossing || !nearTakeoff) return false;
        const landingY = unit.team === 'blue' ? RIVER_TOP - jump.landingOffset : RIVER_BOTTOM + jump.landingOffset;
        const landingX = clamp(unit.x + clamp((target.x - unit.x) * 0.18, -24, 24), MIN_X, MAX_X);
        const distance = Math.hypot(landingX - unit.x, landingY - unit.y);
        unit.state = 'jumping';
        unit.jumpSerial += 1;
        unit.jumpTick = this.tick;
        unit.jumpStartedAtMs = this.elapsedMs;
        unit.jumpEndsAtMs = this.elapsedMs + Math.max(560, (distance / jump.speed) * 1000);
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
            this.finish(attackingTeam, 'king_destroyed');
            return;
        }
        if (attackingTeam === 'blue') this.blueCrowns = Math.min(2, this.blueCrowns + 1);
        else this.redCrowns = Math.min(2, this.redCrowns + 1);
    }

    private removeDeadUnits(): void {
        let removedUnit = false;
        for (let index = this.units.length - 1; index >= 0; index -= 1) {
            if (this.units[index].hp > 0) continue;
            const deadId = this.units[index].id;
            this.units.splice(index, 1);
            removedUnit = true;
            for (const unit of this.units) {
                if (unit.targetId === deadId) this.assignTarget(unit, null);
                if (unit.pendingAttack?.targetId === deadId) unit.pendingAttack = null;
            }
            for (let projectileIndex = this.projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
                const projectile = this.projectiles[projectileIndex];
                if (projectile.targetId === deadId || projectile.attackerId === deadId) this.projectiles.splice(projectileIndex, 1);
            }
        }
        if (removedUnit) {
            for (const player of this.players.values()) this.refillAvailableHandSlots(player);
        }
    }

    private checkFinished(): void {
        if (this.state !== 'running' || this.elapsedMs < BATTLE_DURATION_MS) return;
        const blueHp = this.towers.filter((tower) => tower.team === 'blue').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
        const redHp = this.towers.filter((tower) => tower.team === 'red').reduce((sum, tower) => sum + Math.max(0, tower.hp), 0);
        this.finish(blueHp === redHp ? 'draw' : blueHp > redHp ? 'blue' : 'red', 'time_limit');
    }

    private forfeitDisconnectedPlayers(): void {
        const disconnected = [...this.players.values()]
            .filter((player) => !player.connected && player.disconnectedAtRealMs !== null);
        if (disconnected.length === 0) return;
        const timedOut = disconnected.filter((player) => this.now() - (player.disconnectedAtRealMs as number) >= DISCONNECT_GRACE_MS);
        if (timedOut.length === 0) return;
        const connected = [...this.players.values()].filter((player) => player.connected);
        if (connected.length === 0) {
            if (timedOut.length === disconnected.length) this.finish('draw', 'disconnect_timeout');
            return;
        }
        this.finish(oppositeTeam(timedOut[0].team), 'disconnect_timeout');
    }

    private isPausedForReconnect(): boolean {
        return [...this.players.values()].some((player) => !player.connected);
    }

    private getDisconnectGraceRemainingMs(): number | null {
        if (this.state !== 'running') return null;
        const disconnectedAt = [...this.players.values()]
            .filter((player) => !player.connected && player.disconnectedAtRealMs !== null)
            .map((player) => player.disconnectedAtRealMs as number);
        if (disconnectedAt.length === 0) return null;
        const relevantDisconnect = [...this.players.values()].some((player) => player.connected)
            ? Math.min(...disconnectedAt)
            : Math.max(...disconnectedAt);
        return Math.max(0, DISCONNECT_GRACE_MS - (this.now() - relevantDisconnect));
    }

    private finish(winner: BattleSnapshot['winner'], reason: BattleFinishReason): void {
        if (this.state === 'finished') return;
        this.winner = winner;
        this.finishReason = reason;
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
