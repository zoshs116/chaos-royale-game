import type { StorageDriver } from '../../storage';

export interface RealtimeServerConfig {
    port: number;
    host: string;
    production: boolean;
    developmentToken: string;
    supabaseUrl: string;
    supabasePublishableKey: string;
    supabaseServiceRoleKey: string;
    storageDriver: StorageDriver;
    postgresUrl?: string;
    allowedOrigins: Set<string>;
    serverBuild: string;
}

export function loadRealtimeServerConfig(env: NodeJS.ProcessEnv = process.env): RealtimeServerConfig {
    const production = env.NODE_ENV === 'production';
    const port = parsePort(env.PORT ?? env.CHAOS_REALTIME_PORT ?? '8787');
    const host = env.CHAOS_REALTIME_HOST?.trim() || (production ? '0.0.0.0' : '127.0.0.1');
    const storageDriver = parseStorageDriver(env.CHAOS_STORAGE_DRIVER, production);
    const supabaseUrl = readServerValue(env.SUPABASE_URL, production ? undefined : env.VITE_SUPABASE_URL);
    const supabasePublishableKey = readServerValue(
        env.SUPABASE_PUBLISHABLE_KEY,
        production ? undefined : (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY),
    );
    const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
    const postgresUrl = env.CHAOS_POSTGRES_URL?.trim() || undefined;

    if (production) {
        const missing: string[] = [];
        if (!supabaseUrl) missing.push('SUPABASE_URL');
        if (!supabasePublishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
        if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        if (storageDriver === 'postgres' && !postgresUrl) missing.push('CHAOS_POSTGRES_URL');
        if (missing.length > 0) {
            throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
        }
    }

    return {
        port,
        host,
        production,
        developmentToken: env.CHAOS_DEV_MULTIPLAYER_TOKEN?.trim() ?? '',
        supabaseUrl,
        supabasePublishableKey,
        supabaseServiceRoleKey,
        storageDriver,
        postgresUrl,
        allowedOrigins: parseAllowedOrigins(env.CHAOS_ALLOWED_ORIGINS),
        serverBuild: env.CHAOS_SERVER_BUILD?.trim() || env.RAILWAY_GIT_COMMIT_SHA?.trim() || 'development',
    };
}

function parsePort(value: string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`Invalid realtime server port: ${value}`);
    }
    return port;
}

function parseStorageDriver(value: string | undefined, production: boolean): StorageDriver {
    if (!value) return 'memory';
    if (value !== 'memory' && value !== 'sqlite' && value !== 'postgres') {
        throw new Error(`Invalid CHAOS_STORAGE_DRIVER: ${value}`);
    }
    if (production && value === 'sqlite') {
        throw new Error('CHAOS_STORAGE_DRIVER=sqlite is not supported in production. Use memory or postgres.');
    }
    return value;
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
    return new Set(
        (value ?? '')
            .split(',')
            .map((entry) => entry.trim().replace(/\/$/, ''))
            .filter(Boolean),
    );
}

function readServerValue(primary: string | undefined, localFallback: string | undefined): string {
    return primary?.trim() || localFallback?.trim() || '';
}
