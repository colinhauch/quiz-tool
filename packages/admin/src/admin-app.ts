import {
  adminEntityDetailSchema,
  adminGeneratorPreviewSchema,
  adminGraphHealthReportSchema,
  adminHealthSchema,
  adminPackDetailSchema,
  adminPackListSchema,
} from "@geo/contract";
import type { Pack } from "@geo/engine";
import type { LoadedPack } from "@geo/server/pack-loader";
import { Hono } from "hono";
import { getEntityDetail } from "./entityProjection.js";
import { previewGenerator } from "./generatorPreviewProjection.js";
import { computeGraphHealth } from "./healthChecks.js";
import { computeOwnership, type Ownership } from "./ownership.js";
import { getPackDetail, listPacks } from "./packProjection.js";

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
  /**
   * The raw per-pack sources `pack` was assembled from — the shape
   * `@geo/server/pack-loader`'s `discoverPacks`/`loadPack` produce at boot,
   * before `assembleGraph` merges every pack's entities into one `Map` and
   * loses which pack shipped which. The Packs, Entity, and Graph Health
   * surfaces need that per-pack breakdown to attribute Entity Owners and
   * Relation definitions (`ownership.ts`); the assembled graph alone can't
   * answer it.
   *
   * Optional and test-only in practice: a test passes a small fixture so the
   * route runs in-process with no disk. When omitted (the real `index.ts`,
   * which already calls `loadAllPacks()` for `pack` and is not re-plumbed
   * here), the BFF re-discovers the same `packs/` directory itself, on first
   * request, and caches the result — an extra disk read at admin-BFF
   * boot-cost, never in the request's hot path after the first call.
   */
  packSources?: LoadedPack[];
}

/**
 * Builds the admin BFF's Hono app. This iteration exposes **reads only** — no
 * route mutates the database — which the health route states back through the
 * contract (`readOnly: true`). Kept separate from the Node entrypoint so tests
 * exercise the routes in-process, the primary integration seam for the whole
 * admin package.
 */
export function createAdminApp(options: AdminAppOptions) {
  const app = new Hono();
  const { pack } = options;

  // Resolved once and memoized: a test supplies `packSources` directly (no
  // disk, no await beyond a resolved promise); the real BFF discovers it lazily
  // on first request rather than blocking every boot with a second pack read
  // alongside `index.ts`'s `loadAllPacks()`.
  let ownershipPromise: Promise<Ownership> | undefined;
  function getOwnership(): Promise<Ownership> {
    if (!ownershipPromise) {
      ownershipPromise = (
        options.packSources
          ? Promise.resolve(options.packSources)
          : import("@geo/server/pack-loader").then(({ discoverPacks, loadPack }) =>
              Promise.all(discoverPacks().map(loadPack)),
            )
      ).then(computeOwnership);
    }
    return ownershipPromise;
  }

  // The liveness probe and the seam's proof-of-life: it round-trips through the
  // admin contract schema, so an accidental shape drift fails here rather than
  // in the browser. `readOnly` is pinned true — see `adminHealthSchema`.
  app.get("/health", (c) => c.json(adminHealthSchema.parse({ status: "ok", readOnly: true })));

  // Packs surface (#136): every discovered pack, then one pack's Entities and
  // Statements, Relations split into defined-here vs asserted-elsewhere.
  app.get("/packs", (c) => c.json(adminPackListSchema.parse(listPacks(pack))));

  app.get("/packs/:packId", async (c) => {
    const packId = c.req.param("packId");
    if (!pack.packs.has(packId)) return c.json({ error: `unknown pack: ${packId}` }, 404);
    const ownership = await getOwnership();
    return c.json(adminPackDetailSchema.parse(getPackDetail(pack, packId, ownership)));
  });

  // Entity detail + graph traversal (#137).
  app.get("/entities/:entityId", async (c) => {
    const entityId = c.req.param("entityId");
    const ownership = await getOwnership();
    const detail = getEntityDetail(pack, entityId, ownership);
    if (!detail) return c.json({ error: `unknown entity: ${entityId}` }, 404);
    return c.json(adminEntityDetailSchema.parse(detail));
  });

  // Graph Health surface (#138): orphaned entities, uncovered statements,
  // missing coordinates/visual aid, duplicate relation definitions / owners.
  app.get("/health/graph", async (c) => {
    const ownership = await getOwnership();
    return c.json(adminGraphHealthReportSchema.parse(computeGraphHealth(pack, ownership)));
  });

  // Generator Preview surface (#139): what a statement's generator emits.
  app.get("/generator-preview/:statementId", (c) => {
    const statementId = c.req.param("statementId");
    const preview = previewGenerator(pack, statementId);
    if (!preview) return c.json({ error: `unknown statement: ${statementId}` }, 404);
    return c.json(adminGeneratorPreviewSchema.parse(preview));
  });

  return app;
}
