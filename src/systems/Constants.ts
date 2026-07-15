// ===== Game Constants =====
export const CONSTANTS = {
    SCREEN_WIDTH: 360,
    SCREEN_HEIGHT: 800,

    GRID: {
        ROWS: 32,
        COLS: 18,
        TILE_SIZE: 20,  // 360 / 18 = 20
    },

    // Arena layout Y positions
    ARENA: {
        TOP: 0,
        RIVER_Y: 320,          // River center Y
        RIVER_HEIGHT: 64,       // River thickness
        BRIDGE_LEFT_X: 86,      // Left bridge center X
        BRIDGE_RIGHT_X: 266,    // Right bridge center X
        BRIDGE_WIDTH: 68,
        BOTTOM: 640,
        UI_START: 650,          // Where UI begins
        SPAWN_AREA_BLUE_MIN: 360,   // Blue can spawn below river
        SPAWN_AREA_BLUE_MAX: 680,
        SPAWN_AREA_RED_MIN: 10,
        SPAWN_AREA_RED_MAX: 300,
    },

    TOWERS: {
        KING: {
            hp: 4000,
            damage: 110,
            range: 130,
            attackSpeed: 1000,
            width: 36,
            height: 40,
        },
        PRINCESS: {
            hp: 2500,
            damage: 80,
            range: 180,
            attackSpeed: 800,
            width: 28,
            height: 32,
        },
        // Positions
        BLUE_KING: { x: 180, y: 560 },
        BLUE_PRINCESS_L: { x: 86, y: 496 },
        BLUE_PRINCESS_R: { x: 270, y: 496 },
        RED_KING: { x: 180, y: 118 },
        RED_PRINCESS_L: { x: 86, y: 152 },
        RED_PRINCESS_R: { x: 270, y: 152 },
    },

    GAMEPLAY: {
        BATTLE_TIME: 180,           // 3 minutes in seconds
        OVERTIME_DURATION: 60,       // 1 minute overtime
        ELIXIR_REGEN_RATE: 2800,     // ms per 1 elixir (normal)
        ELIXIR_REGEN_DOUBLE: 1400,   // ms per 1 elixir (double elixir)
        DOUBLE_ELIXIR_TIME: 60,      // Last 60 seconds = double elixir
        MAX_ELIXIR: 10,
        START_ELIXIR: 5,
        SPAWN_DELAY: 500,           // ms delay before unit starts moving
        DECK_SIZE: 8,
        HAND_SIZE: 4,
        SIM_TICK_RATE: 30,          // Fixed simulation tick (Hz)
        SIM_MAX_STEPS_PER_FRAME: 6, // Spiral-of-death guard
        INPUT_DELAY_TICKS: 1,       // Local command delay for deterministic ordering
        COMMAND_HISTORY_LIMIT: 64,  // Keep recent commands for debug snapshot
        INTERPOLATION_DELAY_TICKS: 2,   // Snapshot interpolation delay (ticks)
        MAX_SNAPSHOT_BUFFER: 120,       // Buffered authoritative snapshots
        RECON_SOFT_MAGNITUDE: 0.8,      // Smooth correction threshold
        RECON_HARD_MAGNITUDE: 2.2,      // Snap correction threshold
        RECON_SMOOTH_TICKS: 6,          // Smooth correction duration (ticks)
    },

    COLORS: {
        BLUE_TEAM: 0x3388ee,
        BLUE_TEAM_DARK: 0x2266bb,
        RED_TEAM: 0xdd3333,
        RED_TEAM_DARK: 0xbb2222,
        // 클래시 로얄 스타일 밝은 잔디
        GRASS_BLUE: 0x6abf4a,
        GRASS_RED: 0x5fb843,
        GRASS_LIGHT: 0x7acc5a,   // 체커보드용 밝은 잔디
        // 밝은 강 색상
        RIVER: 0x44bbee,
        RIVER_DARK: 0x339cdd,
        // 따뜻한 나무/갈색 톤
        BRIDGE: 0xa68b5b,
        BRIDGE_DARK: 0x7d6840,
        BRIDGE_PLANK: 0xc4a06e,
        // 성벽/엣지
        WALL_STONE: 0x8b9a6f,
        WALL_DARK: 0x5a6644,
        WALL_EDGE: 0x4a5538,
        // 하단 UI 영역
        UI_PANEL_BG: 0x3d2b1a,      // 나무 프레임 갈색
        UI_PANEL_DARK: 0x2a1d12,     // 더 어두운 갈색
        UI_PANEL_ACCENT: 0x5a422c,   // 밝은 갈색
        // 엘릭서
        ELIXIR: 0xd43790,
        ELIXIR_GLOW: 0xff55bb,
        // 기타
        GOLD: 0xFFD700,
        HP_GREEN: 0x44dd44,
        HP_RED: 0xdd4444,
        HP_BG: 0x333333,
        CROWN_GOLD: 0xffd700,
    },

    DEPTH: {
        MAP_BG: 0,
        MAP_RIVER: 1,
        MAP_BRIDGE: 2,
        MAP_DETAILS: 3,
        TOWER: 24,
        UNIT_SHADOW: 15,
        UNIT: 20,
        PROJECTILE: 25,
        HP_BAR: 30,
        HUD: 100,
        CARD: 110,
        DRAG_CARD: 120,
        OVERLAY: 200,
    }
};
