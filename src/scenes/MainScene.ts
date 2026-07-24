import Phaser from 'phaser';
import { configureLogicalCamera, getPointerLogicalPosition } from '../core/Resolution';
import { CONSTANTS } from '../systems/Constants';
import GameMap from '../systems/GameMap';
import MapRenderer from '../systems/MapRenderer';
import EntityManager from '../systems/EntityManager';
import ElixirManager from '../systems/ElixirManager';
import BattleManager from '../systems/BattleManager';
import AIManager from '../systems/AIManager';
import EffectManager from '../systems/EffectManager';
import HUD from '../ui/HUD';
import Card from '../ui/Card';
import { playScreenIntro } from '../ui/GameSkin';
import { GAME_FONT, ko } from '../i18n/ko';
import { createDeck, UNIT_TYPES } from '../data/UnitData';
import { validateDuckxelBattleProfiles } from '../data/DuckxelBattleProfiles';
import { validateActiveSkillDefinitions } from '../data/ActiveSkillData';
import { runCombatInvariantChecks } from '../systems/combat/CombatInvariantChecks';
import { resolveUnitTexture } from '../ui/CardVisual';
import { dispatchChaosNavigation } from '../app/bridge';
import ClientSyncPipeline from '../systems/ClientSyncPipeline';
import { deriveStateDelta, EMPTY_STATE_DELTA } from '../systems/SimulationProtocol';
import { evaluateSpawnRule } from '../core/rules/SpawnRules';
import type {
    InputCmd,
    SimulationBaseState,
    NormalizedSnapshot,
    SnapshotStateDelta,
    SpawnUnitCmd,
    CastActiveSkillCmd,
} from '../systems/SimulationProtocol';
import type { InterpolationSample } from '../systems/ClientSyncPipeline';
import BattleSocketClient from '../multiplayer/BattleSocketClient';
import type { RemoteBattleSnapshot } from '../multiplayer/BattleSocketClient';
import type { BattleLaunchContext } from '../app/types';
import { getBattleAccessToken } from '../app/authRepository';
import RemoteProjectileVisual from '../entities/RemoteProjectileVisual';
import Unit, { UnitState } from '../entities/Unit';
import ActiveSkillButton from '../ui/ActiveSkillButton';
import BattleViewTransform from '../multiplayer/BattleViewTransform';
import RemoteBattleTimeline from '../multiplayer/RemoteBattleTimeline';

type BattleWinner = 'blue' | 'red' | 'draw';

interface DebugUnitState {
    id: string;
    unitKey: string;
    team: 'blue' | 'red';
    role: string;
    attackType: string;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    state: number;
    velocityX: number;
    velocityY: number;
    targetId: string | null;
    targetUnitKey: string | null;
    targetIsTower: boolean;
}

interface DebugTowerState {
    id: string;
    team: 'blue' | 'red';
    king: boolean;
    active: boolean;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    state: number;
}

interface DebugSnapshot {
    coordinateSystem: {
        origin: string;
        xAxis: string;
        yAxis: string;
    };
    battle: {
        timeRemainingSec: number;
        blueCrowns: number;
        redCrowns: number;
        overtime: boolean;
        doubleElixir: boolean;
        gameOver: boolean;
    };
    resources: {
        blueElixir: number;
        redElixir: number;
    };
    simulation: {
        tickRateHz: number;
        fixedDeltaMs: number;
        currentTick: number;
        serverTimeMs: number;
        accumulatorMs: number;
    };
    protocol: {
        lastSeq: number;
        ackSeq: number;
        pendingInputCount: number;
        prediction: {
            reservedBlueElixir: number;
            acceptedCount: number;
            rejectedCount: number;
        };
        interpolation: {
            available: boolean;
            delayTicks: number;
            targetTick: number;
            alpha: number;
            fromTick: number | null;
            toTick: number | null;
            bufferSize: number;
        };
        network: {
            timelineEnabled: boolean;
            renderDelayMs: number;
            bufferedSnapshots: number;
            droppedSnapshots: number;
            latestTick: number;
            rttMs: number;
            jitterMs: number;
            snapshotAgeMs: number;
            snapshotBytes: number;
            parseMs: number;
            staleSnapshots: number;
        };
        reconciliation: {
            mode: 'none' | 'snap' | 'smooth';
            pendingLocalInputs: number;
            correctionCount: number;
            snapCorrectionCount: number;
            smoothCorrectionCount: number;
            lastCorrectionTick: number;
            lastErrorMagnitude: number;
            tuning: {
                softMagnitude: number;
                hardMagnitude: number;
                smoothTicks: number;
            };
        };
        recentCommands: DebugCommandLog[];
        normalizedSnapshot: NormalizedSnapshot;
    };
    interpolated: {
        unitCount: number;
        towerHpTotal: number;
        blueElixir: number;
        redElixir: number;
        blueCrowns: number;
        redCrowns: number;
    } | null;
    units: DebugUnitState[];
    towers: DebugTowerState[];
    hand: Array<{ unitKey: string; cost: number; affordable: boolean }>;
}

interface DebugCommandLog {
    seq: number;
    tick: number;
    action: InputCmd['action'];
    accepted: boolean;
}

type QueueableInputCmd =
    | {
        tick: number;
        action: 'spawn_unit';
        payload: Extract<InputCmd, { action: 'spawn_unit' }>['payload'];
    }
    | {
        tick: number;
        action: 'set_blue_elixir';
        payload: Extract<InputCmd, { action: 'set_blue_elixir' }>['payload'];
    }
    | {
        tick: number;
        action: 'cast_active_skill';
        payload: Extract<InputCmd, { action: 'cast_active_skill' }>['payload'];
    };

/**
 * Main game scene integrating all systems.
 */
export default class MainScene extends Phaser.Scene {
    private gameMap!: GameMap;
    private mapRenderer!: MapRenderer;
    private entityManager!: EntityManager;
    private elixirManager!: ElixirManager;
    private battleManager!: BattleManager;
    private aiManager!: AIManager;
    private effectManager!: EffectManager;
    private hud!: HUD;
    private activeSkillButton!: ActiveSkillButton;

    private hand: Card[] = [];
    private deck: string[] = [];
    private deckIndex: number = 0;
    private spawnHighlight: Phaser.GameObjects.Rectangle | null = null;
    private placementGhost: Phaser.GameObjects.Container | null = null;
    private handTray: Phaser.GameObjects.Container | null = null;
    private nextCardPreviews: Phaser.GameObjects.Container[] = [];
    private forfeitDialog: Phaser.GameObjects.Container | null = null;
    private lastElixir: number = -1;
    private pendingHandIndices: Set<number> = new Set();
    private suspendedHandIndices: Set<number> = new Set();

    private readonly simulationTickRate: number = CONSTANTS.GAMEPLAY.SIM_TICK_RATE;
    private readonly simulationDeltaMs: number = 1000 / CONSTANTS.GAMEPLAY.SIM_TICK_RATE;
    private simulationAccumulatorMs: number = 0;
    private simulationTick: number = 0;
    private simulationServerTimeMs: number = 0;

    private inputSeq: number = 0;
    private lastAckSeq: number = 0;
    private inputQueue: InputCmd[] = [];
    private commandHistory: DebugCommandLog[] = [];
    private previousBaseState: SimulationBaseState | null = null;
    private lastStateDelta: SnapshotStateDelta = { ...EMPTY_STATE_DELTA };
    private reservedBlueElixir: number = 0;
    private predictedCostBySeq: Map<number, number> = new Map();
    private predictionAcceptedCount: number = 0;
    private predictionRejectedCount: number = 0;
    private clientSync: ClientSyncPipeline = new ClientSyncPipeline({
        interpolationDelayTicks: CONSTANTS.GAMEPLAY.INTERPOLATION_DELAY_TICKS,
        maxSnapshots: CONSTANTS.GAMEPLAY.MAX_SNAPSHOT_BUFFER,
        tuning: {
            softMagnitude: CONSTANTS.GAMEPLAY.RECON_SOFT_MAGNITUDE,
            hardMagnitude: CONSTANTS.GAMEPLAY.RECON_HARD_MAGNITUDE,
            smoothTicks: CONSTANTS.GAMEPLAY.RECON_SMOOTH_TICKS,
        },
    });
    private interpolationSample: InterpolationSample = {
        available: false,
        targetTick: 0,
        alpha: 0,
        fromTick: null,
        toTick: null,
        state: null,
    };
    private battleSocket: BattleSocketClient | null = null;
    private remoteAuthoritative = false;
    private friendlyRemoteMode = false;
    private applyingRemoteSnapshot = false;
    private remotePendingHandBySeq = new Map<number, number>();
    private remoteCommandActionBySeq = new Map<number, InputCmd['action']>();
    private remoteNextUnitKey: string | null = null;
    private remoteResultDispatched = false;
    private remoteProjectileVisuals = new Map<string, RemoteProjectileVisual>();
    private remoteSkillZoneVisuals = new Map<string, Phaser.GameObjects.Image>();
    private remotePendingSpawnVisuals = new Map<number, Phaser.GameObjects.Container>();
    private remoteConnectionLabel: Phaser.GameObjects.Text | null = null;
    private remoteConnectionState: 'connecting' | 'connected' | 'reconnecting' | 'closed' = 'closed';
    private remoteViewTransform: BattleViewTransform | null = null;
    private remoteBattleContext: BattleLaunchContext | null = null;
    private readonly remoteTimeline = new RemoteBattleTimeline({ renderDelayMs: 120, maxSnapshots: 90 });
    private readonly remoteTimelineEnabled = import.meta.env.VITE_REMOTE_TIMELINE_ENABLED !== 'false';
    private remoteSceneInitialized = false;

    constructor() {
        super({ key: 'main-scene' });
    }

    private finishBattle(winner: BattleWinner, redCrowns = this.battleManager.getRedCrowns()) {
        const result = {
            winner,
            blueCrowns: this.battleManager.getBlueCrowns(),
            redCrowns,
            playerName: ko.lobby.playerName,
            opponentName: winner === 'red' ? ko.result.scourgeWarlord : ko.result.sentinelGuard,
            arenaName: ko.lobby.arenaName,
        };

        if (window.chaosApp) {
            window.chaosLastBattleResult = result;
            this.scene.stop('main-scene');
            dispatchChaosNavigation({ result });
            return;
        }

        this.scene.start('game-over', {
            winner,
            blueCrowns: result.blueCrowns,
            redCrowns: result.redCrowns,
        });
    }

    create() {
        // A stopped Phaser scene is reused on the next battle. Remove listeners
        // owned by the previous battle before constructing new systems.
        this.battleManager?.destroy();
        this.entityManager?.destroy();

        const profileErrors = validateDuckxelBattleProfiles();
        if (profileErrors.length > 0) {
            throw new Error(`Invalid Duck.xel battle profiles:\n${profileErrors.join('\n')}`);
        }
        const activeSkillErrors = validateActiveSkillDefinitions();
        if (activeSkillErrors.length > 0) {
            throw new Error(`Invalid active skill definitions:\n${activeSkillErrors.join('\n')}`);
        }
        const combatInvariantErrors = runCombatInvariantChecks();
        if (combatInvariantErrors.length > 0) {
            throw new Error(`Combat invariant check failed:\n${combatInvariantErrors.join('\n')}`);
        }
        configureLogicalCamera(this);
        playScreenIntro(this);
        this.resetUiState();

        // Systems
        this.gameMap = new GameMap();
        this.mapRenderer = new MapRenderer(this, this.gameMap);
        this.mapRenderer.render();

        this.entityManager = new EntityManager(this, this.gameMap);
        this.entityManager.spawnAllTowers();
        this.effectManager = new EffectManager(this);

        this.elixirManager = new ElixirManager(this);
        this.battleManager = new BattleManager(this, this.entityManager);
        this.hud = new HUD(this, this.battleManager);
        this.activeSkillButton = new ActiveSkillButton(this, this.entityManager, unit => this.requestActiveSkill(unit));
        this.createForfeitButton();

        // AI uses same scene and entity manager
        this.aiManager = new AIManager(this, this.entityManager);

        // Battle callbacks
        this.battleManager.setCallbacks(
            () => {
                // Double elixir phase - elixir manager handles it.
                this.elixirManager.setDoubleElixir(true);
            },
            (winner) => {
                // Game end
                if (!this.friendlyRemoteMode || !this.applyingRemoteSnapshot) {
                    this.finishBattle(winner);
                }
            }
        );

        // Deck & hand
        const sceneData = this.scene.settings.data as { deck?: string[]; context?: BattleLaunchContext } | undefined;
        this.deck = sceneData?.deck && sceneData.deck.length > 0
            ? [...sceneData.deck]
            : createDeck();
        Phaser.Utils.Array.Shuffle(this.deck);
        this.deckIndex = 0;
        this.createHand();
        this.connectFriendlyBattle(sceneData?.context);
        const onExternalForfeit = () => this.requestForfeit();
        window.addEventListener('chaos:battle-forfeit', onExternalForfeit);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.battleManager?.destroy();
            this.entityManager?.destroy();
            this.battleSocket?.close();
            this.battleSocket = null;
            this.remoteAuthoritative = false;
            this.friendlyRemoteMode = false;
            this.remoteBattleContext = null;
            this.remoteViewTransform = null;
            this.remoteTimeline.reset();
            this.remoteSceneInitialized = false;
            this.clearRemoteProjectileVisuals();
            this.clearRemoteSkillZoneVisuals();
            this.clearRemotePendingSpawnVisuals();
            this.remoteConnectionLabel?.destroy();
            this.remoteConnectionLabel = null;
            this.activeSkillButton?.destroy();
            window.removeEventListener('chaos:battle-forfeit', onExternalForfeit);
        });

        // Spawn highlight
        this.spawnHighlight = this.add.rectangle(0, 0, CONSTANTS.SCREEN_WIDTH,
            CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX - CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN,
            0x6cd4ff, 0.14
        );
        this.spawnHighlight.setPosition(
            CONSTANTS.SCREEN_WIDTH / 2,
            (CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN + CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX) / 2
        );
        this.spawnHighlight.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        this.spawnHighlight.setStrokeStyle(2, 0xbbe9ff, 0.45);
        this.spawnHighlight.setVisible(false);

        // Drag events
        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Card) => {
            if (!(gameObject instanceof Card)) return;
            this.hand.forEach(card => {
                if (card === gameObject) {
                    this.tweens.add({
                        targets: card,
                        scaleX: 0.95,
                        scaleY: 0.95,
                        duration: 150,
                        ease: 'Back.easeOut'
                    });
                    card.setDepth(CONSTANTS.DEPTH.DRAG_CARD);
                    card.setAlpha(0.82);
                } else {
                    card.setAlpha(0.6);
                }
            });
            if (this.spawnHighlight) {
                this.spawnHighlight.setVisible(true);
                this.spawnHighlight.setFillStyle(0x6cd4ff, 0.14);
                this.spawnHighlight.setStrokeStyle(2, 0xbbe9ff, 0.45);
            }
            this.showPlacementGhost(gameObject.x, gameObject.y, this.canSpendBlueElixirPredicted(gameObject.cost), gameObject.unitKey);
        });

        this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Card) => {
            if (!(gameObject instanceof Card)) return;
            const p = getPointerLogicalPosition(pointer);
            gameObject.x = p.x;
            gameObject.y = p.y;
            this.updatePlacementFeedback(gameObject, p.x, p.y);
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Card) => {
            if (!(gameObject instanceof Card)) return;
            if (this.spawnHighlight) this.spawnHighlight.setVisible(false);
            this.clearPlacementGhost();

            this.hand.forEach(card => {
                this.tweens.add({
                    targets: card,
                    scaleX: 0.78,
                    scaleY: 0.78,
                    alpha: 1,
                    duration: 150,
                    ease: 'Sine.easeOut'
                });
                card.setDepth(CONSTANTS.DEPTH.CARD);
            });

            const handIndex = this.hand.indexOf(gameObject);
            if (handIndex < 0 || this.pendingHandIndices.has(handIndex)) {
                gameObject.resetPosition();
                return;
            }

            const payload: Extract<InputCmd, { action: 'spawn_unit' }>['payload'] = {
                team: 'blue',
                unitKey: gameObject.unitKey,
                x: gameObject.x,
                y: gameObject.y,
                source: 'player_hand',
                handIndex,
                expectedCost: gameObject.cost,
            };

            const rule = evaluateSpawnRule({
                payload,
                isGameOver: this.battleManager.isGameOver(),
                handUnitKey: gameObject.unitKey,
                canSpawnBlue: (x: number, y: number) => this.gameMap.isValidSpawnArea(x, y, 'blue'),
                canSpendBlueElixir: (cost: number) => this.canSpendBlueElixirPredicted(cost),
            });
            if (!rule.accepted) {
                this.effectManager.playInvalidPlacement(gameObject.x, gameObject.y);
                this.effectManager.playUiText(
                    gameObject.x,
                    Math.max(72, gameObject.y - 28),
                    this.rejectReasonLabel(rule.reason),
                    rule.reason === 'insufficient_elixir' ? '#ffd66b' : '#ffb4c4'
                );
                gameObject.resetPosition();
                return;
            }

            this.pendingHandIndices.add(handIndex);
            const enqueued = this.enqueueInputCommand({
                tick: this.simulationTick + CONSTANTS.GAMEPLAY.INPUT_DELAY_TICKS,
                action: 'spawn_unit',
                payload: {
                    ...payload,
                    x: rule.spawnX,
                    y: rule.spawnY,
                    expectedCost: rule.cost,
                },
            });
            this.reservePredictedCost(enqueued);
            this.effectManager.playPlacementPulse(rule.spawnX, rule.spawnY, 'blue');
            this.refreshHandAffordability();
            gameObject.resetPosition();
        });

        this.seedSnapshotBaseline();
    }

    private showPlacementGhost(x: number, y: number, valid: boolean, unitKey: string) {
        this.clearPlacementGhost();
        this.clearRemoteProjectileVisuals();
        const color = valid ? 0x76c8ff : 0xff6f87;
        const ghost = this.add.container(x, y);
        ghost.setDepth(CONSTANTS.DEPTH.OVERLAY + 4);

        const outer = this.add.circle(0, 0, 28, color, valid ? 0.12 : 0.18);
        outer.setStrokeStyle(2.5, valid ? 0xd8f6ff : 0xffb3c0, valid ? 0.68 : 0.9);
        outer.setBlendMode(Phaser.BlendModes.ADD);
        outer.setName('outer');

        const inner = this.add.circle(0, 0, 7, color, valid ? 0.22 : 0.28);
        inner.setStrokeStyle(1, 0xffffff, 0.42);
        inner.setBlendMode(Phaser.BlendModes.ADD);
        inner.setName('inner');

        const lineA = this.add.rectangle(0, 0, 42, 2, valid ? 0xd8f6ff : 0xffb3c0, 0.55);
        const lineB = this.add.rectangle(0, 0, 2, 42, valid ? 0xd8f6ff : 0xffb3c0, 0.55);
        lineA.setBlendMode(Phaser.BlendModes.ADD);
        lineB.setBlendMode(Phaser.BlendModes.ADD);
        lineA.setName('lineA');
        lineB.setName('lineB');

        const unitShadow = this.add.ellipse(0, 11, 34, 11, 0x000000, valid ? 0.34 : 0.25);
        unitShadow.setName('unitShadow');

        const unitPreview = this.add.image(0, -11, this.resolvePlacementGhostTexture(unitKey));
        const previewSize = this.getPlacementGhostSize(unitKey);
        unitPreview.setDisplaySize(previewSize, previewSize);
        unitPreview.setAlpha(valid ? 0.74 : 0.46);
        if (valid) {
            unitPreview.clearTint();
        } else {
            unitPreview.setTint(0xff91a4);
        }
        unitPreview.setName('unitPreview');

        ghost.add([outer, inner, lineA, lineB, unitShadow, unitPreview]);
        this.placementGhost = ghost;

        this.tweens.add({
            targets: outer,
            scaleX: 1.1,
            scaleY: 1.1,
            alpha: valid ? 0.18 : 0.28,
            duration: 440,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private updatePlacementFeedback(card: Card, x: number, y: number) {
        const inZone = this.gameMap.isValidSpawnArea(x, y, 'blue');
        const enoughElixir = this.canSpendBlueElixirPredicted(card.cost);
        const valid = inZone && enoughElixir;
        const color = valid ? 0x76c8ff : enoughElixir ? 0xff6f87 : 0xffd66b;
        const edge = valid ? 0xd8f6ff : enoughElixir ? 0xffb3c0 : 0xffef9a;

        if (this.placementGhost) {
            this.placementGhost.setPosition(
                Phaser.Math.Clamp(x, 20, CONSTANTS.SCREEN_WIDTH - 20),
                Phaser.Math.Clamp(y, CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN + 8, CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX - 8)
            );
            const outer = this.placementGhost.getByName('outer') as Phaser.GameObjects.Arc | undefined;
            const inner = this.placementGhost.getByName('inner') as Phaser.GameObjects.Arc | undefined;
            const lineA = this.placementGhost.getByName('lineA') as Phaser.GameObjects.Rectangle | undefined;
            const lineB = this.placementGhost.getByName('lineB') as Phaser.GameObjects.Rectangle | undefined;
            const unitPreview = this.placementGhost.getByName('unitPreview') as Phaser.GameObjects.Image | undefined;
            const unitShadow = this.placementGhost.getByName('unitShadow') as Phaser.GameObjects.Ellipse | undefined;
            outer?.setFillStyle(color, valid ? 0.12 : 0.2);
            outer?.setStrokeStyle(2.5, edge, valid ? 0.68 : 0.92);
            inner?.setFillStyle(color, valid ? 0.22 : 0.28);
            lineA?.setFillStyle(edge, 0.58);
            lineB?.setFillStyle(edge, 0.58);
            unitShadow?.setFillStyle(0x000000, valid ? 0.34 : 0.25);
            if (unitPreview) {
                unitPreview.setAlpha(valid ? 0.74 : 0.46);
                if (valid) {
                    unitPreview.clearTint();
                } else {
                    unitPreview.setTint(0xff91a4);
                }
            }
        } else {
            this.showPlacementGhost(x, y, valid, card.unitKey);
        }

        if (this.spawnHighlight) {
            this.spawnHighlight.setFillStyle(valid ? 0x6cd4ff : enoughElixir ? 0xff4f6e : 0xffd66b, valid ? 0.14 : 0.1);
            this.spawnHighlight.setStrokeStyle(2, valid ? 0xbbe9ff : enoughElixir ? 0xff8ba1 : 0xffe09a, valid ? 0.45 : 0.7);
        }
    }

    private clearPlacementGhost() {
        if (!this.placementGhost) return;
        this.placementGhost.destroy();
        this.placementGhost = null;
    }

    private resolvePlacementGhostTexture(unitKey: string) {
        const data = UNIT_TYPES[unitKey];
        const spriteKey = data?.spriteKey ?? unitKey;
        const duckxelPrefixes = [
            `unit_${spriteKey}_south-east_0`,
            `unit_${unitKey}_south-east_0`,
        ];
        for (const key of duckxelPrefixes) {
            if (this.textures.exists(key)) return key;
        }

        const blueUnitKey = `unit_${spriteKey}_blue`;
        if (this.textures.exists(blueUnitKey)) return blueUnitKey;

        return resolveUnitTexture(this, unitKey);
    }

    private getPlacementGhostSize(unitKey: string) {
        if (unitKey === 'royal_giant') return 76;
        if (unitKey === 'hog_rider') return 66;
        if (unitKey === 'skeleton_swordsman') return 30;
        if (unitKey === 'spear_goblin') return 42;
        if (unitKey.startsWith('duckxel_')) return 58;
        const data = UNIT_TYPES[unitKey];
        return data?.attackType === 'splash' ? 42 : 38;
    }

    private rejectReasonLabel(reason?: string) {
        if (reason === 'insufficient_elixir' || reason === 'not_enough_elixir') return '엘릭서가 부족합니다';
        if (reason === 'invalid_spawn_zone' || reason === 'invalid_spawn_position') return '아군 진영에 배치하세요';
        if (reason === 'match_paused') return '상대 재접속을 기다리는 중입니다';
        if (reason === 'socket_not_connected') return '서버 연결을 확인하세요';
        if (reason === 'game_over') return ko.battle.ended;
        return '배치할 수 없습니다';
    }

    private resetUiState() {
        this.input.off('dragstart');
        this.input.off('drag');
        this.input.off('dragend');

        this.hand.forEach(card => card.destroy());
        this.hand = [];

        this.nextCardPreviews.forEach(preview => preview.destroy());
        this.nextCardPreviews = [];

        if (this.spawnHighlight) {
            this.spawnHighlight.destroy();
            this.spawnHighlight = null;
        }
        this.clearPlacementGhost();
        if (this.handTray) {
            this.handTray.destroy();
            this.handTray = null;
        }

        this.lastElixir = -1;
        this.deck = [];
        this.deckIndex = 0;
        this.pendingHandIndices.clear();
        this.suspendedHandIndices.clear();
        this.resetSimulationState();
    }

    private createHand() {
        const cardSpacing = 67;
        const startX = 88;
        const cardY = CONSTANTS.SCREEN_HEIGHT - 70;

        this.createHandTray();

        for (let i = 0; i < CONSTANTS.GAMEPLAY.HAND_SIZE; i++) {
            const unitKey = this.deck[this.deckIndex++ % this.deck.length];
            const card = new Card(this, startX + i * cardSpacing, cardY, unitKey);
            card.setScale(0.78);
            this.hand.push(card);
        }

        this.createNextCardPreviews();
    }

    private createHandTray() {
        this.handTray?.destroy();
        const tray = this.add.container(CONSTANTS.SCREEN_WIDTH / 2, CONSTANTS.SCREEN_HEIGHT - 62);
        tray.setDepth(CONSTANTS.DEPTH.HUD + 2);

        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.52);
        shadow.fillRoundedRect(-176, -55, 352, 108, 16);
        tray.add(shadow);

        const base = this.add.graphics();
        base.fillGradientStyle(0x26314b, 0x26314b, 0x0e1628, 0x060a12, 0.98);
        base.fillRoundedRect(-172, -60, 344, 106, 16);
        base.lineStyle(2.5, 0x7287bb, 0.86);
        base.strokeRoundedRect(-172, -60, 344, 106, 16);
        base.lineStyle(1, 0xdce7ff, 0.16);
        base.strokeRoundedRect(-162, -51, 324, 88, 12);
        base.fillStyle(0xffffff, 0.085);
        base.fillRoundedRect(-154, -50, 308, 7, 4);
        base.fillStyle(0x7b2aa4, 0.08);
        base.fillRoundedRect(-158, -38, 316, 25, 10);
        tray.add(base);

        const cardRail = this.add.graphics();
        cardRail.fillStyle(0x030711, 0.46);
        cardRail.fillRoundedRect(-132, -12, 292, 61, 10);
        cardRail.lineStyle(1.5, 0x4c5e89, 0.72);
        cardRail.strokeRoundedRect(-132, -12, 292, 61, 10);
        cardRail.fillStyle(0xffffff, 0.035);
        cardRail.fillRoundedRect(-124, -6, 276, 5, 3);
        tray.add(cardRail);

        this.handTray = tray;
    }

    private createNextCardPreviews() {
        this.nextCardPreviews.forEach(c => c.destroy());
        this.nextCardPreviews = [];

        const nextKey = this.remoteAuthoritative
            ? this.remoteNextUnitKey
            : this.peekNextAvailableCardFromDeck();

        const previewX = 30;
        const previewY = CONSTANTS.SCREEN_HEIGHT - 66;

        const slot = this.createNextSlot(previewX, previewY);
        this.nextCardPreviews.push(slot);

        const preview = nextKey
            ? Card.createMiniCard(this, previewX, previewY, nextKey)
            : this.add.container(previewX, previewY).setVisible(false);
        if (nextKey) preview.setScale(0.78);
        this.nextCardPreviews.push(preview);

        const labelBg = this.add.graphics();
        labelBg.fillStyle(0x050912, 0.9);
        labelBg.fillRoundedRect(previewX - 19, previewY + 24, 38, 13, 5);
        labelBg.lineStyle(1, 0x6e82b4, 0.55);
        labelBg.strokeRoundedRect(previewX - 19, previewY + 24, 38, 13, 5);
        labelBg.setDepth(CONSTANTS.DEPTH.CARD + 1);
        this.nextCardPreviews.push(labelBg as unknown as Phaser.GameObjects.Container);

        const label = this.add.text(previewX, previewY + 30, ko.common.next, {
            fontSize: '7px',
            fontFamily: GAME_FONT,
            fontStyle: '900',
            color: '#dce7ff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);
        label.setDepth(CONSTANTS.DEPTH.CARD + 2);
        label.setResolution(2);
        this.nextCardPreviews.push(label as unknown as Phaser.GameObjects.Container);
    }

    private updateNextCardPreviews() {
        if (this.nextCardPreviews.length === 0) return;

        const nextKey = this.remoteAuthoritative
            ? this.remoteNextUnitKey
            : this.peekNextAvailableCardFromDeck();
        const previewX = 30;
        const previewY = CONSTANTS.SCREEN_HEIGHT - 66;

        const oldPreview = this.nextCardPreviews[1];
        if (oldPreview) {
            oldPreview.destroy();
            const newPreview = nextKey
                ? Card.createMiniCard(this, previewX, previewY, nextKey)
                : this.add.container(previewX, previewY).setVisible(false);
            if (nextKey) newPreview.setScale(0.78);
            this.nextCardPreviews[1] = newPreview;
        }
    }

    private createNextSlot(x: number, y: number) {
        const slot = this.add.container(x, y);
        slot.setDepth(CONSTANTS.DEPTH.CARD - 1);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.34);
        bg.fillRoundedRect(-27, -32, 54, 72, 10);
        bg.fillGradientStyle(0x121a2d, 0x121a2d, 0x070c17, 0x050912, 0.96);
        bg.fillRoundedRect(-25, -35, 50, 72, 9);
        bg.lineStyle(1.5, 0x6e82b4, 0.78);
        bg.strokeRoundedRect(-25, -35, 50, 72, 9);
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRoundedRect(-18, -28, 36, 5, 3);
        bg.lineStyle(1, 0xb8c4ff, 0.18);
        bg.strokeRoundedRect(-19, -27, 38, 52, 7);
        slot.add(bg);

        return slot;
    }

    private getNextAvailableCardFromDeck(additionallyLockedUnitKey?: string): string | null {
        const locked = this.getLockedActiveSkillUnitKeys();
        if (additionallyLockedUnitKey && UNIT_TYPES[additionallyLockedUnitKey]?.activeSkill) {
            locked.add(additionallyLockedUnitKey);
        }
        for (let attempt = 0; attempt < this.deck.length; attempt += 1) {
            const key = this.deck[this.deckIndex % this.deck.length];
            this.deckIndex += 1;
            if (!locked.has(key)) return key;
        }
        return null;
    }

    private peekNextAvailableCardFromDeck(additionallyLockedUnitKey?: string): string | null {
        const locked = this.getLockedActiveSkillUnitKeys();
        if (additionallyLockedUnitKey && UNIT_TYPES[additionallyLockedUnitKey]?.activeSkill) {
            locked.add(additionallyLockedUnitKey);
        }
        for (let attempt = 0; attempt < this.deck.length; attempt += 1) {
            const key = this.deck[(this.deckIndex + attempt) % this.deck.length];
            if (!locked.has(key)) return key;
        }
        return null;
    }

    private getLockedActiveSkillUnitKeys(): Set<string> {
        return new Set(
            this.entityManager.getActiveSkillUnits('blue')
                .filter(unit => unit.active && unit.state !== UnitState.DIE)
                .map(unit => unit.unitKey),
        );
    }

    private resetSimulationState() {
        this.simulationAccumulatorMs = 0;
        this.simulationTick = 0;
        this.simulationServerTimeMs = 0;

        this.inputSeq = 0;
        this.lastAckSeq = 0;
        this.inputQueue = [];
        this.commandHistory = [];
        this.previousBaseState = null;
        this.lastStateDelta = { ...EMPTY_STATE_DELTA };
        this.reservedBlueElixir = 0;
        this.predictedCostBySeq.clear();
        this.predictionAcceptedCount = 0;
        this.predictionRejectedCount = 0;
        this.remotePendingHandBySeq.clear();
        this.remoteCommandActionBySeq.clear();
        this.remoteNextUnitKey = null;
        this.remoteResultDispatched = false;
        this.clientSync.reset();
        this.interpolationSample = {
            available: false,
            targetTick: 0,
            alpha: 0,
            fromTick: null,
            toTick: null,
            state: null,
        };
    }

    private seedSnapshotBaseline() {
        this.previousBaseState = this.captureBaseState();
        this.lastStateDelta = { ...EMPTY_STATE_DELTA };
        if (!this.previousBaseState) return;

        this.clientSync.ingestSnapshot(
            {
                tick: this.simulationTick,
                ackSeq: this.lastAckSeq,
                state: this.previousBaseState,
            },
            this.getPredictedStateView(this.previousBaseState)
        );
        this.interpolationSample = this.clientSync.sample(this.simulationTick);
    }

    private captureBaseState(): SimulationBaseState {
        const towerHpTotal = this.entityManager.getTowers()
            .filter(tower => tower.active)
            .reduce((sum, tower) => sum + Math.max(0, Math.round(tower.stats.hp)), 0);

        return {
            unitCount: this.entityManager.getUnits().filter(unit => unit.active && !unit.isTower).length,
            towerHpTotal,
            blueElixir: this.elixirManager.getElixir(),
            redElixir: this.aiManager.getElixir(),
            blueCrowns: this.battleManager.getBlueCrowns(),
            redCrowns: this.battleManager.getRedCrowns(),
        };
    }

    private refreshHandAffordability() {
        const currentElixir = Math.floor(this.getPredictedBlueElixir());
        if (currentElixir === this.lastElixir) return;

        this.lastElixir = currentElixir;
        for (const card of this.hand) {
            card.setAffordable(this.canSpendBlueElixirPredicted(card.cost));
        }
    }

    private getPredictedBlueElixir(): number {
        return Math.max(0, this.elixirManager.getElixir() - this.reservedBlueElixir);
    }

    private getPredictedStateView(authoritative: SimulationBaseState): SimulationBaseState {
        return {
            ...authoritative,
            blueElixir: this.getPredictedBlueElixir(),
        };
    }

    private canSpendBlueElixirPredicted(cost: number): boolean {
        return this.getPredictedBlueElixir() >= cost;
    }

    private reservePredictedCost(command: InputCmd) {
        if (command.action !== 'spawn_unit') return;
        if (command.payload.source !== 'player_hand') return;

        const expectedCost = command.payload.expectedCost;
        if (typeof expectedCost !== 'number' || expectedCost <= 0) return;

        this.predictedCostBySeq.set(command.seq, expectedCost);
        this.reservedBlueElixir = Math.min(
            CONSTANTS.GAMEPLAY.MAX_ELIXIR,
            this.reservedBlueElixir + expectedCost
        );
    }

    private reconcilePredictedCost(command: InputCmd, accepted: boolean) {
        if (command.action !== 'spawn_unit') return;
        if (command.payload.source !== 'player_hand') return;

        const reserved = this.predictedCostBySeq.get(command.seq);
        this.predictedCostBySeq.delete(command.seq);
        if (typeof reserved === 'number' && reserved > 0) {
            this.reservedBlueElixir = Math.max(0, this.reservedBlueElixir - reserved);
        }

        if (accepted) {
            this.predictionAcceptedCount += 1;
        } else {
            this.predictionRejectedCount += 1;
        }
    }

    private cycleHandCard(card: Card) {
        const playedUnitKey = card.unitKey;
        const handIndex = this.hand.indexOf(card);
        this.tweens.add({
            targets: card,
            y: card.originalY + 20,
            alpha: 0,
            scaleX: 0.58,
            scaleY: 0.58,
            duration: 120,
            ease: 'Sine.easeIn',
            onComplete: () => {
                const nextKey = this.getNextAvailableCardFromDeck(playedUnitKey);
                if (!nextKey) {
                    if (handIndex >= 0) this.suspendedHandIndices.add(handIndex);
                    card.setUnavailable(true);
                    this.updateNextCardPreviews();
                    return;
                }
                card.setUnitKey(nextKey);
                card.setUnavailable(false);
                if (handIndex >= 0) this.suspendedHandIndices.delete(handIndex);
                this.updateNextCardPreviews();

                card.x = card.originalX;
                card.y = CONSTANTS.SCREEN_HEIGHT + 100;
                card.setScale(0.72);
                card.setDepth(CONSTANTS.DEPTH.CARD);
                this.playCardDrawFlash(card.originalX, card.originalY);

                this.tweens.add({
                    targets: card,
                    y: card.originalY,
                    alpha: 1,
                    scaleX: 0.78,
                    scaleY: 0.78,
                    duration: 360,
                    ease: 'Back.easeOut'
                });
            }
        });
    }

    private refillSuspendedHandSlots() {
        if (this.remoteAuthoritative || this.suspendedHandIndices.size === 0) return;

        for (const handIndex of [...this.suspendedHandIndices]) {
            const card = this.hand[handIndex];
            const nextKey = this.getNextAvailableCardFromDeck();
            if (!card || !nextKey) continue;

            card.setUnitKey(nextKey);
            card.setUnavailable(false);
            card.setPosition(card.originalX, card.originalY);
            card.setScale(0.78);
            card.setAlpha(1);
            card.setDepth(CONSTANTS.DEPTH.CARD);
            this.suspendedHandIndices.delete(handIndex);
            this.playCardDrawFlash(card.originalX, card.originalY);
        }
        this.updateNextCardPreviews();
    }

    private playCardDrawFlash(x: number, y: number) {
        const flash = this.add.graphics();
        flash.setDepth(CONSTANTS.DEPTH.CARD + 3);
        flash.fillStyle(0xb8c4ff, 0.18);
        flash.fillRoundedRect(x - 38, y - 50, 76, 98, 11);
        flash.lineStyle(2, 0xffffff, 0.42);
        flash.strokeRoundedRect(x - 38, y - 50, 76, 98, 11);
        flash.setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 320,
            ease: 'Quad.Out',
            onComplete: () => flash.destroy(),
        });
    }

    private enqueueInputCommand(command: QueueableInputCmd): InputCmd {
        const seq = this.inputSeq + 1;
        this.inputSeq = seq;
        const tick = Math.max(this.simulationTick, Math.floor(command.tick));
        const clientTime = this.time.now;

        if (command.action === 'spawn_unit') {
            const spawnCommand: SpawnUnitCmd = {
                tick,
                seq,
                action: 'spawn_unit',
                payload: command.payload,
                clientTime,
            };
            this.inputQueue.push(spawnCommand);
            this.clientSync.registerLocalInput(spawnCommand);
            if (this.friendlyRemoteMode) {
                this.inputQueue.pop();
                this.remoteCommandActionBySeq.set(seq, 'spawn_unit');
                this.createRemotePendingSpawnVisual(seq, command.payload.x, command.payload.y, command.payload.unitKey);
                if (typeof command.payload.handIndex === 'number') {
                    this.remotePendingHandBySeq.set(seq, command.payload.handIndex);
                }
                if (!this.battleSocket?.sendInput(spawnCommand)) {
                    window.setTimeout(() => this.resolveRemoteCommand(seq, false, 'socket_not_connected'), 0);
                }
            }
            return spawnCommand;
        }

        if (command.action === 'cast_active_skill') {
            const skillCommand: CastActiveSkillCmd = {
                tick,
                seq,
                action: 'cast_active_skill',
                payload: command.payload,
                clientTime,
            };
            this.inputQueue.push(skillCommand);
            this.clientSync.registerLocalInput(skillCommand);
            if (this.friendlyRemoteMode) {
                this.inputQueue.pop();
                this.remoteCommandActionBySeq.set(seq, 'cast_active_skill');
                if (!this.battleSocket?.sendInput(skillCommand)) {
                    window.setTimeout(() => this.resolveRemoteCommand(seq, false, 'socket_not_connected'), 0);
                }
            }
            return skillCommand;
        }

        const elixirCommand: InputCmd = {
            tick,
            seq,
            action: 'set_blue_elixir',
            payload: command.payload,
            clientTime,
        };
        this.inputQueue.push(elixirCommand);
        return elixirCommand;
    }

    private markCommandProcessed(command: Pick<InputCmd, 'seq' | 'tick' | 'action'>, accepted: boolean) {
        this.lastAckSeq = command.seq;
        this.commandHistory.push({
            seq: command.seq,
            tick: command.tick,
            action: command.action,
            accepted,
        });

        const overflow = this.commandHistory.length - CONSTANTS.GAMEPLAY.COMMAND_HISTORY_LIMIT;
        if (overflow > 0) {
            this.commandHistory.splice(0, overflow);
        }
    }

    private processInputQueue() {
        if (this.inputQueue.length === 0) return;

        const ready: InputCmd[] = [];
        const pending: InputCmd[] = [];

        for (const command of this.inputQueue) {
            if (command.tick <= this.simulationTick) {
                ready.push(command);
            } else {
                pending.push(command);
            }
        }
        this.inputQueue = pending;

        ready.sort((a, b) => {
            if (a.tick === b.tick) return a.seq - b.seq;
            return a.tick - b.tick;
        });

        for (const command of ready) {
            const accepted = this.applyInputCommand(command);
            this.reconcilePredictedCost(command, accepted);

            if (
                command.action === 'spawn_unit' &&
                command.payload.source === 'player_hand' &&
                typeof command.payload.handIndex === 'number'
            ) {
                this.pendingHandIndices.delete(command.payload.handIndex);
            }

            this.markCommandProcessed(command, accepted);
        }
    }

    private applySetBlueElixirCommand(value: number): boolean {
        this.elixirManager.setElixirForDebug(value);
        this.refreshHandAffordability();
        return true;
    }

    private applySpawnUnitCommand(command: SpawnUnitCmd): boolean {
        const { payload } = command;
        const handUnitKey =
            payload.source === 'player_hand' && typeof payload.handIndex === 'number'
                ? this.hand[payload.handIndex]?.unitKey ?? null
                : undefined;

        const rule = evaluateSpawnRule({
            payload,
            isGameOver: this.battleManager.isGameOver(),
            handUnitKey,
            canSpawnBlue: (x: number, y: number) => this.gameMap.isValidSpawnArea(x, y, 'blue'),
            canSpendBlueElixir: (cost: number) => this.elixirManager.canSpend(cost),
        });
        if (!rule.accepted) return false;

        if (rule.source === 'player_hand') {
            const handIndex = rule.handIndex;
            if (typeof handIndex !== 'number') return false;

            const card = this.hand[handIndex];
            if (!card || !card.active) return false;
            if (card.unitKey !== rule.unitKey) return false;

            this.elixirManager.spend(rule.cost);
            if (!this.remoteAuthoritative) {
                this.entityManager.spawnUnit(rule.spawnX, rule.spawnY, rule.team, rule.unitKey);
            }
            this.cycleHandCard(card);
            return true;
        }

        this.entityManager.spawnUnit(rule.spawnX, rule.spawnY, rule.team, rule.unitKey);
        return true;
    }

    private applyInputCommand(command: InputCmd): boolean {
        if (command.action === 'spawn_unit') {
            return this.applySpawnUnitCommand(command);
        }

        if (command.action === 'cast_active_skill') {
            const unit = this.entityManager.getUnits().find(candidate =>
                candidate.id === command.payload.unitId
                && candidate.team === 'blue'
                && candidate.activeSkillDefinition?.key === command.payload.skillKey
            );
            return unit ? this.entityManager.castActiveSkill(unit) : false;
        }

        return this.applySetBlueElixirCommand(command.payload.value);
    }

    private runSimulationStep() {
        this.simulationTick += 1;
        this.simulationServerTimeMs = this.simulationTick * this.simulationDeltaMs;

        if (this.friendlyRemoteMode) {
            const currentBaseState = this.captureBaseState();
            this.lastStateDelta = deriveStateDelta(this.previousBaseState, currentBaseState);
            this.previousBaseState = currentBaseState;
            return;
        }

        this.processInputQueue();

        this.entityManager.update(this.simulationServerTimeMs, this.simulationDeltaMs);
        this.elixirManager.update(this.simulationServerTimeMs, this.simulationDeltaMs);
        this.battleManager.update(this.simulationServerTimeMs, this.simulationDeltaMs);
        if (!this.remoteAuthoritative) {
            this.aiManager.update(this.simulationServerTimeMs, this.simulationDeltaMs, this.battleManager.isDoubleElixirTime());
        }

        const currentBaseState = this.captureBaseState();
        this.lastStateDelta = deriveStateDelta(this.previousBaseState, currentBaseState);
        this.previousBaseState = currentBaseState;
        if (!this.remoteAuthoritative) {
            this.clientSync.ingestSnapshot(
                {
                    tick: this.simulationTick,
                    ackSeq: this.lastAckSeq,
                    state: currentBaseState,
                },
                this.getPredictedStateView(currentBaseState)
            );
        }
    }

    private connectFriendlyBattle(context?: BattleLaunchContext) {
        const url = import.meta.env.VITE_BATTLE_WS_URL as string | undefined;
        if (context?.mode !== 'friendly' || !context.roomId || !context.playerId) return;
        this.friendlyRemoteMode = true;
        this.remoteBattleContext = context;
        this.remoteViewTransform = new BattleViewTransform(context.localTeam);
        this.remoteTimeline.reset();
        this.remoteSceneInitialized = false;
        if (!url) {
            this.effectManager.playUiText(CONSTANTS.SCREEN_WIDTH / 2, 120, 'MULTIPLAYER SERVER OFFLINE', '#ffb4c4');
            return;
        }
        this.battleSocket = new BattleSocketClient({
            url,
            roomId: context.roomId,
            playerId: context.playerId,
            team: context.localTeam,
            deck: this.deck,
            tokenProvider: getBattleAccessToken,
            onSnapshot: (snapshot, state) => {
                this.remoteAuthoritative = snapshot.state !== 'waiting';
                if (this.remoteTimelineEnabled) this.remoteTimeline.ingest(snapshot);
                else {
                    this.applyRemoteBattleSnapshot(snapshot, context, 66);
                    if (snapshot.state === 'finished' && snapshot.winner) this.finishRemoteBattle(snapshot, context);
                }
                this.updateRemoteConnectionLabel(snapshot);
                this.clientSync.ingestSnapshot(
                    {
                        tick: snapshot.tick,
                        ackSeq: snapshot.ackByPlayer[context.playerId ?? ''] ?? 0,
                        state,
                    },
                    this.captureBaseState()
                );
            },
            onCommandResult: (seq, accepted, reason) => this.resolveRemoteCommand(seq, accepted, reason),
            onConnectionState: (state) => {
                this.remoteConnectionState = state;
                if (state === 'connecting') this.showRemoteConnectionLabel('서버 연결 중...');
                else if (state === 'reconnecting') this.showRemoteConnectionLabel('연결 복구 중...');
                else if (state === 'closed') this.showRemoteConnectionLabel('연결 종료');
                else this.hideRemoteConnectionLabel();
            },
            onServerError: (code) => this.showRemoteConnectionLabel(`서버 오류: ${code}`),
        });
        this.battleSocket.connect();
    }

    private applyRemoteBattleSnapshot(
        snapshot: RemoteBattleSnapshot,
        context: BattleLaunchContext,
        renderDeltaMs: number,
    ) {
        if (snapshot.state === 'waiting') return;
        const viewTransform = this.remoteViewTransform ?? new BattleViewTransform(context.localTeam);
        const localPlayer = snapshot.players.find((player) => player.playerId === context.playerId);
        if (localPlayer) this.syncRemoteHand(localPlayer.hand, localPlayer.nextUnitKey);
        const acknowledgedSeq = snapshot.ackByPlayer[context.playerId ?? ''] ?? 0;
        this.clearAcknowledgedSpawnVisuals(acknowledgedSeq);
        const snapshotDelta = Math.max(1, renderDeltaMs);
        const remoteIds = new Set(snapshot.units.map((unit) => unit.id));
        const currentUnits = this.entityManager.getUnits().filter((unit) => !unit.isTower);
        const currentById = new Map(currentUnits.filter((unit) => unit.active).map((unit) => [unit.id, unit]));
        for (const unit of currentUnits) {
            if (!remoteIds.has(unit.id)) {
                if (this.remoteSceneInitialized) this.effectManager.playDeath(unit.x, unit.y, unit.team, false);
                unit.destroy();
            }
        }

        for (const remote of snapshot.units) {
            const visualTeam = viewTransform.worldToVisualTeam(remote.team);
            const point = viewTransform.worldToViewPoint(remote);
            const x = point.x;
            const y = point.y;
            let unit = currentById.get(remote.id) ?? null;
            if (!unit) {
                unit = this.entityManager.spawnRemoteUnit(x, y, visualTeam, remote.unitKey, remote.id);
                if (unit) {
                    currentById.set(remote.id, unit);
                    if (this.remoteSceneInitialized) this.effectManager.playSummon(x, y, visualTeam);
                }
            }
            if (!unit) continue;
            unit.maxHp = remote.maxHp;
            const direction = viewTransform.worldToViewVector({ x: remote.directionX, y: remote.directionY });
            const directionX = direction.x;
            const directionY = direction.y;
            unit.applyRemoteVisualState(x, y, remote.hp, remote.state, snapshotDelta, {
                attackSerial: remote.attackSerial,
                hitSerial: remote.hitSerial,
                jumpSerial: remote.jumpSerial,
                attackTick: remote.attackTick,
                hitTick: remote.hitTick,
                jumpTick: remote.jumpTick,
                activeSkillCastTick: remote.activeSkillCastTick,
                directionX,
                directionY,
                elevation: remote.elevation,
            }, true);
            if (remote.activeSkillKey && remote.activeSkillPhase && unit.activeSkillDefinition?.key === remote.activeSkillKey) {
                if (remote.activeSkillPhase === 'casting') {
                    this.entityManager.playRemoteActiveSkillCast(unit, remote.activeSkillCastSerial);
                }
                unit.applyRemoteActiveSkillRuntime(
                    remote.activeSkillPhase,
                    remote.activeSkillCooldownRemainingMs,
                    remote.activeSkillCastSerial,
                );
            }
        }

        const remoteProjectileIds = new Set(snapshot.projectiles.map((projectile) => projectile.id));
        for (const [id, visual] of this.remoteProjectileVisuals) {
            if (remoteProjectileIds.has(id)) continue;
            visual.destroy();
            this.remoteProjectileVisuals.delete(id);
        }
        for (const projectile of snapshot.projectiles) {
            const visualTeam = viewTransform.worldToVisualTeam(projectile.team);
            let visual = this.remoteProjectileVisuals.get(projectile.id);
            if (!visual) {
                visual = new RemoteProjectileVisual(this, projectile.projectileKey, visualTeam);
                this.remoteProjectileVisuals.set(projectile.id, visual);
            }
            const point = viewTransform.worldToViewPoint(projectile);
            const direction = viewTransform.worldToViewVector({ x: projectile.directionX, y: projectile.directionY });
            visual.applyState(point.x, point.y, direction.x, direction.y, true);
        }
        this.syncRemoteSkillZoneVisuals(snapshot, context, viewTransform);

        this.applyingRemoteSnapshot = true;
        try {
            for (const remote of snapshot.towers) {
                const visualTeam = viewTransform.worldToVisualTeam(remote.team);
                const remoteX = viewTransform.worldToViewPoint(remote).x;
                const candidates = this.entityManager.getTowers().filter((tower) => tower.team === visualTeam && tower.isKingTower === (remote.type === 'king'));
                const tower = candidates.sort((a, b) => Math.abs(a.x - remoteX) - Math.abs(b.x - remoteX))[0];
                if (!tower) continue;
                tower.maxHp = remote.maxHp;
                if (!remote.active && tower.active && tower.stats.hp > 0) tower.takeDamage(tower.stats.hp, null);
                else if (tower.active) tower.stats.hp = Math.max(0, remote.hp);
            }
        } finally {
            this.applyingRemoteSnapshot = false;
        }
        const localCrowns = context.localTeam === 'blue' ? snapshot.blueCrowns : snapshot.redCrowns;
        const opponentCrowns = context.localTeam === 'blue' ? snapshot.redCrowns : snapshot.blueCrowns;
        this.battleManager.applyRemoteState(snapshot.remainingMs, localCrowns, opponentCrowns);
        this.elixirManager.setElixirForDebug(context.localTeam === 'blue' ? snapshot.blueElixir : snapshot.redElixir);
        this.remoteSceneInitialized = true;
    }

    private createRemotePendingSpawnVisual(seq: number, x: number, y: number, unitKey: string) {
        this.removeRemotePendingSpawnVisual(seq, false);
        const marker = this.add.container(x, y);
        marker.setDepth(CONSTANTS.DEPTH.UNIT + y * 0.09 + 0.5);
        const shadow = this.add.ellipse(0, 10, 34, 11, 0x000000, 0.24);
        const image = this.add.image(0, -10, this.resolvePlacementGhostTexture(unitKey));
        const size = this.getPlacementGhostSize(unitKey);
        image.setDisplaySize(size, size);
        image.setAlpha(0.46);
        image.setTint(0xbbe9ff);
        const ring = this.add.circle(0, 0, 24, 0x6cd4ff, 0.08);
        ring.setStrokeStyle(2, 0xbbe9ff, 0.62);
        marker.add([shadow, ring, image]);
        this.remotePendingSpawnVisuals.set(seq, marker);
        this.tweens.add({
            targets: ring,
            scaleX: 1.12,
            scaleY: 1.12,
            alpha: 0.28,
            duration: 360,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private clearAcknowledgedSpawnVisuals(acknowledgedSeq: number) {
        for (const seq of this.remotePendingSpawnVisuals.keys()) {
            if (seq <= acknowledgedSeq) this.removeRemotePendingSpawnVisual(seq, false);
        }
    }

    private removeRemotePendingSpawnVisual(seq: number, rejected: boolean) {
        const marker = this.remotePendingSpawnVisuals.get(seq);
        if (!marker) return;
        this.remotePendingSpawnVisuals.delete(seq);
        this.tweens.killTweensOf(marker.list);
        this.tweens.add({
            targets: marker,
            alpha: 0,
            scaleX: rejected ? 0.72 : 1.08,
            scaleY: rejected ? 0.72 : 1.08,
            duration: rejected ? 120 : 90,
            ease: rejected ? 'Sine.easeIn' : 'Sine.easeOut',
            onComplete: () => marker.destroy(),
        });
    }

    private clearRemotePendingSpawnVisuals() {
        for (const marker of this.remotePendingSpawnVisuals.values()) marker.destroy();
        this.remotePendingSpawnVisuals.clear();
    }

    private updateRemoteConnectionLabel(snapshot: RemoteBattleSnapshot) {
        if (snapshot.paused) {
            const seconds = Math.max(0, Math.ceil((snapshot.disconnectGraceRemainingMs ?? 0) / 1000));
            this.showRemoteConnectionLabel(`상대 재접속 대기 ${seconds}초`);
            return;
        }
        if (this.remoteConnectionState === 'connected') this.hideRemoteConnectionLabel();
    }

    private showRemoteConnectionLabel(message: string) {
        if (!this.remoteConnectionLabel) {
            this.remoteConnectionLabel = this.add.text(CONSTANTS.SCREEN_WIDTH / 2, 76, message, {
                fontFamily: GAME_FONT,
                fontSize: '12px',
                fontStyle: 'bold',
                color: '#ffffff',
                backgroundColor: '#111827',
                padding: { x: 10, y: 5 },
            });
            this.remoteConnectionLabel.setOrigin(0.5);
            this.remoteConnectionLabel.setDepth(CONSTANTS.DEPTH.OVERLAY + 20);
            this.remoteConnectionLabel.setScrollFactor(0);
        }
        this.remoteConnectionLabel.setText(message).setVisible(true);
    }

    private hideRemoteConnectionLabel() {
        this.remoteConnectionLabel?.setVisible(false);
    }

    private clearRemoteProjectileVisuals() {
        for (const visual of this.remoteProjectileVisuals.values()) visual.destroy();
        this.remoteProjectileVisuals.clear();
    }

    private syncRemoteSkillZoneVisuals(
        snapshot: RemoteBattleSnapshot,
        context: BattleLaunchContext,
        viewTransform: BattleViewTransform,
    ) {
        const activeIds = new Set(snapshot.skillZones.map((zone) => zone.id));
        for (const [id, visual] of this.remoteSkillZoneVisuals) {
            if (activeIds.has(id)) continue;
            visual.destroy();
            this.remoteSkillZoneVisuals.delete(id);
        }
        for (const zone of snapshot.skillZones) {
            if (zone.skillKey !== 'web_snare') continue;
            let visual = this.remoteSkillZoneVisuals.get(zone.id);
            if (!visual) {
                const texture = this.textures.exists('vfx_web_acrobat_zone_2')
                    ? 'vfx_web_acrobat_zone_2'
                    : 'vfx_web_acrobat_zone_0';
                visual = this.add.image(0, 0, texture)
                    .setDepth(CONSTANTS.DEPTH.HUD - 8)
                    .setAlpha(0.9)
                    .setDisplaySize(zone.radius * 2.15, zone.radius * 2.15);
                this.remoteSkillZoneVisuals.set(zone.id, visual);
            }
            const point = viewTransform.worldToViewPoint(zone);
            visual.setPosition(point.x, point.y);
            visual.setFlipX(zone.team !== context.localTeam);
            visual.setAlpha(Phaser.Math.Clamp(0.45 + zone.remainingMs / 10_000, 0.45, 0.92));
        }
    }

    private clearRemoteSkillZoneVisuals() {
        for (const visual of this.remoteSkillZoneVisuals.values()) visual.destroy();
        this.remoteSkillZoneVisuals.clear();
    }

    private resolveRemoteCommand(seq: number, accepted: boolean, reason?: string) {
        const reserved = this.predictedCostBySeq.get(seq);
        if (reserved !== undefined) {
            this.predictedCostBySeq.delete(seq);
            this.reservedBlueElixir = Math.max(0, this.reservedBlueElixir - reserved);
        }
        const handIndex = this.remotePendingHandBySeq.get(seq);
        if (handIndex !== undefined) this.pendingHandIndices.delete(handIndex);
        this.remotePendingHandBySeq.delete(seq);
        const action = this.remoteCommandActionBySeq.get(seq) ?? 'set_blue_elixir';
        this.remoteCommandActionBySeq.delete(seq);
        if (accepted) this.predictionAcceptedCount += 1;
        else {
            this.predictionRejectedCount += 1;
            this.removeRemotePendingSpawnVisual(seq, true);
            if (reason) this.effectManager.playUiText(CONSTANTS.SCREEN_WIDTH / 2, 112, this.rejectReasonLabel(reason), '#ffb4c4');
        }
        this.markCommandProcessed({ tick: this.simulationTick, seq, action }, accepted);
        this.refreshHandAffordability();
    }

    private syncRemoteHand(hand: Array<string | null>, nextUnitKey: string | null) {
        if (hand.length !== this.hand.length) return;
        hand.forEach((unitKey, index) => {
            const card = this.hand[index];
            if (!card) return;
            if (!unitKey) {
                card.setUnavailable(true);
                this.suspendedHandIndices.add(index);
                return;
            }
            if (card.unitKey !== unitKey) card.setUnitKey(unitKey);
            card.setUnavailable(false);
            this.suspendedHandIndices.delete(index);
        });
        if (this.remoteNextUnitKey !== nextUnitKey) {
            this.remoteNextUnitKey = nextUnitKey;
            this.updateNextCardPreviews();
        }
    }

    private finishRemoteBattle(snapshot: RemoteBattleSnapshot, context: BattleLaunchContext) {
        if (this.remoteResultDispatched || !snapshot.winner) return;
        this.remoteResultDispatched = true;
        const winner: BattleWinner = snapshot.winner === 'draw' ? 'draw' : snapshot.winner === context.localTeam ? 'blue' : 'red';
        const result = {
            winner,
            blueCrowns: context.localTeam === 'blue' ? snapshot.blueCrowns : snapshot.redCrowns,
            redCrowns: context.localTeam === 'blue' ? snapshot.redCrowns : snapshot.blueCrowns,
            playerName: ko.lobby.playerName,
            opponentName: context.opponentName,
            arenaName: ko.lobby.arenaName,
        };
        window.chaosLastBattleResult = result;
        this.scene.stop('main-scene');
        dispatchChaosNavigation({ result });
    }

    private requestForfeit() {
        if (this.friendlyRemoteMode && this.battleSocket) {
            const seq = ++this.inputSeq;
            if (this.battleSocket.sendForfeit(seq)) return;
        }
        this.finishBattle('red', 3);
    }

    private requestActiveSkill(unit: Unit) {
        if (this.battleManager.isGameOver() || this.forfeitDialog) return;
        const skillKey = unit.activeSkillDefinition?.key;
        if (!skillKey || !unit.canCastActiveSkill()) return;
        this.enqueueInputCommand({
            tick: this.simulationTick + CONSTANTS.GAMEPLAY.INPUT_DELAY_TICKS,
            action: 'cast_active_skill',
            payload: { unitId: unit.id, skillKey },
        });
    }

    update(time: number, delta: number) {
        this.mapRenderer.update(time, delta);
        if (this.friendlyRemoteMode) {
            const context = this.remoteBattleContext;
            const estimatedServerTimeMs = this.battleSocket?.getEstimatedServerTimeMs() ?? Date.now();
            const renderSample = this.remoteTimelineEnabled
                ? this.remoteTimeline.sample(estimatedServerTimeMs)
                : null;
            if (context && renderSample) {
                const renderedSnapshot = this.remoteTimeline.materialize(renderSample);
                this.applyRemoteBattleSnapshot(renderedSnapshot, context, delta);
                if (renderedSnapshot.state === 'finished' && renderedSnapshot.winner) {
                    this.finishRemoteBattle(renderedSnapshot, context);
                }
            }
            for (const unit of this.entityManager.getUnits()) {
                if (!unit.isTower && unit.active) unit.updateRemoteVisual(delta);
            }
            for (const visual of this.remoteProjectileVisuals.values()) visual.updateRemoteVisual(delta);
        }
        this.activeSkillButton?.update();
        if (this.forfeitDialog) {
            this.hud.update();
            return;
        }

        this.simulationAccumulatorMs += Math.min(delta, 250);

        let stepCount = 0;
        while (
            this.simulationAccumulatorMs >= this.simulationDeltaMs &&
            stepCount < CONSTANTS.GAMEPLAY.SIM_MAX_STEPS_PER_FRAME
        ) {
            this.runSimulationStep();
            this.simulationAccumulatorMs -= this.simulationDeltaMs;
            stepCount += 1;
        }

        if (
            stepCount === CONSTANTS.GAMEPLAY.SIM_MAX_STEPS_PER_FRAME &&
            this.simulationAccumulatorMs > this.simulationDeltaMs
        ) {
            this.simulationAccumulatorMs = this.simulationDeltaMs;
        }

        const renderTick = this.simulationTick + (this.simulationAccumulatorMs / this.simulationDeltaMs);
        this.interpolationSample = this.clientSync.sample(renderTick);

        this.refillSuspendedHandSlots();
        this.refreshHandAffordability();
        this.hud.update();
    }

    private createForfeitButton() {
        const depth = CONSTANTS.DEPTH.HUD + 28;
        const button = this.add.container(CONSTANTS.SCREEN_WIDTH - 24, 24);
        button.setDepth(depth);

        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.3);
        shadow.fillRoundedRect(-14, -13, 28, 28, 8);

        const bg = this.add.graphics();
        bg.fillStyle(0x111827, 0.94);
        bg.lineStyle(2, 0xdce7ff, 0.55);
        bg.fillRoundedRect(-13, -14, 26, 26, 8);
        bg.strokeRoundedRect(-13, -14, 26, 26, 8);

        const xMark = this.add.text(0, -1, '×', {
            fontSize: '15px',
            fontFamily: GAME_FONT,
            fontStyle: '900',
            color: '#f2f6ff',
            stroke: '#02050d',
            strokeThickness: 3,
        });
        xMark.setOrigin(0.5);
        xMark.setResolution(2);

        button.add([shadow, bg, xMark]);
        button.setSize(32, 32);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerdown', () => this.showForfeitDialog());
    }

    private showForfeitDialog() {
        if (this.forfeitDialog || this.battleManager.isGameOver()) return;

        const depth = CONSTANTS.DEPTH.OVERLAY + 40;
        const dialog = this.add.container(0, 0);
        dialog.setDepth(depth);

        const blocker = this.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2,
            CONSTANTS.SCREEN_HEIGHT / 2,
            CONSTANTS.SCREEN_WIDTH,
            CONSTANTS.SCREEN_HEIGHT,
            0x020611,
            0.72
        );
        blocker.setInteractive();

        const panel = this.add.graphics();
        const panelX = 34;
        const panelY = 268;
        const panelW = CONSTANTS.SCREEN_WIDTH - 68;
        const panelH = 176;
        panel.fillStyle(0x111827, 0.98);
        panel.lineStyle(3, 0x8aa4dc, 0.95);
        panel.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
        panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);
        panel.lineStyle(1, 0xffd76a, 0.45);
        panel.strokeRoundedRect(panelX + 7, panelY + 7, panelW - 14, panelH - 14, 13);

        const title = this.add.text(CONSTANTS.SCREEN_WIDTH / 2, panelY + 38, ko.battle.forfeitTitle, {
            fontSize: '21px',
            fontFamily: GAME_FONT,
            fontStyle: '900',
            color: '#f8fbff',
            stroke: '#02050d',
            strokeThickness: 4,
            align: 'center',
        });
        title.setOrigin(0.5);
        title.setResolution(2);

        const body = this.add.text(CONSTANTS.SCREEN_WIDTH / 2, panelY + 72, ko.battle.forfeitBody, {
            fontSize: '12px',
            fontFamily: GAME_FONT,
            color: '#bcc9e8',
            align: 'center',
        });
        body.setOrigin(0.5);
        body.setResolution(2);

        const noButton = this.createDialogButton(108, panelY + 126, 112, 42, ko.common.no, 0x263247, 0x9fb4df, () => {
            this.forfeitDialog?.destroy();
            this.forfeitDialog = null;
        });
        const yesButton = this.createDialogButton(252, panelY + 126, 112, 42, ko.common.yes, 0xbc2f44, 0xffa1aa, () => {
            this.forfeitDialog?.destroy();
            this.forfeitDialog = null;
            this.finishBattle('red', Math.max(3, this.battleManager.getRedCrowns()));
        });

        dialog.add([blocker, panel, title, body, noButton, yesButton]);
        this.forfeitDialog = dialog;
    }

    private createDialogButton(
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        fill: number,
        stroke: number,
        onClick: () => void
    ) {
        const button = this.add.container(x, y);
        const bg = this.add.graphics();
        bg.fillStyle(fill, 0.98);
        bg.lineStyle(2, stroke, 0.9);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 11);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 11);

        const gloss = this.add.graphics();
        gloss.fillStyle(0xffffff, 0.12);
        gloss.fillRoundedRect(-width / 2 + 7, -height / 2 + 6, width - 14, 8, 5);

        const text = this.add.text(0, 1, label, {
            fontSize: '15px',
            fontFamily: GAME_FONT,
            fontStyle: '900',
            color: '#ffffff',
            stroke: '#02050d',
            strokeThickness: 3,
        });
        text.setOrigin(0.5);
        text.setResolution(2);

        button.add([bg, gloss, text]);
        button.setSize(width, height);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerdown', onClick);
        return button;
    }

    /**
     * Debug helper: force spawn a unit without card drag/input.
     */
    public debugSpawnUnit(unitKey: string, team: 'blue' | 'red', x?: number, y?: number): boolean {
        const payload: Extract<InputCmd, { action: 'spawn_unit' }>['payload'] = {
            team,
            unitKey,
            x: x ?? Phaser.Math.Between(38, CONSTANTS.SCREEN_WIDTH - 38),
            y: y ?? Phaser.Math.Between(
                team === 'blue' ? CONSTANTS.ARENA.SPAWN_AREA_BLUE_MIN + 8 : CONSTANTS.ARENA.SPAWN_AREA_RED_MIN + 8,
                team === 'blue' ? CONSTANTS.ARENA.SPAWN_AREA_BLUE_MAX - 8 : CONSTANTS.ARENA.SPAWN_AREA_RED_MAX - 8
            ),
            source: 'debug',
        };
        const rule = evaluateSpawnRule({
            payload,
            isGameOver: this.battleManager.isGameOver(),
        });
        if (!rule.accepted) return false;

        this.enqueueInputCommand({
            tick: this.simulationTick + CONSTANTS.GAMEPLAY.INPUT_DELAY_TICKS,
            action: 'spawn_unit',
            payload: {
                ...payload,
                x: rule.spawnX,
                y: rule.spawnY,
            },
        });
        return true;
    }

    /**
     * Debug helper: quickly set player elixir for testing.
     */
    public debugSetBlueElixir(value: number) {
        this.enqueueInputCommand({
            tick: this.simulationTick + CONSTANTS.GAMEPLAY.INPUT_DELAY_TICKS,
            action: 'set_blue_elixir',
            payload: { value },
        });
    }

    /**
     * Debug helper: structured state dump for automated checks.
     */
    public debugGetSnapshot(): DebugSnapshot {
        const timelineDiagnostics = this.remoteTimeline.getDiagnostics();
        const networkDiagnostics = this.battleSocket?.getNetworkDiagnostics();
        const units = this.entityManager.getUnits()
            .filter(unit => unit.active && !unit.isTower)
            .map((unit): DebugUnitState => {
                const body = unit.body as Phaser.Physics.Arcade.Body;
                return {
                    id: unit.id,
                    unitKey: unit.unitKey,
                    team: unit.team,
                    role: unit.role,
                    attackType: unit.stats.attackType,
                    hp: Math.max(0, Math.round(unit.stats.hp)),
                    maxHp: unit.maxHp,
                    x: Math.round(unit.x),
                    y: Math.round(unit.y),
                    state: unit.state,
                    velocityX: Math.round(body.velocity.x),
                    velocityY: Math.round(body.velocity.y),
                    targetId: unit.target?.id ?? null,
                    targetUnitKey: unit.target?.unitKey ?? null,
                    targetIsTower: unit.target?.isTower ?? false,
                };
            });

        const towers = this.entityManager.getUnits()
            .filter(unit => unit.active && unit.isTower)
            .map((tower): DebugTowerState => ({
                id: tower.id,
                team: tower.team,
                king: tower.isKingTower,
                active: tower.towerActive,
                hp: Math.max(0, Math.round(tower.stats.hp)),
                maxHp: tower.maxHp,
                x: Math.round(tower.x),
                y: Math.round(tower.y),
                state: tower.state,
            }));

        const visibleHand = this.hand.filter(card => card.active);
        const normalizedSnapshot: NormalizedSnapshot = {
            tick: this.simulationTick,
            ackSeq: this.lastAckSeq,
            stateDelta: { ...this.lastStateDelta },
        };

        return {
            coordinateSystem: {
                origin: 'top-left',
                xAxis: '+right',
                yAxis: '+down',
            },
            battle: {
                timeRemainingSec: Math.round(this.battleManager.getBattleTime() * 10) / 10,
                blueCrowns: this.battleManager.getBlueCrowns(),
                redCrowns: this.battleManager.getRedCrowns(),
                overtime: this.battleManager.isOvertimeActive(),
                doubleElixir: this.battleManager.isDoubleElixirTime(),
                gameOver: this.battleManager.isGameOver(),
            },
            resources: {
                blueElixir: this.elixirManager.getElixir(),
                redElixir: this.aiManager.getElixir(),
            },
            simulation: {
                tickRateHz: this.simulationTickRate,
                fixedDeltaMs: this.simulationDeltaMs,
                currentTick: this.simulationTick,
                serverTimeMs: this.simulationServerTimeMs,
                accumulatorMs: Math.round(this.simulationAccumulatorMs * 100) / 100,
            },
            protocol: {
                lastSeq: this.inputSeq,
                ackSeq: this.lastAckSeq,
                pendingInputCount: this.inputQueue.length,
                prediction: {
                    reservedBlueElixir: this.reservedBlueElixir,
                    acceptedCount: this.predictionAcceptedCount,
                    rejectedCount: this.predictionRejectedCount,
                },
                interpolation: {
                    available: this.interpolationSample.available,
                    delayTicks: this.clientSync.getInterpolationDelayTicks(),
                    targetTick: Math.round(this.interpolationSample.targetTick * 100) / 100,
                    alpha: Math.round(this.interpolationSample.alpha * 1000) / 1000,
                    fromTick: this.interpolationSample.fromTick,
                    toTick: this.interpolationSample.toTick,
                    bufferSize: this.clientSync.getSnapshotBufferSize(),
                },
                network: {
                    timelineEnabled: this.remoteTimelineEnabled,
                    renderDelayMs: timelineDiagnostics.renderDelayMs,
                    bufferedSnapshots: timelineDiagnostics.bufferedSnapshots,
                    droppedSnapshots: timelineDiagnostics.droppedSnapshots,
                    latestTick: timelineDiagnostics.latestTick,
                    rttMs: Math.round((networkDiagnostics?.rttMs ?? 0) * 10) / 10,
                    jitterMs: Math.round((networkDiagnostics?.jitterMs ?? 0) * 10) / 10,
                    snapshotAgeMs: Math.round((networkDiagnostics?.snapshotAgeMs ?? 0) * 10) / 10,
                    snapshotBytes: networkDiagnostics?.snapshotBytes ?? 0,
                    parseMs: Math.round((networkDiagnostics?.parseMs ?? 0) * 100) / 100,
                    staleSnapshots: networkDiagnostics?.staleSnapshots ?? 0,
                },
                reconciliation: {
                    mode: this.clientSync.getCorrectionMode(),
                    pendingLocalInputs: this.clientSync.getPendingLocalInputCount(),
                    correctionCount: this.clientSync.getCorrectionCount(),
                    snapCorrectionCount: this.clientSync.getSnapCorrectionCount(),
                    smoothCorrectionCount: this.clientSync.getSmoothCorrectionCount(),
                    lastCorrectionTick: this.clientSync.getLastCorrectionTick(),
                    lastErrorMagnitude: Math.round(this.clientSync.getLastErrorMagnitude() * 1000) / 1000,
                    tuning: this.clientSync.getReconciliationTuning(),
                },
                recentCommands: this.commandHistory.slice(-12),
                normalizedSnapshot,
            },
            interpolated: this.interpolationSample.state
                ? {
                    unitCount: Math.round(this.interpolationSample.state.unitCount * 100) / 100,
                    towerHpTotal: Math.round(this.interpolationSample.state.towerHpTotal * 100) / 100,
                    blueElixir: Math.round(this.interpolationSample.state.blueElixir * 100) / 100,
                    redElixir: Math.round(this.interpolationSample.state.redElixir * 100) / 100,
                    blueCrowns: Math.round(this.interpolationSample.state.blueCrowns * 100) / 100,
                    redCrowns: Math.round(this.interpolationSample.state.redCrowns * 100) / 100,
                }
                : null,
            units,
            towers,
            hand: visibleHand.map(card => ({
                unitKey: card.unitKey,
                cost: card.cost,
                affordable: this.elixirManager.canSpend(card.cost),
            })),
        };
    }
}
