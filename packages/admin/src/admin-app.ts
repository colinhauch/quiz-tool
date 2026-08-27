import { adminHealthSchema } from "@geo/contract";
import type { Pack } from "@geo/engine";
import { Hono } from "hono";

/**
 * The admin BFF's dependencies, passed in rather than reached for — the same
 * discipline `createApp` in `@geo/server` follows, and for the same reason: the
 * one builder serves both the real startup wiring (`src/index.ts`, which reads
 * disk and holds the service-role key) and in-process tests that drive it via
 * `app.request()` with no network and no live Supabase.
 *
 * `pack` is the assembled graph every static surface (Packs, Graph Health,
 * Generator Preview) projects over. The cross-user read seam (`AdminReadStore`)
 * and the injectable rng/clock arrive with the slices that need them (#140+).
 */
export interface AdminAppOptions {
  /** The assembled graph: every discovered pack, including catalog-hidden ones. */
  pack: Pack;
}

/**
 * Builds the admin BFF's Hono app. This iteration exposes **reads only** — no
 * route mutates the database — which the health route states back through the
 * contract (`readOnly: true`). Kept separate from the Node entrypoint so tests
 * exercise the routes in-process, the primary integration seam for the whole
 * admin package.
 */
export function createAdminApp(_options: AdminAppOptions) {
  const app = new Hono();

  // The liveness probe and the seam's proof-of-life: it round-trips through the
  // admin contract schema, so an accidental shape drift fails here rather than
  // in the browser. `readOnly` is pinned true — see `adminHealthSchema`.
  app.get("/health", (c) => c.json(adminHealthSchema.parse({ status: "ok", readOnly: true })));

  return app;
}
