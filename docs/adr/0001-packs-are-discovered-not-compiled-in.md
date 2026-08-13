# Packs are discovered by scanning, not compiled in

Every pack used to be a workspace package that the server declared as a dependency and named in a hard-coded list, so adding 193 facts about continents cost five build-file edits before a single fact was read. The server now scans `packs/*` at boot and loads whatever it finds; `packs/` is a single workspace package rather than one per pack, so a new pack is a directory with a manifest, some `.jsonl`, and an optional `index.ts` — and nothing else.

## Considered options

**Automating the wiring instead** — keeping per-pack packages and generating the dependency list and import table from a scan — was rejected because it keeps every file it was meant to save you from and adds a generated artifact to keep in sync.

**Loading packs from outside the repo** (a configurable directory, so packs could be authored and shipped independently) was considered and deliberately not taken. Packs stay in this repo and ship with the app. This also settles the open "bundled or downloaded packs" question in `specs/deployment/` in favour of bundled.

**Making packs pure data** with declarative question specs and no code was rejected: the driver here is our own authoring cost, not untrusted input, so there is no trust argument forcing code out of packs. Generators stay TypeScript.

## Consequences

**Discovery removes a safety net, so it is paired with a registry.** Hand-wiring meant a broken pack failed at compile time, inside a diff you were already reading. A scanned directory has no such review step, and the generator table was merged with `Object.assign` — last write wins, silently. That is exactly how two packs both claiming `located_in` made every city question render as a continent question. So a pack now declares its relations in `pack.json`, and the loader throws on a redefined or undeclared relation. Discovery without that registry would be strictly more dangerous than the wiring it replaces.

**"Validate at build time, trust at runtime" becomes "validate at load."** There is no build step for packs any more, so load is the only moment anything can be checked. One validator serves both `pnpm packs:validate` and the loader; boot fails hard rather than skipping a bad pack, because a warning in a scrollback is how a pack quietly stops being quizzed.

**The manifest becomes load-bearing for the first time.** Nothing read `pack.json` before, which is why its `contents`, `depends`, and `engine_min_version` fields had already drifted into three different conventions across three packs without anyone noticing. Those fields are gone; the loader finds files by convention.

## Amendment (2026-08-12): the Cloudflare Worker target compiles packs in

Deploying the server to a Cloudflare Worker (#54) reintroduces a build step this ADR had removed, because a Worker has no filesystem and cannot `import()` at runtime — the two things discovery relies on. A build-time bundler (`packages/server/scripts/bundle-packs.ts`) emits `src/packs.generated.ts`: every pack's generators as **static imports** and its data as inline literals. That is a compile-time edge from application source to every pack — precisely what "discovered, not compiled in" avoided — and `packages/server/tsconfig.json` now references `packs/` to resolve it.

This is a target-specific reversal, not a wholesale one, and the original intent survives:

- **The Node path (`src/index.ts`) is unchanged** — still scans `packs/` at boot, still no compile-time edge. Only the Worker path uses the bundle.
- **Adding a pack still touches no hand-written application source.** It is still a directory with a manifest; you then run `pnpm bundle-packs` to regenerate the (machine-owned) bundle. The generated file is never hand-edited.
- **The registry safety net still runs.** The bundler enumerates with the same `discoverPacks`, and the Worker assembles through the same `assembleLoaded` → `validatePacks`, so a redefined or undeclared relation still throws — at build time now, which is strictly safer than at load.
- **Drift is caught mechanically.** `packs-bundle.test.ts` fails if the bundle diverges from disk; `pretest` and the wrangler `[build]` command regenerate it before tests and before every deploy.

So "validate at load" becomes "validate at bundle" for the Worker, and the build step returns — but scoped to one deploy target and fully automated.
