import Phaser from 'phaser';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import LoadingScene from './scenes/LoadingScene';
import LobbyScene from './scenes/LobbyScene';
import ShopScene from './scenes/ShopScene';
import DeckScene from './scenes/DeckScene';
import MainScene from './scenes/MainScene';
import GameOverScene from './scenes/GameOverScene';
import { getLayout, getRenderScale, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './core/Resolution';
import App from './app/App';
import type { BattleLaunchContext, BattleResult } from './app/types';

type Team = 'blue' | 'red';
type Lane = 'left' | 'center' | 'right';

interface ChaosDebugApi {
  spawnUnit: (unitKey: string, team?: Team, x?: number, y?: number) => boolean;
  spawnWave: (team?: Team, unitKeys?: string[], lane?: Lane) => number;
  setBlueElixir: (value: number) => void;
  snapshot: () => unknown;
  resetToMain: () => void;
}

interface ChaosRenderDiagnostics {
  logicalWidth: number;
  logicalHeight: number;
  renderScale: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasCssWidth: number;
  canvasCssHeight: number;
  rendererWidth?: number;
  rendererHeight?: number;
  dpr: number;
  hdMode: boolean;
}

declare global {
  interface Window {
    chaosGame?: Phaser.Game;
    chaosDebug?: ChaosDebugApi;
    chaosRenderDiagnostics?: () => ChaosRenderDiagnostics;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
    chaosApp?: {
      showLobby: () => void;
      showResult: (result: BattleResult) => void;
    };
  }
}

const rootEl = document.getElementById('app');
if (!rootEl) throw new Error('Missing #app root');

rootEl.innerHTML = '<div id="react-root"></div><div id="phaser-root"></div>';
const reactRootEl = document.getElementById('react-root');
const phaserRootEl = document.getElementById('phaser-root');
if (!reactRootEl || !phaserRootEl) throw new Error('Missing app mount roots');

const isAutomationRun = (() => {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('automation') === '1';
})();

const renderScale = getRenderScale();
const layout = getLayout(renderScale);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: layout.renderWidth,
  height: layout.renderHeight,
  parent: 'phaser-root',
  backgroundColor: '#0f1730',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1,
    autoRound: true,
  },
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: isAutomationRun,
  },
  scene: [LoadingScene, LobbyScene, ShopScene, DeckScene, MainScene, GameOverScene],
};

const game = new Phaser.Game(config);
window.chaosGame = game;

const setPhaserVisible = (visible: boolean) => {
  phaserRootEl.classList.toggle('is-visible', visible);
  phaserRootEl.classList.toggle('is-hidden', !visible);
};

const startBattle = (deck?: string[], context?: BattleLaunchContext) => {
  setPhaserVisible(true);
  game.scene.stop('lobby-scene');
  game.scene.stop('deck-scene');
  game.scene.stop('shop-scene');
  game.scene.stop('game-over');
  game.scene.stop('main-scene');
  game.scene.start('main-scene', { deck, context });
};

window.addEventListener('chaos:navigate', (event) => {
  const detail = (event as CustomEvent<{ route?: string; result?: BattleResult }>).detail;
  if (detail.route === 'battle') {
    setPhaserVisible(true);
    return;
  }
  setPhaserVisible(false);
  if (detail.result) window.chaosApp?.showResult(detail.result);
  else if (detail.route === 'lobby') window.chaosApp?.showLobby();
  else if (detail.route) window.chaosApp?.navigate(detail.route);
});

const root = createRoot(reactRootEl);
root.render(<App onStartBattle={startBattle} />);

const initialScene = new URLSearchParams(window.location.search).get('scene');
setPhaserVisible(initialScene === 'battle' || initialScene === null);

const getMainScene = (): MainScene | null => {
  const scene = game.scene.getScene('main-scene');
  if (!scene || !scene.sys.isActive()) return null;
  return scene as MainScene;
};

const getLaneX = (lane: Lane): number => {
  if (lane === 'left') return 78;
  if (lane === 'right') return 282;
  return 180;
};

window.render_game_to_text = () => {
  const scene = getMainScene();
  if (scene) return JSON.stringify(scene.debugGetSnapshot());

  const sceneModeOrder = [
    'loading',
    'lobby-scene',
    'shop-scene',
    'deck-scene',
    'main-scene',
    'game-over',
  ] as const;
  const mode = sceneModeOrder.find((sceneKey) => game.scene.isActive(sceneKey)) ?? 'react-ui';

  return JSON.stringify({ mode });
};

window.chaosRenderDiagnostics = () => {
  const rect = game.canvas.getBoundingClientRect();
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer;

  return {
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    renderScale,
    canvasWidth: game.canvas.width,
    canvasHeight: game.canvas.height,
    canvasCssWidth: Math.round(rect.width),
    canvasCssHeight: Math.round(rect.height),
    rendererWidth: renderer.width,
    rendererHeight: renderer.height,
    dpr: window.devicePixelRatio,
    hdMode: renderScale > 1,
  };
};

window.advanceTime = async (ms: number) => {
  const waitMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, waitMs);
  });
};

window.chaosDebug = {
  spawnUnit: (unitKey: string, team: Team = 'blue', x?: number, y?: number) => {
    const scene = getMainScene();
    if (!scene) return false;
    return scene.debugSpawnUnit(unitKey, team, x, y);
  },
  spawnWave: (team: Team = 'blue', unitKeys: string[] = ['stone_cold', 'muradin', 'medusa'], lane: Lane = 'center') => {
    const scene = getMainScene();
    if (!scene) return 0;

    const xBase = getLaneX(lane);
    const yBase = team === 'blue' ? 575 : 82;
    let spawned = 0;

    for (let i = 0; i < unitKeys.length; i++) {
      const offsetX = (i - (unitKeys.length - 1) / 2) * 22;
      const offsetY = (team === 'blue' ? 1 : -1) * i * 6;
      const ok = scene.debugSpawnUnit(unitKeys[i], team, xBase + offsetX, yBase + offsetY);
      if (ok) spawned++;
    }

    return spawned;
  },
  setBlueElixir: (value: number) => {
    const scene = getMainScene();
    if (!scene) return;
    scene.debugSetBlueElixir(value);
  },
  snapshot: () => {
    const scene = getMainScene();
    if (!scene) return null;
    return scene.debugGetSnapshot();
  },
  resetToMain: () => {
    startBattle();
  },
};

export {};
