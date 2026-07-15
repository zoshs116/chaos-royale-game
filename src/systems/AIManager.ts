import Phaser from 'phaser';
import EntityManager from './EntityManager';
import { UNIT_TYPES } from '../data/UnitData';
import type { UnitRole } from '../data/UnitData';
import { CONSTANTS } from './Constants';

const ENEMY_TEST_DECK = [
    'duckxel_sword_man',
];

/**
 * AI Manager - Controls enemy team unit spawning with role-based strategy.
 * Uses same elixir system as player for fairness.
 */
export default class AIManager {
    private entityManager: EntityManager;
    private elixir: number;
    private elixirTimer: number = 0;
    private decisionTimer: number = 0;
    private deck: string[];
    private handIndex: number = 0;
    private mode: 'aggressive' | 'defensive' = 'aggressive';
    private lastSpawnedRole: UnitRole | null = null;

    constructor(_scene: Phaser.Scene, entityManager: EntityManager) {
        this.entityManager = entityManager;
        this.elixir = CONSTANTS.GAMEPLAY.START_ELIXIR;

        // Use a fixed enemy deck while testing imported Duck.xel battle assets.
        this.deck = ENEMY_TEST_DECK.filter((key) => Boolean(UNIT_TYPES[key]));
        Phaser.Utils.Array.Shuffle(this.deck);
    }

    update(_time: number, delta: number, isDoubleElixir: boolean) {
        // Elixir regeneration - SAME rate as player
        const regenRate = isDoubleElixir
            ? CONSTANTS.GAMEPLAY.ELIXIR_REGEN_DOUBLE
            : CONSTANTS.GAMEPLAY.ELIXIR_REGEN_RATE;

        this.elixirTimer += delta;
        if (this.elixirTimer >= regenRate) {
            this.elixirTimer -= regenRate;
            this.elixir = Math.min(CONSTANTS.GAMEPLAY.MAX_ELIXIR, this.elixir + 1);
        }

        // Mode check: switch to defensive if our towers are under attack
        this.updateMode();

        // Decision every 2-3s
        this.decisionTimer += delta;
        const decisionInterval = this.mode === 'aggressive' ? 2500 : 1800;
        if (this.decisionTimer >= decisionInterval) {
            this.decisionTimer = 0;
            this.makeDecision();
        }
    }

    private updateMode() {
        const redTowers = this.entityManager.getTowersByTeam('red');
        // If fewer than 3 towers remain, become defensive
        if (redTowers.length < 3) {
            this.mode = 'defensive';
        } else {
            this.mode = 'aggressive';
        }
    }

    private makeDecision() {
        if (this.elixir < 2) return; // Too low to spawn

        // Strategy: try to build combos
        const unitToSpawn = this.selectUnit();
        if (!unitToSpawn) return;

        const data = UNIT_TYPES[unitToSpawn];
        if (!data) return;
        if (this.elixir < data.cost) return;

        this.elixir -= data.cost;
        this.lastSpawnedRole = data.role;

        // Spawn near the red princess towers so the test enemy enters from its side naturally.
        const laneX = Math.random() > 0.5
            ? CONSTANTS.TOWERS.RED_PRINCESS_L.x
            : CONSTANTS.TOWERS.RED_PRINCESS_R.x;
        const x = Phaser.Math.Clamp(laneX + Phaser.Math.Between(-26, 26), 34, CONSTANTS.SCREEN_WIDTH - 34);
        const y = Phaser.Math.Clamp(CONSTANTS.TOWERS.RED_PRINCESS_L.y + Phaser.Math.Between(26, 58), CONSTANTS.ARENA.SPAWN_AREA_RED_MIN, CONSTANTS.ARENA.SPAWN_AREA_RED_MAX);

        this.entityManager.spawnUnit(x, y, 'red', unitToSpawn);
    }

    private selectUnit(): string | null {
        // Get affordable units
        const affordable = this.deck.filter((key) => {
            const data = UNIT_TYPES[key];
            return Boolean(data && data.cost <= this.elixir);
        });

        if (affordable.length === 0) return null;

        // Strategy: build complementary combos
        if (this.lastSpawnedRole) {
            const complement = this.getComplementaryRole(this.lastSpawnedRole);
            const complementUnits = affordable.filter(key => UNIT_TYPES[key]?.role === complement);

            if (complementUnits.length > 0 && Math.random() > 0.3) {
                return Phaser.Utils.Array.GetRandom(complementUnits);
            }
        }

        // Defensive mode: prefer tanks and support
        if (this.mode === 'defensive') {
            const defensiveUnits = affordable.filter(key => {
                const r = UNIT_TYPES[key]?.role;
                return r === 'tank' || r === 'support';
            });
            if (defensiveUnits.length > 0 && Math.random() > 0.4) {
                return Phaser.Utils.Array.GetRandom(defensiveUnits);
            }
        }

        // Cycle through deck for variety
        for (let i = 0; i < this.deck.length; i++) {
            const idx = (this.handIndex + i) % this.deck.length;
            const key = this.deck[idx];
            if (affordable.includes(key)) {
                this.handIndex = (idx + 1) % this.deck.length;
                return key;
            }
        }

        return Phaser.Utils.Array.GetRandom(affordable);
    }

    /**
     * Returns a complementary role for combo building.
     */
    private getComplementaryRole(role: UnitRole): UnitRole {
        switch (role) {
            case 'tank': return 'mage';      // Tank + Mage combo
            case 'mage': return 'tank';       // Mage behind Tank
            case 'assassin': return 'support';    // Assassin + Support
            case 'support': return 'assassin';   // Support buffs Assassin
            case 'siege': return 'tank';       // Tank protects Siege
            case 'swarm': return 'mage';       // Swarm + Mage pressure
            default: return 'tank';
        }
    }

    getElixir(): number {
        return this.elixir;
    }
}
