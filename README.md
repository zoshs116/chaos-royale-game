# Chaos Royale Game

A mobile arena card-battle prototype built with React, Phaser 3, TypeScript, and Vite.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer

## Run locally

```bash
pnpm install
pnpm run dev:local
```

Open <http://127.0.0.1:5222/>.

To run the React/Phaser client and the local authoritative battle server together:

```bash
pnpm run dev:multiplayer
```

Development user A:

<http://127.0.0.1:5222/?devUser=a>

Development user B:

<http://127.0.0.1:5222/?devUser=b>

To open the battle scene directly:

<http://127.0.0.1:5222/?automation=1&scene=battle>

## Production build

```bash
pnpm run build
pnpm run preview:local
```

## Supabase

The game can run in local mode without Supabase. To enable the remote profile, clan, chat, and friendly-room features, copy `.env.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply `docs/supabase-schema.sql` to a fresh Supabase project before enabling authenticated remote features. The same schema is tracked as a migration under `supabase/migrations/`.

For a project that already has the account/profile schema installed, apply only the clan social-system upgrade in:

```text
supabase/migrations/202607180002_social_system_hardening.sql
```

Run the entire file once in Supabase SQL Editor. It is safe to rerun after a successful installation because the schema changes and policies are written to replace their prior definitions.

In Supabase Authentication settings, enable Email/Password sign-in and allow these local redirect URLs:

```text
http://127.0.0.1:5222/**
http://localhost:5222/**
```

Normal entry uses the real Supabase session. Explicit `?devUser=a`, `?devUser=b`, and `?automation=1` URLs keep the isolated local test mode available. Profile progression fields are server-managed; authenticated clients can only update nickname, avatar, and deck through `update_own_profile`.

## Multiplayer validation

```bash
pnpm run typecheck:server
pnpm run test:multiplayer
pnpm run test:realtime:config
pnpm run build:realtime
pnpm run test:realtime:production
```

The smoke suite verifies:

- match-room lifecycle ordering
- server-side deck, spawn, elixir, and sequence validation
- idempotent match-result progression
- two-user clan invite, acceptance, and friendly-room flow

The WebSocket server defaults to `ws://127.0.0.1:8787/battle`, and the REST gateway defaults to `http://127.0.0.1:8788`. Set `CHAOS_DEV_MULTIPLAYER_TOKEN` and the matching `VITE_CHAOS_DEV_MULTIPLAYER_TOKEN` to protect local shared-network testing. The development token is never accepted when `NODE_ENV=production`.

## Realtime server deployment

The production topology is:

- Vercel: React/Phaser browser client
- Railway: one authoritative realtime WebSocket process
- Supabase: authentication, profiles, clans, friendly rooms, chat, and durable match results

`railway.json` builds only the realtime server bundle, starts it with `pnpm run start:realtime`, and checks `/health` before Railway routes traffic to the new deployment. Railway supplies `PORT`; the server binds to `0.0.0.0` automatically in production.

Configure these variables on the Railway realtime service:

```env
NODE_ENV=production
CHAOS_STORAGE_DRIVER=memory
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CHAOS_ALLOWED_ORIGINS=https://YOUR_VERCEL_DOMAIN
```

Do not add `CHAOS_DEV_MULTIPLAYER_TOKEN` to Railway. Do not expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or through Vercel. Active battles currently live in one Railway process, so keep the realtime service at one replica. Supabase remains the durable source for account and completed-match progression.

After Railway generates a public HTTPS domain, set the Vercel client variable to its secure WebSocket endpoint:

```env
VITE_BATTLE_WS_URL=wss://YOUR_RAILWAY_DOMAIN/battle
```

## Included source

- `src/`: React shell, Phaser battle scene, game rules, and UI
- `public/`: runtime game assets
- `server/`: multiplayer server prototypes and contracts
- `scripts/`: asset generation and normalization scripts used by package commands
- `docs/supabase-schema.sql`: Supabase tables, policies, and realtime setup

Reference videos, extracted frames, temporary review files, generated builds, dependencies, and local secrets are intentionally excluded.
