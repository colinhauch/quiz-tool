import {
  adminEntityDetailSchema,
  adminFeedbackFilterSchema,
  adminFeedbackListSchema,
  adminGeneratorPreviewSchema,
  adminGraphHealthReportSchema,
  adminHealthSchema,
  adminPackDetailSchema,
  adminPackListSchema,
  adminPopulationSchema,
  adminResultsChartsSchema,
  adminResultsFilterSchema,
  adminResultsResponseSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  type AdminFeedbackFilter,
  type AdminResultsFilter,
} from "@geo/contract";
import type { Pack } from "@geo/engine";
import type { LoadedPack } from "@geo/server/pack-loader";
import { Hono } from "hono";
import { getEntityDetail } from "./entityProjection.js";
import { previewGenerator } from "./generatorPreviewProjection.js";
import { computeGraphHealth } from "./healthChecks.js";
import {
  buildAccuracyByPack,
  buildAccuracyByRelation,
  buildAccuracyOverTime,
  buildHardestEasiestCards,
  buildLeaderboard,
  buildVolumeOverTime,
} from "./leaderboard.js";
import { buildFeedbackRows, filterFeedbackRows } from "./feedbackProjection.js";
import { computeOwnership, type Ownership } from "./ownership.js";
import { getPackDetail, listPacks } from "./packProjection.js";
import { buildPopulation } from "./populationProjection.js";
import type { AdminReadStore } from "./read-store.js";
import { buildResultRows, buildResultsResponse, filterResultRows } from "./resultsProjection.js";
import { buildUserDetail } from "./userDetailProjection.js";

/**
 * The admin BFF's dependencies, passed in rather than reached for — the same
 * discipline `createApp` in `@geo/server` follows, and for the same reason: the
 * one builder serves both the real startup wiring (`src/index.ts`, which reads
 * disk and holds the service-role key) and in-process tests that drive it via
 * `app.request()` with no network and no live Supabase.
 *
 * `pack` is the assembled graph every static surface (Packs, Graph Health,
 * Generator Preview) projects over. The cross-user read seam (`AdminReadStore`)
 * arrives with the slices that need it (#140+).
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
  /**
   * The cross-user read seam (#140–#144): Users, single-user detail,
   * population aggregates, Results, and its charts/leaderboard. Optional so
   * the graph-only routes above keep working with no store at all (as every
   * existing test does); a route that needs it 500s with a clear message when
   * it's missing, rather than the app failing to construct.
   */
  readStore?: AdminReadStore;
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

  // The cross-user seam (#140+). Every route below reads through `readStore`.
  function requireReadStore(): AdminReadStore {
    if (!options.readStore) throw new Error("AdminReadStore is not configured");
    return options.readStore;
  }

  // Users surface (#140): every user, from `auth.users` via the service role.
  app.get("/users", async (c) => {
    const readStore = requireReadStore();
    const users = await readStore.listUsers();
    return c.json(adminUserListSchema.parse(users));
  });

  // Single-user detail (#141): ability per pack, rollups, recent Answer Log
  // entries, and the replay-derived ability trajectory.
  app.get("/users/:userId", async (c) => {
    const readStore = requireReadStore();
    const userId = c.req.param("userId");
    const [users, answers, packAbilities] = await Promise.all([
      readStore.listUsers(),
      readStore.listAnswersForUser(userId),
      readStore.listAllPackAbilities(),
    ]);
    const user = users.find((u) => u.id === userId);
    if (!user) return c.json({ error: `unknown user: ${userId}` }, 404);
    const detail = buildUserDetail(pack, user, answers, packAbilities);
    return c.json(adminUserDetailSchema.parse(detail));
  });

  // All-users aggregate view (#142): counts, accuracy distribution, activity.
  app.get("/population", async (c) => {
    const readStore = requireReadStore();
    const [users, answers] = await Promise.all([readStore.listUsers(), readStore.listAllAnswers()]);
    return c.json(adminPopulationSchema.parse(buildPopulation(users, answers)));
  });

  /** Parses `/results`'s composable query filters (#143). `correct` arrives as the string "true"/"false" over a query string. */
  function parseResultsFilter(c: { req: { query: (key: string) => string | undefined } }): AdminResultsFilter {
    const raw: Record<string, unknown> = {};
    const userId = c.req.query("userId");
    const packId = c.req.query("packId");
    const relation = c.req.query("relation");
    const correct = c.req.query("correct");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (userId !== undefined) raw.userId = userId;
    if (packId !== undefined) raw.packId = packId;
    if (relation !== undefined) raw.relation = relation;
    if (correct !== undefined) raw.correct = correct === "true";
    if (from !== undefined) raw.from = from;
    if (to !== undefined) raw.to = to;
    return adminResultsFilterSchema.parse(raw);
  }

  /** Parses `/feedback`'s status/kind filters (#163). "All" is the absence of the parameter, so there is nothing to spell out for it. */
  function parseFeedbackFilter(c: { req: { query: (key: string) => string | undefined } }): AdminFeedbackFilter {
    const raw: Record<string, unknown> = {};
    const status = c.req.query("status");
    const kind = c.req.query("kind");
    if (status !== undefined) raw.status = status;
    if (kind !== undefined) raw.kind = kind;
    return adminFeedbackFilterSchema.parse(raw);
  }

  // Results surface (#143): every answer across every user, with composable filters.
  app.get("/results", async (c) => {
    const readStore = requireReadStore();
    const filter = parseResultsFilter(c);
    const [users, answers] = await Promise.all([readStore.listUsers(), readStore.listAllAnswers()]);
    const rows = filterResultRows(buildResultRows(pack, users, answers), filter);
    return c.json(adminResultsResponseSchema.parse(buildResultsResponse(rows)));
  });

  // Results charts + leaderboard + hardest/easiest Cards (#144): the
  // analytical layer over the same filtered Results set, plus the leaderboard
  // and the globally-scoped hardest/easiest Cards from `card_difficulty`.
  app.get("/results/charts", async (c) => {
    const readStore = requireReadStore();
    const filter = parseResultsFilter(c);
    const [users, answers, packAbilities, cardDifficulties] = await Promise.all([
      readStore.listUsers(),
      readStore.listAllAnswers(),
      readStore.listAllPackAbilities(),
      readStore.listCardDifficulties(),
    ]);
    const allRows = buildResultRows(pack, users, answers);
    const filteredRows = filterResultRows(allRows, filter);
    const { hardestCards, easiestCards } = buildHardestEasiestCards(pack, cardDifficulties);
    const charts = {
      accuracyOverTime: buildAccuracyOverTime(filteredRows),
      volumeOverTime: buildVolumeOverTime(filteredRows),
      accuracyByPack: buildAccuracyByPack(filteredRows),
      accuracyByRelation: buildAccuracyByRelation(filteredRows),
      leaderboard: buildLeaderboard(users, packAbilities, filter, filteredRows),
      hardestCards,
      easiestCards,
    };
    return c.json(adminResultsChartsSchema.parse(charts));
  });

  // Feedback surface (#163): every learner-submitted report, newest-first,
  // filterable by status and kind. Read-only — the admin exposes no route that
  // writes `status`; resolving is done out-of-band (spec #160).
  app.get("/feedback", async (c) => {
    const readStore = requireReadStore();
    const filter = parseFeedbackFilter(c);
    const [users, feedback] = await Promise.all([readStore.listUsers(), readStore.listFeedback()]);
    const rows = filterFeedbackRows(buildFeedbackRows(users, feedback), filter);
    return c.json(adminFeedbackListSchema.parse(rows));
  });

  return app;
}
