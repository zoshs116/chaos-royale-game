import { spawn, spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const loadedEnvironment = loadEnv('development', process.cwd(), '');
const developmentToken = loadedEnvironment.CHAOS_DEV_MULTIPLAYER_TOKEN
    || process.env.CHAOS_DEV_MULTIPLAYER_TOKEN
    || 'chaos-local-development';
const childEnvironment = {
    ...process.env,
    ...loadedEnvironment,
    VITE_BATTLE_WS_URL: process.env.VITE_BATTLE_WS_URL ?? 'ws://127.0.0.1:8787/battle',
    CHAOS_STORAGE_DRIVER: loadedEnvironment.CHAOS_STORAGE_DRIVER
        || process.env.CHAOS_STORAGE_DRIVER
        || 'memory',
    CHAOS_DEV_MULTIPLAYER_TOKEN: developmentToken,
    VITE_CHAOS_DEV_MULTIPLAYER_TOKEN: developmentToken,
};

const runBuildStep = (label, args) => {
    console.log(`[dev:multiplayer] ${label}`);
    const result = spawnSync(process.execPath, args, {
        stdio: 'inherit',
        env: childEnvironment,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
};

runBuildStep('type-checking client', ['node_modules/typescript/bin/tsc']);
runBuildStep('building client', ['node_modules/vite/bin/vite.js', 'build']);

const processes = [
    spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/gateway/src/httpServer.ts'], {
        stdio: 'inherit',
        env: childEnvironment,
    }),
    spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/realtime/src/server.ts'], {
        stdio: 'inherit',
        env: childEnvironment,
    }),
    spawn(process.execPath, [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '5222',
        '--strictPort',
    ], {
        stdio: 'inherit',
        env: childEnvironment,
    }),
];

let closing = false;
const shutdown = (exitCode = 0) => {
    if (closing) return;
    closing = true;
    for (const child of processes) {
        if (!child.killed) child.kill('SIGTERM');
    }
    setTimeout(() => process.exit(exitCode), 250);
};

for (const child of processes) {
    child.once('exit', (code, signal) => {
        if (closing) return;
        if (signal) console.error(`[dev:multiplayer] child stopped by ${signal}`);
        shutdown(code ?? 1);
    });
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
