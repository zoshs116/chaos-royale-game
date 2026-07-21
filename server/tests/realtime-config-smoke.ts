import assert from 'node:assert/strict';
import { loadRealtimeServerConfig } from '../realtime/src/config';

const production = loadRealtimeServerConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    CHAOS_STORAGE_DRIVER: 'memory',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    CHAOS_ALLOWED_ORIGINS: 'https://game.example.com, https://preview.example.com/',
    RAILWAY_GIT_COMMIT_SHA: 'abc123',
});

assert.equal(production.port, 8080);
assert.equal(production.host, '0.0.0.0');
assert.equal(production.storageDriver, 'memory');
assert.equal(production.serverBuild, 'abc123');
assert.deepEqual([...production.allowedOrigins], ['https://game.example.com', 'https://preview.example.com']);

const local = loadRealtimeServerConfig({
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'local-key',
});
assert.equal(local.port, 8787);
assert.equal(local.host, '127.0.0.1');
assert.equal(local.storageDriver, 'memory');
assert.equal(local.supabasePublishableKey, 'local-key');

assert.throws(
    () => loadRealtimeServerConfig({ NODE_ENV: 'production', CHAOS_STORAGE_DRIVER: 'memory' }),
    /SUPABASE_URL.*SUPABASE_PUBLISHABLE_KEY.*SUPABASE_SERVICE_ROLE_KEY/,
);
assert.throws(
    () => loadRealtimeServerConfig({ NODE_ENV: 'production', CHAOS_STORAGE_DRIVER: 'sqlite' }),
    /sqlite is not supported in production/,
);
assert.throws(() => loadRealtimeServerConfig({ PORT: 'not-a-port' }), /Invalid realtime server port/);

console.log('[realtime-config-smoke] all checks passed');
