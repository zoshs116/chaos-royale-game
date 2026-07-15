import Phaser from 'phaser';
import { CONSTANTS } from './Constants';
import GameMap, { TileType } from './GameMap';

/**
 * 클래시 로얄 스타일 아레나 렌더러
 * - 밝은 잔디 체커보드
 * - 양쪽 성벽/나무 엣지
 * - 나무 다리
 * - 따뜻한 갈색 하단 UI 패널
 */
export default class MapRenderer {
    private scene: Phaser.Scene;
    private gameMap: GameMap;
    private riverTiles: Phaser.GameObjects.Rectangle[] = [];
    private riverPulse: number = 0;
    private riverGlow: Phaser.GameObjects.Rectangle | null = null;
    private riverShine: Phaser.GameObjects.Rectangle | null = null;

    constructor(scene: Phaser.Scene, gameMap: GameMap) {
        this.scene = scene;
        this.gameMap = gameMap;
    }

    render() {
        this.drawBackground();
        this.drawSideWalls();
        this.drawRiver();
        this.drawBridges();
        this.drawLaneLines();
        this.drawTowerZones();
        this.drawArenaDecorations();
        this.drawUIPanel();
    }

    /** 픽셀 아트 스타일 잔디 배경 */
    private drawBackground() {
        const tileSize = this.gameMap.getTileSize();
        const grid = this.gameMap.getGrid();
        const hasTexture = this.scene.textures.exists('grass_light');

        if (hasTexture) {
            // 픽셀 아트 텍스처 기반 배경 - 2x2 타일 단위 체커보드
            const checkerSize = tileSize * 2;
            const cols = Math.ceil(CONSTANTS.SCREEN_WIDTH / checkerSize);
            const rows = Math.ceil(CONSTANTS.ARENA.UI_START / checkerSize);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cx = c * checkerSize + checkerSize / 2;
                    const cy = r * checkerSize + checkerSize / 2;
                    const isLight = (r + c) % 2 === 0;

                    const tile = this.scene.add.image(cx, cy, 'grass_light');
                    tile.setDisplaySize(checkerSize, checkerSize);
                    tile.setDepth(CONSTANTS.DEPTH.MAP_BG);

                    // 어두운 칸은 약간의 틴트로 대비
                    if (!isLight) {
                        tile.setTint(0xd8e8c0);
                    }
                }
            }
        } else {
            // 폴백: 색상 기반 체커보드
            for (let row = 0; row < grid.length; row++) {
                for (let col = 0; col < grid[row].length; col++) {
                    if (grid[row][col] === TileType.GROUND || grid[row][col] === TileType.BRIDGE) {
                        const y = row * tileSize;
                        const isRedSide = y < CONSTANTS.ARENA.RIVER_Y;
                        const baseColor = isRedSide ? CONSTANTS.COLORS.GRASS_RED : CONSTANTS.COLORS.GRASS_BLUE;
                        const checkerRow = Math.floor(row / 2);
                        const checkerCol = Math.floor(col / 2);
                        const isLight = (checkerRow + checkerCol) % 2 === 0;
                        const offset = isLight ? 8 : -3;
                        const color = this.shiftColor(baseColor, offset);

                        const tile = this.scene.add.rectangle(
                            col * tileSize + tileSize / 2,
                            y + tileSize / 2,
                            tileSize,
                            tileSize,
                            color
                        );
                        tile.setDepth(CONSTANTS.DEPTH.MAP_BG);
                    }
                }
            }
        }

        // 가장자리 약간 어둡게
        const topEdge = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, 5,
            CONSTANTS.SCREEN_WIDTH, 10,
            0x4a6330, 0.45
        );
        topEdge.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

        const bottomEdge = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, CONSTANTS.ARENA.UI_START - 5,
            CONSTANTS.SCREEN_WIDTH, 10,
            0x3a5525, 0.4
        );
        bottomEdge.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
    }

    /** 양쪽 석재/나무 성벽 (클래시 로얄 특유의 양쪽 벽) */
    private drawSideWalls() {
        if (
            this.scene.textures.exists('stitch_arena_side_wall_left')
            && this.scene.textures.exists('stitch_arena_side_wall_right')
        ) {
            const segmentH = 315;
            const xLeft = 17;
            const xRight = CONSTANTS.SCREEN_WIDTH - 17;
            for (const y of [178, 493]) {
                const left = this.scene.add.image(xLeft, y, 'stitch_arena_side_wall_left');
                left.setDisplaySize(30, segmentH);
                left.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

                const right = this.scene.add.image(xRight, y, 'stitch_arena_side_wall_right');
                right.setDisplaySize(30, segmentH);
                right.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
            }
            return;
        }

        const wallWidth = 14;
        const arenaHeight = CONSTANTS.ARENA.UI_START;

        // 좌측 벽
        const leftWallBg = this.scene.add.rectangle(
            wallWidth / 2, arenaHeight / 2,
            wallWidth, arenaHeight,
            CONSTANTS.COLORS.WALL_STONE, 0.85
        );
        leftWallBg.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

        const leftWallEdge = this.scene.add.rectangle(
            wallWidth, arenaHeight / 2,
            3, arenaHeight,
            CONSTANTS.COLORS.WALL_DARK, 0.6
        );
        leftWallEdge.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

        // 우측 벽
        const rightWallBg = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH - wallWidth / 2, arenaHeight / 2,
            wallWidth, arenaHeight,
            CONSTANTS.COLORS.WALL_STONE, 0.85
        );
        rightWallBg.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

        const rightWallEdge = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH - wallWidth, arenaHeight / 2,
            3, arenaHeight,
            CONSTANTS.COLORS.WALL_DARK, 0.6
        );
        rightWallEdge.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

        // 벽 디테일: 세로줄 무늬
        for (let y = 10; y < arenaHeight; y += 32) {
            if (y > CONSTANTS.ARENA.RIVER_Y - 24 && y < CONSTANTS.ARENA.RIVER_Y + 24) continue;

            // 좌측 기둥 돌
            const leftStone = this.scene.add.rectangle(
                wallWidth / 2, y,
                wallWidth - 2, 2,
                CONSTANTS.COLORS.WALL_DARK, 0.4
            );
            leftStone.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);

            // 우측 기둥 돌
            const rightStone = this.scene.add.rectangle(
                CONSTANTS.SCREEN_WIDTH - wallWidth / 2, y,
                wallWidth - 2, 2,
                CONSTANTS.COLORS.WALL_DARK, 0.4
            );
            rightStone.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        }

        // 성벽 위 나무/울타리 (상단과 하단)
        this.drawFencePost(0, CONSTANTS.ARENA.RIVER_Y - 55);
        this.drawFencePost(0, CONSTANTS.ARENA.RIVER_Y + 55);
        this.drawFencePost(CONSTANTS.SCREEN_WIDTH - wallWidth, CONSTANTS.ARENA.RIVER_Y - 55);
        this.drawFencePost(CONSTANTS.SCREEN_WIDTH - wallWidth, CONSTANTS.ARENA.RIVER_Y + 55);
    }

    /** 울타리 기둥 */
    private drawFencePost(x: number, y: number) {
        const post = this.scene.add.rectangle(
            x + 7, y, 6, 18,
            0x6b5234, 0.7
        );
        post.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 2);

        const cap = this.scene.add.rectangle(
            x + 7, y - 10, 8, 4,
            0x8a6b45, 0.8
        );
        cap.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 2);
    }

    /** 밝은 청록색 강 */
    private drawRiver() {
        if (this.scene.textures.exists('stitch_arena_river_strip')) {
            const river = this.scene.add.image(
                CONSTANTS.SCREEN_WIDTH / 2,
                CONSTANTS.ARENA.RIVER_Y,
                'stitch_arena_river_strip',
            );
            river.setDisplaySize(CONSTANTS.SCREEN_WIDTH, CONSTANTS.ARENA.RIVER_HEIGHT);
            river.setDepth(CONSTANTS.DEPTH.MAP_RIVER);
            return;
        }

        const tileSize = this.gameMap.getTileSize();
        const grid = this.gameMap.getGrid();

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                if (grid[row][col] === TileType.RIVER) {
                    const bright = (row + col) % 2 === 0;
                    const tile = this.scene.add.rectangle(
                        col * tileSize + tileSize / 2,
                        row * tileSize + tileSize / 2,
                        tileSize,
                        tileSize,
                        bright ? CONSTANTS.COLORS.RIVER : CONSTANTS.COLORS.RIVER_DARK
                    );
                    tile.setDepth(CONSTANTS.DEPTH.MAP_RIVER);
                    this.riverTiles.push(tile);
                }
            }
        }

        const riverTop = CONSTANTS.ARENA.RIVER_Y - CONSTANTS.ARENA.RIVER_HEIGHT / 2;
        const riverBottom = CONSTANTS.ARENA.RIVER_Y + CONSTANTS.ARENA.RIVER_HEIGHT / 2;

        // 강 상단 하이라이트 (밝은 청록 에지)
        const edgeTop = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, riverTop,
            CONSTANTS.SCREEN_WIDTH, 3,
            0x88ddff, 0.5
        );
        edgeTop.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

        // 강 하단 그림자 에지
        const edgeBottom = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, riverBottom,
            CONSTANTS.SCREEN_WIDTH, 3,
            0x1a6699, 0.6
        );
        edgeBottom.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

        // 강 글로우 효과
        this.riverGlow = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, CONSTANTS.ARENA.RIVER_Y,
            CONSTANTS.SCREEN_WIDTH - 28, CONSTANTS.ARENA.RIVER_HEIGHT + 10,
            0x66ddff, 0.12
        );
        this.riverGlow.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

        // 강 반짝이 효과
        this.riverShine = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, CONSTANTS.ARENA.RIVER_Y - 5,
            CONSTANTS.SCREEN_WIDTH - 38, 3,
            0xe0f8ff, 0.3
        );
        this.riverShine.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
    }

    /** 나무 다리 (클래시 로얄 스타일) */
    private drawBridges() {
        const bridgeY = CONSTANTS.ARENA.RIVER_Y;
        const h = CONSTANTS.ARENA.RIVER_HEIGHT + 54;

        this.drawBridge(CONSTANTS.ARENA.BRIDGE_LEFT_X, bridgeY, CONSTANTS.ARENA.BRIDGE_WIDTH, h);
        this.drawBridge(CONSTANTS.ARENA.BRIDGE_RIGHT_X, bridgeY, CONSTANTS.ARENA.BRIDGE_WIDTH, h);
    }

    private drawBridge(x: number, y: number, w: number, h: number) {
        // 그림자
        const shadow = this.scene.add.rectangle(x, y + 4, w + 8, h + 6, 0x000000, 0.3);
        shadow.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 다리 베이스 (갈색 나무)
        const base = this.scene.add.rectangle(x, y, w + 4, h + 2, CONSTANTS.COLORS.BRIDGE_DARK);
        base.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 다리 상판 (밝은 나무)
        const topLayer = this.scene.add.rectangle(x, y, w, h - 2, CONSTANTS.COLORS.BRIDGE);
        topLayer.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 좌측 난간
        const leftRail = this.scene.add.rectangle(x - w / 2 + 3, y, 6, h, CONSTANTS.COLORS.BRIDGE_DARK, 0.9);
        leftRail.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 우측 난간
        const rightRail = this.scene.add.rectangle(x + w / 2 - 3, y, 6, h, CONSTANTS.COLORS.BRIDGE_DARK, 0.9);
        rightRail.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 가로 판자 (클래시 로얄의 가로 나무 뗏목 느낌)
        const plankCount = 6;
        for (let i = 0; i < plankCount; i++) {
            const py = y - h / 2 + (h / (plankCount + 1)) * (i + 1);
            const plankColor = i % 2 === 0 ? CONSTANTS.COLORS.BRIDGE_PLANK : CONSTANTS.COLORS.BRIDGE;
            const plank = this.scene.add.rectangle(x, py, w - 10, 3, plankColor, 0.6);
            plank.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);
        }

        // 상단 하이라이트
        const highlight = this.scene.add.rectangle(x, y - h / 2 + 4, w - 8, 2, 0xdec49a, 0.35);
        highlight.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);

        // 리벳/못
        for (let i = 0; i < 3; i++) {
            const py = y - h / 2 + 10 + i * 14;
            const rivetL = this.scene.add.circle(x - w / 2 + 6, py, 1.5, 0xdec49a, 0.7);
            rivetL.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);
            const rivetR = this.scene.add.circle(x + w / 2 - 6, py, 1.5, 0xdec49a, 0.7);
            rivetR.setDepth(CONSTANTS.DEPTH.MAP_BRIDGE);
        }
    }

    /** 중앙 차선 구분선 */
    private drawLaneLines() {
        const centerX = CONSTANTS.SCREEN_WIDTH / 2;

        // 상단 (적팀 영역) 라인
        for (let y = 12; y < CONSTANTS.ARENA.RIVER_Y - 24; y += 30) {
            const dash = this.scene.add.rectangle(centerX, y, 2, 8, 0x3d6a30, 0.3);
            dash.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
        }

        // 하단 (아군 영역) 라인
        for (let y = CONSTANTS.ARENA.RIVER_Y + 28; y < CONSTANTS.ARENA.UI_START - 8; y += 30) {
            const dash = this.scene.add.rectangle(centerX, y, 2, 8, 0x3d6a30, 0.3);
            dash.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
        }
    }

    /** 타워 영역 표시 (클래시 로얄의 석재 바닥판 느낌) */
    private drawTowerZones() {
        return;
        const positions = [
            CONSTANTS.TOWERS.BLUE_KING,
            CONSTANTS.TOWERS.BLUE_PRINCESS_L,
            CONSTANTS.TOWERS.BLUE_PRINCESS_R,
            CONSTANTS.TOWERS.RED_KING,
            CONSTANTS.TOWERS.RED_PRINCESS_L,
            CONSTANTS.TOWERS.RED_PRINCESS_R,
        ];

        for (const pos of positions) {
            const isBlue = pos.y > CONSTANTS.ARENA.RIVER_Y;
            const isKing = pos === CONSTANTS.TOWERS.BLUE_KING || pos === CONSTANTS.TOWERS.RED_KING;
            const size = isKing ? 28 : 22;

            // 석재 바닥판 (사각형)
            const plateShadow = this.scene.add.rectangle(pos.x, pos.y + 2, size * 2 + 6, size * 2 + 6, 0x000000, 0.2);
            plateShadow.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

            const plate = this.scene.add.rectangle(pos.x, pos.y, size * 2 + 4, size * 2 + 4, 0x8a7b62, 0.45);
            plate.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

            const plateInner = this.scene.add.rectangle(pos.x, pos.y, size * 2, size * 2, 0x9a8b72, 0.3);
            plateInner.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);

            // 팀 컬러 글로우
            const teamTint = isBlue ? 0x7eb7ff : 0xff9a8e;
            const teamGlow = this.scene.add.circle(pos.x, pos.y, size - 2, teamTint, 0.08);
            teamGlow.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
        }
    }

    /** 아레나 장식 및 잔디 디테일, 하단 UI는 별도 메서드로 이동 */
    private drawArenaDecorations() {
        if (this.scene.textures.exists('stitch_arena_decor_red_top')) {
            const redDecor = this.scene.add.image(
                CONSTANTS.SCREEN_WIDTH / 2,
                72,
                'stitch_arena_decor_red_top',
            );
            redDecor.setDisplaySize(CONSTANTS.SCREEN_WIDTH - 42, 70);
            redDecor.setAlpha(0.82);
            redDecor.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        }

        if (this.scene.textures.exists('stitch_arena_decor_blue_bottom')) {
            const blueDecor = this.scene.add.image(
                CONSTANTS.SCREEN_WIDTH / 2,
                CONSTANTS.ARENA.UI_START - 28,
                'stitch_arena_decor_blue_bottom',
            );
            blueDecor.setDisplaySize(CONSTANTS.SCREEN_WIDTH - 42, 56);
            blueDecor.setAlpha(0.74);
            blueDecor.setDepth(CONSTANTS.DEPTH.MAP_DETAILS + 1);
        }

        const rng = new Phaser.Math.RandomDataGenerator(['arena-cr']);

        // 잔디 터프트 (작은 풀)
        for (let i = 0; i < 35; i++) {
            const x = rng.between(18, CONSTANTS.SCREEN_WIDTH - 18);
            const y = rng.between(12, CONSTANTS.ARENA.UI_START - 12);

            if (y > CONSTANTS.ARENA.RIVER_Y - 24 && y < CONSTANTS.ARENA.RIVER_Y + 24) continue;
            if (this.isInsideBridgeVisual(x, y)) continue;

            const size = rng.between(2, 4);
            const isRed = y < CONSTANTS.ARENA.RIVER_Y;
            const baseC = isRed ? CONSTANTS.COLORS.GRASS_RED : CONSTANTS.COLORS.GRASS_BLUE;
            const shade = rng.between(-10, 16);
            const color = this.shiftColor(baseC, shade);

            const tuft = this.scene.add.rectangle(x, y, size, size + 1, color, 0.65);
            tuft.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
        }

        // 작은 꽃/돌
        for (let i = 0; i < 8; i++) {
            const x = rng.between(20, CONSTANTS.SCREEN_WIDTH - 20);
            const y = rng.between(18, CONSTANTS.ARENA.UI_START - 18);
            if (y > CONSTANTS.ARENA.RIVER_Y - 30 && y < CONSTANTS.ARENA.RIVER_Y + 30) continue;
            if (this.isInsideBridgeVisual(x, y)) continue;
            const color = rng.pick([0xf0e68c, 0xff9999, 0xffccff, 0xddddaa]);
            const flower = this.scene.add.circle(x, y, 1.5, color, 0.4);
            flower.setDepth(CONSTANTS.DEPTH.MAP_DETAILS);
        }
    }

    /** 클래시 로얄 스타일 하단 UI 패널 (나무 프레임) */
    private isInsideBridgeVisual(x: number, y: number) {
        const bridgeHalfW = CONSTANTS.ARENA.BRIDGE_WIDTH / 2 + 4;
        const bridgeHalfH = (CONSTANTS.ARENA.RIVER_HEIGHT + 54) / 2 + 4;
        const inBridgeY = Math.abs(y - CONSTANTS.ARENA.RIVER_Y) <= bridgeHalfH;
        if (!inBridgeY) return false;
        return Math.abs(x - CONSTANTS.ARENA.BRIDGE_LEFT_X) <= bridgeHalfW
            || Math.abs(x - CONSTANTS.ARENA.BRIDGE_RIGHT_X) <= bridgeHalfW;
    }

    private drawUIPanel() {
        const uiStartY = CONSTANTS.ARENA.UI_START;
        const panelH = CONSTANTS.SCREEN_HEIGHT - uiStartY;
        const panelCenterY = uiStartY + panelH / 2;

        // 나무 프레임 배경
        const panelBg = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, panelCenterY,
            CONSTANTS.SCREEN_WIDTH, panelH,
            0x0b1020, 0.96
        );
        panelBg.setDepth(CONSTANTS.DEPTH.HUD - 2);
        panelBg.setStrokeStyle(1, 0x303a56, 0.9);

        // 상단 나무 프레임 라인
        const frameTop = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, uiStartY + 1,
            CONSTANTS.SCREEN_WIDTH - 24, 2,
            0x6273ac, 0.9
        );
        frameTop.setDepth(CONSTANTS.DEPTH.HUD + 1);

        // 프레임 상단 하이라이트
        const frameHighlight = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, uiStartY + 4,
            CONSTANTS.SCREEN_WIDTH - 42, 1,
            0xf4b7ff, 0.25
        );
        frameHighlight.setDepth(CONSTANTS.DEPTH.HUD + 1);

        // 프레임 상단 그림자
        const frameShadow = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, uiStartY - 2,
            CONSTANTS.SCREEN_WIDTH, 6,
            0x000000, 0.45
        );
        frameShadow.setDepth(CONSTANTS.DEPTH.HUD);

        // 패널 내부 약간 어두운 영역
        const innerPanel = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, panelCenterY + 2,
            CONSTANTS.SCREEN_WIDTH - 18, panelH - 18,
            0x171f33, 0.72
        );
        innerPanel.setDepth(CONSTANTS.DEPTH.HUD - 1);
        innerPanel.setStrokeStyle(1, 0x445071, 0.65);

        // 하단 비네트
        const bottomVignette = this.scene.add.rectangle(
            CONSTANTS.SCREEN_WIDTH / 2, CONSTANTS.SCREEN_HEIGHT - 5,
            CONSTANTS.SCREEN_WIDTH, 10,
            0x000000, 0.5
        );
        bottomVignette.setDepth(CONSTANTS.DEPTH.HUD - 1);
    }

    /**
     * 강 애니메이션 (물 흐르는 효과)
     */
    update(_time: number, delta: number) {
        this.riverPulse += delta * 0.004;

        const t = (Math.sin(this.riverPulse) + 1) / 2;
        const low = Phaser.Display.Color.IntegerToColor(CONSTANTS.COLORS.RIVER_DARK);
        const high = Phaser.Display.Color.IntegerToColor(CONSTANTS.COLORS.RIVER);
        const blend = Phaser.Display.Color.Interpolate.ColorWithColor(low, high, 100, Math.floor(t * 100));
        const riverTone = Phaser.Display.Color.GetColor(blend.r, blend.g, blend.b);

        for (let i = 0; i < this.riverTiles.length; i++) {
            const tile = this.riverTiles[i];
            const offset = ((i % 4) - 1.5) * 2;
            tile.setFillStyle(this.shiftColor(riverTone, offset));
        }

        if (this.riverShine) {
            this.riverShine.y = CONSTANTS.ARENA.RIVER_Y - 5 + Math.sin(this.riverPulse * 1.3) * 2;
            this.riverShine.setAlpha(0.2 + t * 0.2);
        }

        if (this.riverGlow) {
            this.riverGlow.setAlpha(0.08 + (1 - t) * 0.1);
        }
    }

    private shiftColor(base: number, amount: number): number {
        const c = Phaser.Display.Color.IntegerToColor(base);
        return Phaser.Display.Color.GetColor(
            Phaser.Math.Clamp(c.red + amount, 0, 255),
            Phaser.Math.Clamp(c.green + amount, 0, 255),
            Phaser.Math.Clamp(c.blue + amount, 0, 255)
        );
    }
}
