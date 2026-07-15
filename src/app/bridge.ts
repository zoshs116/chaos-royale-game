import type { AppRoute, BattleResult } from './types';

export interface ChaosAppBridge {
    navigate: (route: AppRoute) => void;
    showLobby: () => void;
    showResult: (result: BattleResult) => void;
}

export type ChaosNavigationDetail = {
    route?: AppRoute;
    result?: BattleResult;
};

const pendingEvents: ChaosNavigationDetail[] = [];

export const setChaosAppBridge = (bridge: ChaosAppBridge) => {
    window.chaosApp = bridge;
    while (pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (!event) continue;
        if (event.result) bridge.showResult(event.result);
        else if (event.route) bridge.navigate(event.route);
    }
};

export const dispatchChaosNavigation = (detail: ChaosNavigationDetail) => {
    if (!window.chaosApp && (detail.result || detail.route)) {
        pendingEvents.push(detail);
    }
    window.dispatchEvent(new CustomEvent<ChaosNavigationDetail>('chaos:navigate', { detail }));
};
