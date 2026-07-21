import assert from 'node:assert/strict';
import WebSocket from 'ws';

interface BattleMessage {
    type: string;
    seq?: number;
    accepted?: boolean;
    sentAt?: number;
    snapshot?: {
        tick: number;
        state: string;
        paused?: boolean;
        disconnectGraceRemainingMs?: number | null;
        winner?: string;
        finishReason?: string;
        units: Array<{ id: string; unitKey: string; attackSerial: number }>;
        projectiles: Array<{ id: string; projectileKey: string }>;
    };
}

const endpoint = process.env.CHAOS_REALTIME_TEST_URL ?? 'ws://127.0.0.1:8787/battle';
const token = process.env.CHAOS_DEV_MULTIPLAYER_TOKEN ?? 'chaos-local-development';
const roomId = `realtime-smoke-${Date.now()}`;
const blue = await connectClient();
const red = await connectClient();
let redReconnect: Awaited<ReturnType<typeof connectClient>> | null = null;

try {
    blue.socket.send(JSON.stringify({
        type: 'join',
        roomId,
        token,
        player: { playerId: 'network-blue', team: 'blue', deck: ['spear_goblin'] },
    }));
    await blue.waitFor((message) => message.type === 'joined');

    red.socket.send(JSON.stringify({
        type: 'join',
        roomId,
        token,
        player: { playerId: 'network-red', team: 'red', deck: ['duckxel_sword_man'] },
    }));
    await red.waitFor((message) => message.type === 'joined' && message.snapshot?.state === 'running');
    await blue.waitFor((message) => message.type === 'snapshot' && message.snapshot?.state === 'running');

    const pingSentAt = Date.now();
    blue.socket.send(JSON.stringify({ type: 'ping', sentAt: pingSentAt }));
    const pong = await blue.waitFor((message) => message.type === 'pong' && message.sentAt === pingSentAt);
    assert.equal(pong.sentAt, pingSentAt);

    blue.socket.send(JSON.stringify({
        type: 'command',
        roomId,
        command: {
            type: 'spawn',
            playerId: 'network-blue',
            seq: 1,
            unitKey: 'spear_goblin',
            x: 86,
            y: 360,
            handIndex: 0,
        },
    }));
    const accepted = await blue.waitFor((message) => message.type === 'command_result' && message.seq === 1);
    assert.equal(accepted.accepted, true);
    const blueState = await blue.waitFor((message) => message.type === 'snapshot' && (message.snapshot?.units.length ?? 0) > 0);
    const redState = await red.waitFor((message) => message.type === 'snapshot' && (message.snapshot?.units.length ?? 0) > 0);
    assert.equal(blueState.snapshot?.units.filter((unit) => unit.unitKey === 'spear_goblin').length, 3);
    assert.equal(redState.snapshot?.units[0]?.id, blueState.snapshot?.units[0]?.id);
    const hasSpear = (message: BattleMessage) => message.type === 'snapshot'
        && message.snapshot?.projectiles.some((projectile) => projectile.projectileKey === 'projectile_spear') === true;
    const blueProjectile = await blue.waitFor(hasSpear);
    const redProjectile = await red.waitFor(hasSpear);
    const blueSpear = blueProjectile.snapshot?.projectiles.find((projectile) => projectile.projectileKey === 'projectile_spear');
    const redSpear = redProjectile.snapshot?.projectiles.find((projectile) => projectile.projectileKey === 'projectile_spear');
    assert(blueSpear);
    assert.equal(redSpear?.id, blueSpear.id);

    const redClosed = new Promise<void>((resolve) => red.socket.once('close', () => resolve()));
    red.socket.close();
    await redClosed;
    const paused = await blue.waitFor((message) => message.type === 'snapshot' && message.snapshot?.paused === true);
    assert((paused.snapshot?.disconnectGraceRemainingMs ?? 0) > 0);

    redReconnect = await connectClient();
    redReconnect.socket.send(JSON.stringify({
        type: 'join',
        roomId,
        token,
        player: { playerId: 'network-red', team: 'red', deck: ['duckxel_sword_man'] },
    }));
    const rejoined = await redReconnect.waitFor((message) => message.type === 'joined' && message.snapshot?.paused === false);
    const resumed = await blue.waitFor((message) => message.type === 'snapshot'
        && message.snapshot?.paused === false
        && (message.snapshot?.tick ?? 0) > (paused.snapshot?.tick ?? 0));
    assert.equal(rejoined.snapshot?.state, 'running');
    assert.equal(resumed.snapshot?.state, 'running');

    redReconnect.socket.send(JSON.stringify({
        type: 'command',
        roomId,
        command: { type: 'forfeit', playerId: 'network-red', seq: 1 },
    }));
    const blueFinished = await blue.waitFor((message) => message.type === 'snapshot' && message.snapshot?.state === 'finished');
    const redFinished = await redReconnect.waitFor((message) => message.type === 'snapshot' && message.snapshot?.state === 'finished');
    assert.equal(blueFinished.snapshot?.winner, 'blue');
    assert.equal(redFinished.snapshot?.winner, 'blue');
    assert.equal(blueFinished.snapshot?.finishReason, 'forfeit');
    console.log('[realtime-websocket-smoke] all checks passed');
} finally {
    blue.socket.close();
    red.socket.close();
    redReconnect?.socket.close();
}

async function connectClient() {
    const socket = new WebSocket(endpoint);
    const messages: BattleMessage[] = [];
    const listeners = new Set<(message: BattleMessage) => void>();
    socket.on('message', (data) => {
        const message = JSON.parse(data.toString()) as BattleMessage;
        messages.push(message);
        for (const listener of listeners) listener(message);
    });
    await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
    });
    return {
        socket,
        waitFor(predicate: (message: BattleMessage) => boolean, timeoutMs = 5_000) {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise<BattleMessage>((resolve, reject) => {
                const timer = setTimeout(() => {
                    listeners.delete(onMessage);
                    reject(new Error(`Timed out waiting for realtime message. Received: ${messages.map((entry) => entry.type).join(', ')}`));
                }, timeoutMs);
                const onMessage = (message: BattleMessage) => {
                    if (!predicate(message)) return;
                    clearTimeout(timer);
                    listeners.delete(onMessage);
                    resolve(message);
                };
                listeners.add(onMessage);
            });
        },
    };
}
