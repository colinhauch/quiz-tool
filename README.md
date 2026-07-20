# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. See [`specs/`](specs/) for the design and [`CLAUDE.md`](CLAUDE.md) for how to work here.

## Layout

pnpm workspace, four packages under `packages/`:

- **`engine`** — pure domain (graph, question generation, answer matching). No IO.
- **`contract`** — the typed HTTP seam: Zod schemas shared by `server` and `web`.
- **`server`** — Hono HTTP server + `better-sqlite3` persistence.
- **`web`** — Vite + React + TypeScript client.

## Commands

Run from the repo root (requires Node ≥ 24 and pnpm):

| Command | What it does |
|---|---|
| `pnpm dev` | Boots the Hono server (`:3001`) and the Vite dev server (`:5173`) together. |
| `pnpm build` | Type-checked build of every package (`tsc -b`). |
| `pnpm typecheck` | Type-checks every package without running it. |
| `pnpm test` | Runs the full Vitest suite across all packages. |

Each package also has its own `pnpm --filter @geo/<pkg> test`.
