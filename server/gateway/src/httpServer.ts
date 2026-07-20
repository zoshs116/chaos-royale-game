import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { GATEWAY_ROUTE_MANIFEST, type GatewayRouteSpec } from './app';
import {
    closeGatewayResources,
    dispatchGatewayOperation,
    type GatewayOperationId,
} from './handlers';

const port = Number(process.env.CHAOS_GATEWAY_PORT ?? 8788);
const host = process.env.CHAOS_GATEWAY_HOST ?? '127.0.0.1';
const devToken = process.env.CHAOS_DEV_MULTIPLAYER_TOKEN ?? '';
const production = process.env.NODE_ENV === 'production';

const server = createServer(async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
    }
    if (request.url === '/health') {
        sendJson(response, 200, { ok: true, service: 'chaos-gateway' });
        return;
    }
    if (!isAuthorized(request)) {
        sendJson(response, 401, { code: 'unauthorized', message: 'missing or invalid development token' });
        return;
    }

    try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const match = findRoute(request.method ?? 'GET', url.pathname);
        if (!match) {
            sendJson(response, 404, { code: 'route_not_found', message: 'route not found' });
            return;
        }
        const body = request.method === 'POST' ? await readJsonBody(request) : undefined;
        const result = await dispatchGatewayOperation(match.route.operationId as GatewayOperationId, {
            body,
            params: match.params,
        });
        sendJson(response, result.status, result.body);
    } catch (error) {
        sendJson(response, 400, {
            code: 'bad_request',
            message: error instanceof Error ? error.message : 'invalid request',
        });
    }
});

server.listen(port, host, () => {
    console.log(`[chaos-gateway] listening on http://${host}:${port}`);
});

const shutdown = () => {
    server.close();
    void closeGatewayResources();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function findRoute(method: string, pathname: string): { route: GatewayRouteSpec; params: Record<string, string> } | null {
    for (const route of GATEWAY_ROUTE_MANIFEST) {
        if (route.method !== method) continue;
        const names: string[] = [];
        const pattern = route.path.replace(/\{([^}]+)\}/g, (_full, name: string) => {
            names.push(name);
            return '([^/]+)';
        });
        const match = pathname.match(new RegExp(`^${pattern}$`));
        if (!match) continue;
        const params: Record<string, string> = {};
        names.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1] ?? '');
        });
        return { route, params };
    }
    return null;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 64 * 1024) throw new Error('request body is too large');
        chunks.push(buffer);
    }
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isAuthorized(request: IncomingMessage): boolean {
    if (!devToken) return !production;
    return request.headers['x-chaos-dev-token'] === devToken;
}

function setCors(response: ServerResponse): void {
    response.setHeader('access-control-allow-origin', process.env.CHAOS_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5222');
    response.setHeader('access-control-allow-headers', 'content-type,x-chaos-dev-token');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}
