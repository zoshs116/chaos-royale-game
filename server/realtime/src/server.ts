import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import BattleRoomRegistry from './BattleRoomRegistry';
import { parseClientMessage, type ServerBattleMessage } from './protocol';
import { createServerStorage } from '../../storage';
import { MatchResultService } from '../../services/matches/src';
import type { BattleSnapshot } from '../../match-simulator/src/AuthoritativeBattleRoom';
import { verifyBattleJoin } from './auth';
import { loadRealtimeServerConfig } from './config';

const config = loadRealtimeServerConfig();
const registry = new BattleRoomRegistry();
const storage = await createServerStorage({
    driver: config.storageDriver,
    postgresUrl: config.postgresUrl,
});
const matchResultService = new MatchResultService({ storage });
const submittedRooms = new Set<string>();
const finishedBroadcastRooms = new Set<string>();
const socketsByRoom = new Map<string, Set<WebSocket>>();
const connectionState = new WeakMap<WebSocket, { roomId: string; playerId: string }>();
const socketByPlayer = new Map<string, WebSocket>();
const startedAt = Date.now();

const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
            ok: true,
            service: 'chaos-realtime',
            build: config.serverBuild,
            storage: config.storageDriver,
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        }));
        return;
    }
    response.writeHead(404);
    response.end();
});

const websocketServer = new WebSocketServer({
    server: httpServer,
    path: '/battle',
    maxPayload: 32 * 1024,
    verifyClient: ({ origin }, done) => {
        if (isAllowedOrigin(origin)) {
            done(true);
            return;
        }
        done(false, 403, 'origin not allowed');
    },
});

websocketServer.on('connection', (socket) => {
    const liveSocket = socket as LiveWebSocket;
    liveSocket.isAlive = true;
    socket.on('pong', () => {
        liveSocket.isAlive = true;
    });
    let rateWindowStartedAt = Date.now();
    let rateWindowCount = 0;
    socket.on('message', async (buffer) => {
        try {
            const now = Date.now();
            if (now - rateWindowStartedAt >= 1000) {
                rateWindowStartedAt = now;
                rateWindowCount = 0;
            }
            rateWindowCount += 1;
            if (rateWindowCount > 60) {
                send(socket, { type: 'error', code: 'rate_limited', message: 'too many messages' });
                return;
            }
            const message = parseClientMessage(buffer.toString());
            if (message.type === 'ping') {
                send(socket, { type: 'pong', sentAt: message.sentAt, serverAt: Date.now() });
                return;
            }
            if (message.type === 'join') {
                if (connectionState.has(socket)) throw new Error('socket already joined');
                const verified = await verifyBattleJoin({
                    roomId: message.roomId,
                    token: message.token,
                    player: message.player,
                }, { production: config.production, developmentToken: config.developmentToken });
                const snapshot = registry.join(message.roomId, verified.player);
                const playerKey = `${message.roomId}:${verified.player.playerId}`;
                const previousSocket = socketByPlayer.get(playerKey);
                if (previousSocket && previousSocket !== socket) previousSocket.close(4001, 'connection replaced');
                socketByPlayer.set(playerKey, socket);
                connectionState.set(socket, { roomId: message.roomId, playerId: verified.player.playerId });
                const roomSockets = socketsByRoom.get(message.roomId) ?? new Set<WebSocket>();
                roomSockets.add(socket);
                socketsByRoom.set(message.roomId, roomSockets);
                send(socket, { type: 'joined', snapshot });
                return;
            }
            const connection = connectionState.get(socket);
            if (!connection || connection.roomId !== message.roomId || connection.playerId !== message.command.playerId) {
                send(socket, { type: 'error', code: 'identity_mismatch', message: 'command identity does not match socket' });
                return;
            }
            const result = registry.enqueue(message.roomId, message.command);
            send(socket, {
                type: 'command_result',
                seq: message.command.seq,
                accepted: result.accepted,
                reason: result.reason,
            });
            if (result.accepted) {
                const snapshot = registry.get(message.roomId);
                if (snapshot) broadcastSnapshot(snapshot);
            }
        } catch (error) {
            send(socket, {
                type: 'error',
                code: 'invalid_message',
                message: error instanceof Error ? error.message : 'invalid message',
            });
        }
    });

    socket.on('close', () => {
        const connection = connectionState.get(socket);
        if (!connection) return;
        const playerKey = `${connection.roomId}:${connection.playerId}`;
        if (socketByPlayer.get(playerKey) !== socket) return;
        socketByPlayer.delete(playerKey);
        registry.disconnect(connection.roomId, connection.playerId);
        const roomSockets = socketsByRoom.get(connection.roomId);
        roomSockets?.delete(socket);
        if (roomSockets?.size === 0) socketsByRoom.delete(connection.roomId);
    });
});

let networkFrame = 0;
const tickTimer = setInterval(() => {
    networkFrame += 1;
    for (const snapshot of registry.tick({
        includeRunning: networkFrame % 2 === 0,
        includePaused: networkFrame % 15 === 0,
    })) {
        if (snapshot.state === 'running') {
            broadcastSnapshot(snapshot);
        } else if (snapshot.state === 'finished' && !finishedBroadcastRooms.has(snapshot.roomId)) {
            finishedBroadcastRooms.add(snapshot.roomId);
            broadcastSnapshot(snapshot);
        }
        if (snapshot.state === 'finished' && snapshot.winner && !submittedRooms.has(snapshot.roomId)) {
            submittedRooms.add(snapshot.roomId);
            console.log(`[chaos-realtime] room=${snapshot.roomId} finished winner=${snapshot.winner} reason=${snapshot.finishReason ?? 'unknown'} tick=${snapshot.tick}`);
            void submitAuthoritativeResult(snapshot).catch((error) => {
                submittedRooms.delete(snapshot.roomId);
                console.error('[chaos-realtime] result submission failed', error);
            });
        }
    }
}, 1000 / 30);

const heartbeatTimer = setInterval(() => {
    for (const socket of websocketServer.clients) {
        const liveSocket = socket as LiveWebSocket;
        if (!liveSocket.isAlive) {
            socket.terminate();
            continue;
        }
        liveSocket.isAlive = false;
        socket.ping();
    }
}, 30_000);

httpServer.listen(config.port, config.host, () => {
    const address = httpServer.address();
    const boundPort = typeof address === 'object' && address ? address.port : config.port;
    console.log(`[chaos-realtime] listening on ws://${config.host}:${boundPort}/battle`);
    console.log(`[chaos-realtime] build=${config.serverBuild} storage=${config.storageDriver}`);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[chaos-realtime] ${signal} received, shutting down`);
    clearInterval(tickTimer);
    clearInterval(heartbeatTimer);
    for (const socket of websocketServer.clients) socket.close(1012, 'server restarting');
    const forceTimer = setTimeout(() => {
        for (const socket of websocketServer.clients) socket.terminate();
        httpServer.closeAllConnections();
    }, 8_000);
    forceTimer.unref();
    await Promise.allSettled([
        closeWebSocketServer(),
        closeHttpServer(),
        storage.close(),
    ]);
    clearTimeout(forceTimer);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
httpServer.on('error', (error) => {
    console.error('[chaos-realtime] HTTP server error', error);
    process.exitCode = 1;
    void shutdown('server error');
});

function send(socket: WebSocket, message: ServerBattleMessage): void {
    socket.send(JSON.stringify(message));
}

function broadcastSnapshot(snapshot: BattleSnapshot): void {
    const sockets = socketsByRoom.get(snapshot.roomId);
    if (!sockets) return;
    for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) send(socket, { type: 'snapshot', snapshot });
    }
}

async function submitAuthoritativeResult(snapshot: BattleSnapshot) {
    if (!snapshot.startedAtUtc || !snapshot.endedAtUtc || !snapshot.winner) return;
    const bluePlayers = snapshot.players.filter((player) => player.team === 'blue').map((player) => player.playerId);
    const redPlayers = snapshot.players.filter((player) => player.team === 'red').map((player) => player.playerId);
    const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const normalizedId = snapshot.roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await matchResultService.submitResult({
        matchId: `m_${normalizedId}`,
        queueType: 'custom_1v1',
        startedAtUtc: snapshot.startedAtUtc,
        endedAtUtc: snapshot.endedAtUtc,
        winnerTeamId: snapshot.winner,
        teams: [
            { teamId: 'blue', playerIds: bluePlayers, crowns: snapshot.blueCrowns, kingTowerHp: snapshot.blueKingHp },
            { teamId: 'red', playerIds: redPlayers, crowns: snapshot.redCrowns, kingTowerHp: snapshot.redKingHp },
        ],
        initialStateHash: createHash('sha256').update(`${snapshot.roomId}:initial`).digest('hex'),
        rngSeed: 0,
        inputCount: snapshot.inputCount,
        eventsDigestSha256: digest,
        replayKey: `replays/${normalizedId}.json`,
        serverBuild: config.serverBuild,
    }, Date.now());
    await submitSupabaseResult(snapshot, digest);
}

async function submitSupabaseResult(snapshot: BattleSnapshot, digest: string) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !snapshot.startedAtUtc || !snapshot.endedAtUtc || !snapshot.winner) return;
    const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/apply_match_result`, {
        method: 'POST',
        headers: {
            apikey: config.supabaseServiceRoleKey,
            authorization: `Bearer ${config.supabaseServiceRoleKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            result_room_id: snapshot.roomId,
            result_winner: snapshot.winner,
            result_blue_crowns: snapshot.blueCrowns,
            result_red_crowns: snapshot.redCrowns,
            result_digest: digest,
            result_started_at: snapshot.startedAtUtc,
            result_ended_at: snapshot.endedAtUtc,
        }),
    });
    if (!response.ok) throw new Error(`Supabase result submission failed (${response.status}): ${await response.text()}`);
}

interface LiveWebSocket extends WebSocket {
    isAlive: boolean;
}

function isAllowedOrigin(origin: string | undefined): boolean {
    if (config.allowedOrigins.size === 0) return true;
    if (!origin) return false;
    return config.allowedOrigins.has(origin.replace(/\/$/, ''));
}

function closeWebSocketServer(): Promise<void> {
    return new Promise((resolve) => websocketServer.close(() => resolve()));
}

function closeHttpServer(): Promise<void> {
    return new Promise((resolve) => httpServer.close(() => resolve()));
}
