import type { BattleResult } from './types';
import type { ChaosAppBridge } from './bridge';
import type Phaser from 'phaser';

declare global {
    interface Window {
        chaosApp?: ChaosAppBridge;
        chaosLastBattleResult?: BattleResult;
        chaosGame?: Phaser.Game;
    }
}

export {};
