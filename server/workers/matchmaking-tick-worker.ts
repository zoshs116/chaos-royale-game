type WorkerMode = 'http' | 'gateway-operation';

interface TickResult {
    status: number;
    assignments: number;
    message?: string;
}

const intervalMs = parsePositiveInt(process.env.CHAOS_MATCHMAKING_TICK_INTERVAL_MS, 1000);
const workerMode = resolveWorkerMode(process.env.CHAOS_MATCHMAKING_WORKER_MODE);
const gatewayBaseUrl = process.env.CHAOS_GATEWAY_URL ?? 'http://127.0.0.1:8787';

let stopping = false;

process.on('SIGINT', () => {
    stopping = true;
});

process.on('SIGTERM', () => {
    stopping = true;
});

void startWorker();

async function startWorker(): Promise<void> {
    log(`worker started mode=${workerMode} intervalMs=${intervalMs}`);

    while (!stopping) {
        const nowMs = Date.now();
        try {
            const result = workerMode === 'http'
                ? await runHttpTick(nowMs)
                : await runGatewayOperationTick(nowMs);

            log(`tick status=${result.status} assignments=${result.assignments}${suffixMessage(result.message)}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            log(`tick failed error=${message}`);
        }

        await delay(intervalMs);
    }

    log('worker stopped');
}

async function runHttpTick(nowMs: number): Promise<TickResult> {
    const response = await fetch(`${gatewayBaseUrl}/v1/matchmaking/tick`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            nowMs
        })
    });

    const payload = await response.json() as { assignments?: unknown[]; message?: string };
    return {
        status: response.status,
        assignments: Array.isArray(payload.assignments) ? payload.assignments.length : 0,
        message: payload.message
    };
}

async function runGatewayOperationTick(nowMs: number): Promise<TickResult> {
    const gatewayModule = await import('../gateway/src/index');
    const result = await gatewayModule.dispatchGatewayOperation('runMatchmakingTick', {
        nowMs
    });

    const body = result.body as { assignments?: unknown[]; message?: string };
    return {
        status: result.status,
        assignments: Array.isArray(body.assignments) ? body.assignments.length : 0,
        message: body.message
    };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function resolveWorkerMode(value: string | undefined): WorkerMode {
    if (value === 'http' || value === 'gateway-operation') {
        return value;
    }
    return 'http';
}

function suffixMessage(message: string | undefined): string {
    return message ? ` message=${message}` : '';
}

function log(message: string): void {
    const utc = new Date().toISOString();
    console.log(`[matchmaking-worker] ${utc} ${message}`);
}

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
