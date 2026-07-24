export interface ClockSample {
    rttMs: number;
    offsetMs: number;
}

export interface ClockDiagnostics {
    rttMs: number;
    jitterMs: number;
    offsetMs: number;
    sampleCount: number;
}

const MAX_SAMPLES = 16;

export default class ServerClockEstimator {
    private readonly samples: ClockSample[] = [];
    private jitterMs = 0;
    private previousRttMs: number | null = null;

    public reset(): void {
        this.samples.length = 0;
        this.jitterMs = 0;
        this.previousRttMs = null;
    }

    public addPong(sentAtMs: number, receivedAtMs: number, serverAtMs: number): ClockDiagnostics {
        const rttMs = Math.max(0, receivedAtMs - sentAtMs);
        const midpointMs = sentAtMs + rttMs / 2;
        this.addSample({ rttMs, offsetMs: serverAtMs - midpointMs });
        if (this.previousRttMs !== null) {
            const variation = Math.abs(rttMs - this.previousRttMs);
            this.jitterMs += (variation - this.jitterMs) * 0.2;
        }
        this.previousRttMs = rttMs;
        return this.getDiagnostics();
    }

    public bootstrap(serverTimeMs: number, receivedAtMs: number): void {
        if (this.samples.length > 0) return;
        this.addSample({ rttMs: 0, offsetMs: serverTimeMs - receivedAtMs });
    }

    public estimateServerTime(clientNowMs: number): number {
        return clientNowMs + this.getDiagnostics().offsetMs;
    }

    public getDiagnostics(): ClockDiagnostics {
        if (this.samples.length === 0) {
            return { rttMs: 0, jitterMs: this.jitterMs, offsetMs: 0, sampleCount: 0 };
        }
        const byRtt = [...this.samples].sort((a, b) => a.rttMs - b.rttMs);
        const reliable = byRtt.slice(0, Math.max(1, Math.ceil(byRtt.length / 2)));
        const offsets = reliable.map(sample => sample.offsetMs).sort((a, b) => a - b);
        const rtts = reliable.map(sample => sample.rttMs).sort((a, b) => a - b);
        return {
            rttMs: median(rtts),
            jitterMs: this.jitterMs,
            offsetMs: median(offsets),
            sampleCount: this.samples.length,
        };
    }

    private addSample(sample: ClockSample): void {
        this.samples.push(sample);
        if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    }
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) return values[middle] ?? 0;
    return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}
