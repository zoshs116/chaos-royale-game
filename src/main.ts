import Phaser from 'phaser';
import './style.css';
import LoadingScene from './scenes/LoadingScene';
import LobbyScene from './scenes/LobbyScene';
import ShopScene from './scenes/ShopScene';
import DeckScene from './scenes/DeckScene';
import MainScene from './scenes/MainScene';
import GameOverScene from './scenes/GameOverScene';
import { getLayout, getRenderScale, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './core/Resolution';

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
  }
}

const isAutomationRun = (() => {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('automation') === '1') return true;
  }
  return false;
})();

const renderScale = getRenderScale();
const layout = getLayout(renderScale);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: layout.renderWidth,
  height: layout.renderHeight,
  parent: 'app',
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
    // Keep the WebGL backbuffer readable during headless QA captures.
    preserveDrawingBuffer: isAutomationRun,
  },
  scene: [LoadingScene, LobbyScene, ShopScene, DeckScene, MainScene, GameOverScene],
};

const game = new Phaser.Game(config);
window.chaosGame = game;

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
  if (scene) {
    return JSON.stringify(scene.debugGetSnapshot());
  }

  const sceneModeOrder = [
    'loading',
    'lobby-scene',
    'shop-scene',
    'deck-scene',
    'main-scene',
    'game-over',
  ] as const;
  const mode = sceneModeOrder.find((sceneKey) => game.scene.isActive(sceneKey)) ?? 'boot';

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
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
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
    game.scene.start('main-scene');
  },
};

export { };
