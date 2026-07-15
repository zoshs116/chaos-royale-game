import Phaser from 'phaser';
import { CONSTANTS } from './Constants';
import EntityManager from './EntityManager';

/**
 * Manages battle timer, crowns, win/loss conditions.
 */
export default class BattleManager {
    private scene: Phaser.Scene;
    private entityManager: EntityManager;
    private battleTime: number; // remaining seconds
    private isOvertime: boolean = false;
    private isDoubleElixir: boolean = false;
    private gameOver: boolean = false;

    private blueCrowns: number = 0;
    private redCrowns: number = 0;

    private onDoubleElixir: (() => void) | null = null;
    private onGameEnd: ((winner: 'blue' | 'red' | 'draw') => void) | null = null;

    constructor(scene: Phaser.Scene, entityManager: EntityManager) {
        this.scene = scene;
        this.entityManager = entityManager;
        this.battleTime = CONSTANTS.GAMEPLAY.BATTLE_TIME;

        // Listen for tower destruction
        scene.events.on('towerDestroyed', (data: { team: string, isKing: boolean }) => {
            this.onTowerDestroyed(data);
        });

        // Listen for king tower activation
        scene.events.on('kingTowerActivated', (data: { team: string }) => {
            console.log(`${data.team} King Tower activated!`);
        });
    }

    setCallbacks(onDoubleElixir: () => void, onGameEnd: (winner: 'blue' | 'red' | 'draw') => void) {
        this.onDoubleElixir = onDoubleElixir;
        this.onGameEnd = onGameEnd;
    }

    update(_time: number, delta: number) {
        if (this.gameOver) return;

        this.battleTime -= delta / 1000;

        // Double elixir check
        if (!this.isDoubleElixir && this.battleTime <= CONSTANTS.GAMEPLAY.DOUBLE_ELIXIR_TIME) {
            this.isDoubleElixir = true;
            if (this.onDoubleElixir) this.onDoubleElixir();
        }

        // Time's up
        if (this.battleTime <= 0) {
            if (!this.isOvertime && this.blueCrowns === this.redCrowns) {
                // Overtime
                this.isOvertime = true;
                this.battleTime = CONSTANTS.GAMEPLAY.OVERTIME_DURATION;
            } else {
                this.endGame();
            }
        }
    }

    private onTowerDestroyed(data: { team: string, isKing: boolean }) {
        // Crown goes to the OPPOSITE team
        if (data.team === 'blue') {
            this.redCrowns++;
            if (data.isKing) {
                // King destroyed = instant win for red (3 crowns)
                this.redCrowns = 3;
                this.endGame();
                return;
            }
            // Activate blue king tower when princess is destroyed
            this.activateKingTower('blue');
        } else {
            this.blueCrowns++;
            if (data.isKing) {
                this.blueCrowns = 3;
                this.endGame();
                return;
            }
            this.activateKingTower('red');
        }

        // Check if overtime and someone took the lead 
        if (this.isOvertime && this.blueCrowns !== this.redCrowns) {
            this.endGame();
        }
    }

    private activateKingTower(team: 'blue' | 'red') {
        const towers = this.entityManager.getTowersByTeam(team);
        for (const tower of towers) {
            if (tower.isKingTower && !tower.towerActive) {
                tower.towerActive = true;
                this.scene.events.emit('kingTowerActivated', { team });
            }
        }
    }

    private endGame() {
        this.gameOver = true;
        let winner: 'blue' | 'red' | 'draw';

        if (this.blueCrowns > this.redCrowns) {
            winner = 'blue';
        } else if (this.redCrowns > this.blueCrowns) {
            winner = 'red';
        } else {
            // Compare king tower HP
            const blueTowers = this.entityManager.getTowersByTeam('blue');
            const redTowers = this.entityManager.getTowersByTeam('red');
            const blueKingHp = blueTowers.find(t => t.isKingTower)?.stats.hp || 0;
            const redKingHp = redTowers.find(t => t.isKingTower)?.stats.hp || 0;

            if (blueKingHp > redKingHp) winner = 'blue';
            else if (redKingHp > blueKingHp) winner = 'red';
            else winner = 'draw';
        }

        if (this.onGameEnd) this.onGameEnd(winner);
    }

    getBattleTime(): number {
        return Math.max(0, this.battleTime);
    }

    getBlueCrowns(): number {
        return this.blueCrowns;
    }

    getRedCrowns(): number {
        return this.redCrowns;
    }

    isDoubleElixirTime(): boolean {
        return this.isDoubleElixir;
    }

    isOvertimeActive(): boolean {
        return this.isOvertime;
    }

    isGameOver(): boolean {
        return this.gameOver;
    }
}
