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

Apply `docs/supabase-schema.sql` to the Supabase project before using those features.

## Included source

- `src/`: React shell, Phaser battle scene, game rules, and UI
- `public/`: runtime game assets
- `server/`: multiplayer server prototypes and contracts
- `scripts/`: asset generation and normalization scripts used by package commands
- `docs/supabase-schema.sql`: Supabase tables, policies, and realtime setup

Reference videos, extracted frames, temporary review files, generated builds, dependencies, and local secrets are intentionally excluded.
