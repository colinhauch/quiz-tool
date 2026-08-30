# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. See [`specs/`](specs/) for the design and [`CLAUDE.md`](CLAUDE.md) for how to work here.

## Layout

pnpm workspace, five packages under `packages/`:

- **`engine`** — pure domain (graph, question generation, answer matching). No IO.
- **`contract`** — the typed HTTP seam: Zod schemas shared by `server`, `web`, and `admin`.
- **`server`** — Hono HTTP server + `better-sqlite3` persistence.
- **`web`** — Vite + React + TypeScript client (the player app).
- **`admin`** — read-only operator visualizer: a Vite + React SPA plus a thin local Hono BFF. Localhost only, deployed separately from the player app. See [`packages/admin/CLAUDE.md`](packages/admin/CLAUDE.md).

## Commands

Run from the repo root (requires Node ≥ 24 and pnpm):

| Command | What it does |
|---|---|
| `pnpm dev` | Boots the player app: the Hono server (`:3001`) and the Vite dev server (`:5173`) together. |
| `pnpm admin` | Boots the admin visualizer: its BFF (`:3101`) and SPA (`:5273`) together, then open `http://localhost:5273`. |
| `pnpm build` | Type-checked build of every package (`tsc -b`). |
| `pnpm typecheck` | Type-checks every package without running it. |
| `pnpm test` | Runs the full Vitest suite across all packages. |

Each package also has its own `pnpm --filter @geo/<pkg> test`.

The admin app's Packs, Graph Health, and Generator Preview surfaces need no
database. Its Users and Results surfaces read across all users via a service-role
key: copy [`packages/admin/.env.example`](packages/admin/.env.example) to
`packages/admin/.env.local` and fill it in (git-ignored). Details in
[`packages/admin/CLAUDE.md`](packages/admin/CLAUDE.md).
