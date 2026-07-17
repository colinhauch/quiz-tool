# Deployment

How this ships and runs: packaging, platform, distribution, update mechanism.

## The MVP is a local web app

A Node process holds SQLite (via `better-sqlite3`) and the engine. A browser renders the quiz and the region × relation accuracy screen. One hardcoded local user, no network, no account, no server anyone else can reach — it runs on the machine that started it.

The reason is that this is the only option that keeps the MVP's two halves honest at once. The engine wants a real filesystem and a real SQLite; the accuracy screen wants to be a screen. A local web app gives each what it needs without pretending to be a product yet.

The alternatives, and why each lost:

**CLI or TUI** was genuinely tempting — it is the cheapest possible surface, it exercises the whole engine, and it demands no frontend decisions at all. It lost because the roadmap's headline output is a *screen*: the region × relation accuracy view is a two-dimensional thing you read by scanning, and in a terminal it degrades into a table dump. Worse, every deferred capability — images, maps — implies a rich UI eventually, so a terminal interface is work you knowingly throw away.

**Electron or Tauri** matches "it ships inside the app" most literally, and one day it may be right. It lost on timing, not merit: packaging, signing, and update machinery are real costs, and paying them on day one to serve a single local user buys nothing the local web app doesn't already give us. The path from here to there is short if we want it.

**Browser-only** — SQLite compiled to WASM, persisted in OPFS, no server at all — is the most elegant on paper and genuinely zero-ops. It lost because it quietly invalidates the reasoning in [../storage/](../storage/): "the database is a file" means something different when the file lives in an origin-private filesystem behind an async WASM shim, and the eventual sync story changes shape with it. Not wrong; just a different system than the one the specs describe.

### What this decision commits us to

**An API seam between Node and the browser exists from day one.** It is not optional and it is not deferrable — the engine is on one side and the UI is on the other. Its shape is not yet decided; it depends on what the questions and learning reviews settle about what the UI actually needs to ask for.

**It re-grounds the storage argument.** [../storage/](../storage/) argues for SQLite partly on the basis that "the database is a file, and later it ships inside the app." That reasoning silently assumed a Node or native process — a premise nobody had actually decided. This decision supplies it. The argument was sound; it was resting on an unstated foundation, and now it isn't.

## Still open: bundled or downloaded packs

Whether packs ship inside app builds or are fetched at runtime is still undecided. The platform choice above does not settle it — a local web app can do either — and it affects nothing in the pack format; see [../packs/](../packs/). It decides a real part of the app architecture and stays open.
