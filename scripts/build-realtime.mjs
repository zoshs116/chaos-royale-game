import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const projectRoot = process.cwd();
const outputDirectory = resolve(projectRoot, 'dist-server');

await mkdir(outputDirectory, { recursive: true });
await build({
    absWorkingDir: projectRoot,
    entryPoints: [resolve(projectRoot, 'server/realtime/src/server.ts')],
    outfile: resolve(outputDirectory, 'realtime.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    sourcemap: true,
    logLevel: 'info',
});
