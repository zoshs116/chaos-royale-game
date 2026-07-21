import { spawn } from 'node:child_process';

const token = 'chaos-production-bundle-smoke';
const server = spawn(process.execPath, ['dist-server/realtime.mjs'], {
    env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: '0',
        CHAOS_STORAGE_DRIVER: 'memory',
        CHAOS_DEV_MULTIPLAYER_TOKEN: token,
        CHAOS_SERVER_BUILD: 'production-bundle-smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let settled = false;
const readinessTimer = setTimeout(() => finish(1, `Server readiness timeout.\n${output}`), 15_000);

server.stdout.on('data', async (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
    const match = output.match(/listening on ws:\/\/[^:]+:(\d+)\/battle/);
    if (!match || settled) return;
    clearTimeout(readinessTimer);
    settled = true;
    try {
        const port = Number(match[1]);
        const health = await fetch(`http://127.0.0.1:${port}/health`);
        if (!health.ok) throw new Error(`Healthcheck failed with ${health.status}`);
        const body = await health.json();
        if (body.ok !== true || body.build !== 'production-bundle-smoke') {
            throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);
        }
        await runWebSocketSmoke(port);
        await stopServer();
        console.log('[realtime-production-smoke] all checks passed');
        process.exit(0);
    } catch (error) {
        await stopServer();
        console.error(error);
        process.exit(1);
    }
});

server.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
});

server.on('exit', (code) => {
    if (!settled) finish(code || 1, output);
});

function runWebSocketSmoke(port) {
    return new Promise((resolve, reject) => {
        const smoke = spawn(process.execPath, [
            'node_modules/tsx/dist/cli.mjs',
            'server/tests/realtime-websocket-smoke.ts',
        ], {
            env: {
                ...process.env,
                CHAOS_REALTIME_TEST_URL: `ws://127.0.0.1:${port}/battle`,
                CHAOS_DEV_MULTIPLAYER_TOKEN: token,
            },
            stdio: 'inherit',
        });
        smoke.once('error', reject);
        smoke.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`WebSocket smoke exited with ${code}`)));
    });
}

function stopServer() {
    if (server.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (server.exitCode === null) server.kill('SIGKILL');
            resolve();
        }, 10_000);
        server.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        server.kill('SIGTERM');
    });
}

function finish(code, message) {
    if (settled) return;
    settled = true;
    clearTimeout(readinessTimer);
    if (message) console.error(message);
    if (server.exitCode === null) server.kill('SIGKILL');
    process.exit(code);
}
