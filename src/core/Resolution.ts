import Phaser from 'phaser';

export const LOGICAL_WIDTH = 360;
export const LOGICAL_HEIGHT = 800;
export const DEFAULT_RENDER_SCALE = 2;

export interface LayoutMetrics {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    renderScale: number;
    renderWidth: number;
    renderHeight: number;
    safeTop: number;
    safeBottom: number;
    bottomNavY: number;
}

export interface PointerPoint {
    x: number;
    y: number;
}

export const getRenderScale = (): number => {
    if (typeof window === 'undefined') return DEFAULT_RENDER_SCALE;

    const params = new URLSearchParams(window.location.search);
    const raw = params.get('renderScale') ?? params.get('rs');

    if (raw) {
        const requested = Number(raw);
        if (Number.isFinite(requested)) return Phaser.Math.Clamp(requested, 1, 3);
    }

    if (params.get('sd') === '1') return 1;
    if (params.get('hd') === '1') return 2;

    return DEFAULT_RENDER_SCALE;
};

export const getLayout = (renderScale = getRenderScale()): LayoutMetrics => ({
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    centerX: LOGICAL_WIDTH / 2,
    centerY: LOGICAL_HEIGHT / 2,
    renderScale,
    renderWidth: LOGICAL_WIDTH * renderScale,
    renderHeight: LOGICAL_HEIGHT * renderScale,
    safeTop: 0,
    safeBottom: LOGICAL_HEIGHT,
    bottomNavY: LOGICAL_HEIGHT - 80,
});

export const configureLogicalCamera = (scene: Phaser.Scene, renderScale = getRenderScale()) => {
    const camera = scene.cameras.main;
    camera.setViewport(0, 0, LOGICAL_WIDTH * renderScale, LOGICAL_HEIGHT * renderScale);
    camera.setZoom(renderScale);
    camera.setScroll(0, 0);
    camera.setBounds(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
};

export const getPointerLogicalPosition = (pointer: Phaser.Input.Pointer): PointerPoint => {
    const camera = pointer.camera;
    if (camera) {
        return {
            x: pointer.worldX,
            y: pointer.worldY,
        };
    }

    const scale = getRenderScale();
    return {
        x: pointer.x / scale,
        y: pointer.y / scale,
    };
};

