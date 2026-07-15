import MemoryStorage from './MemoryStorage';
import PostgresStorage from './PostgresStorage';
import SqliteStorage from './SqliteStorage';
import type { ServerStorage, StorageDriver } from './types';

export interface StorageFactoryOptions {
    driver?: StorageDriver;
    sqlitePath?: string;
    postgresUrl?: string;
}

export async function createServerStorage(options: StorageFactoryOptions = {}): Promise<ServerStorage> {
    const driver = resolveDriver(options.driver);

    if (driver === 'memory') {
        return new MemoryStorage();
    }

    if (driver === 'sqlite') {
        const sqlitePath = options.sqlitePath ?? process.env.CHAOS_SQLITE_PATH ?? 'output/server/chaos-royale.db';
        return SqliteStorage.create(sqlitePath);
    }

    const postgresUrl = options.postgresUrl ?? process.env.CHAOS_POSTGRES_URL;
    if (!postgresUrl) {
        throw new Error('CHAOS_POSTGRES_URL is required when CHAOS_STORAGE_DRIVER=postgres.');
    }
    return PostgresStorage.create(postgresUrl);
}

function resolveDriver(input: StorageDriver | undefined): StorageDriver {
    if (input) return input;
    const envValue = process.env.CHAOS_STORAGE_DRIVER;
    if (envValue === 'memory' || envValue === 'sqlite' || envValue === 'postgres') {
        return envValue;
    }
    return 'sqlite';
}
