import {
  adminEntityDetailSchema,
  adminEnvironmentComparisonSchema,
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
  environmentSchema,
  type AdminEnvironmentColumn,
  type AdminFeedbackFilter,
  type AdminResultsFilter,
  type Environment,
} from "@geo/contract";
import type { Pack } from "@geo/engine";
import type { LoadedPack } from "@geo/server/pack-loader";
import { Hono, type Context } from "hono";
import { buildEnvironmentStats } from "./environmentComparisonProjection.js";
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
import { projectUserRows } from "./userRowProjection.js";

/** Every `Environment`, in the fixed order the comparison surface fans out to and renders. */
const ALL_ENVIRONMENTS: readonly Environment[] = ["prod", "test", "dev"];

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
   * The cross-user read seam (#140–#144, widened per-environment in #172):
   * Users, single-user detail, population aggregates, Results, and its
   * charts/leaderboard. A map rather than a single store because the admin
   * now reads any of three environments per request (`?env=`) — see
   * `resolveEnvironment`/`requireReadStore` below. Optional, and each
   * environment within it independently optional, so the graph-only routes
   * above keep working with no store at all (as every existing test does);
   * a route whose environment has no configured store 500s with a message
   * naming that environment, rather than the app failing to construct.
   *
   * Deliberately still keyed to `AdminReadStore` with no `Environment`
   * argument added to the interface itself (`read-store.ts`'s own doc
   * comment calls this out) — environment selection is a composition
   * concern handled here, at the map, so the deferred RLS-based
   * implementation still satisfies `AdminReadStore` unchanged.
   */
  readStores?: Partial<Record<Environment, AdminReadStore>>;
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

  // Turns a thrown `Error` (e.g. `requireReadStore`'s "not configured for
  // environment: X") into a 500 whose body actually carries that message,
  // instead of Hono's default opaque "Internal Server Error" text. This is
  // what lets a missing-store failure name the offending environment for the
  // operator, per #172's acceptance criteria — not just a status code.
  app.onError((err, c) => c.json({ error: err.message }, 500));

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

  // The cross-user seam (#140+), now environment-scoped (#172). Every route
  // below reads through `readStore`, resolved for the request's environment.

  /**
   * Reads `?env=` and validates it against `Environment`. Absent means
   * `prod` — this is exactly today's behavior (the route default), kept
   * distinct from the SPA's own *first-run* default of `dev` (see
   * `environmentPref.ts`): the route default exists for backwards
   * compatibility with every caller that predates this ticket, including
   * every pre-existing route test, none of which sends `env` and all of
   * which must keep passing unmodified. Present-and-unrecognized is a client
   * error, not a silent fallback to `prod` — a typo'd `?env=stage` in a
   * hand-written URL should be visible, not swallowed.
   *
   * Returns the parsed `Environment` on success, or the 400 `Response` to
   * send back on failure — callers check `instanceof Response` rather than
   * this throwing, so every route stays a flat, readable sequence.
   */
  function resolveEnvironment(c: Context): Environment | Response {
    const raw = c.req.query("env");
    if (raw === undefined) return "prod";
    const parsed = environmentSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: `unrecognized environment: ${raw}` }, 400);
    return parsed.data;
  }

  /**
   * Looks up the store for one environment. Throws (Hono's default handler
   * turns this into a 500) naming the environment, so a route for `test`
   * failing never reads as "the admin is broken" when it's really "`test`
   * has no store configured" — and other environments' routes are entirely
   * unaffected, since this only inspects the one key.
   */
  function requireReadStore(env: Environment): AdminReadStore {
    const store = options.readStores?.[env];
    if (!store) throw new Error(`AdminReadStore is not configured for environment: ${env}`);
    return store;
  }

  // Users surface (#140): every user, from `auth.users` via the service role.
  app.get("/users", async (c) => {
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
    // The roster is shared across Environments while the activity beside it is
    // not (#173) — both halves are assembled here so the surface never has to
    // make a second, separately-scoped request to tell them apart.
    const [users, answers] = await Promise.all([readStore.listUsers(), readStore.listAllAnswers()]);
    return c.json(adminUserListSchema.parse(projectUserRows(users, answers)));
  });

  // Single-user detail (#141): ability per pack, rollups, recent Answer Log
  // entries, and the replay-derived ability trajectory.
  app.get("/users/:userId", async (c) => {
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
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
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
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
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
    const filter = parseResultsFilter(c);
    const [users, answers] = await Promise.all([readStore.listUsers(), readStore.listAllAnswers()]);
    const rows = filterResultRows(buildResultRows(pack, users, answers), filter);
    return c.json(adminResultsResponseSchema.parse(buildResultsResponse(rows)));
  });

  // Results charts + leaderboard + hardest/easiest Cards (#144): the
  // analytical layer over the same filtered Results set, plus the leaderboard
  // and the globally-scoped hardest/easiest Cards from `card_difficulty`.
  app.get("/results/charts", async (c) => {
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
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
    // Feedback rows live in the Environment's own schema, so this route is
    // environment-scoped like every other cross-user read (#172) — a report
    // submitted against dev must not surface while prod is selected.
    const env = resolveEnvironment(c);
    if (env instanceof Response) return env;
    const readStore = requireReadStore(env);
    const filter = parseFeedbackFilter(c);
    const [users, feedback] = await Promise.all([readStore.listUsers(), readStore.listFeedback()]);
    const rows = filterFeedbackRows(buildFeedbackRows(users, feedback), filter);
    return c.json(adminFeedbackListSchema.parse(rows));
  });

  // Environments comparison surface (#174): all three environments side by
  // side in one response. Unlike every route above, this one never reads
  // `?env=` — comparing every environment at once is the whole point, so
  // there is no single environment to resolve.
  app.get("/environments", async (c) => {
    // `Promise.allSettled`, not `Promise.all`: one environment's store being
    // unconfigured or unreachable must never fail the other two — that
    // tolerance is the acceptance criterion this route exists to satisfy.
    // Each settled entry captures both the environment it belongs to and,
    // when it resolved, the `listUsers()` length alongside the computed
    // stats — `listUsers()` is only read here to source the shared
    // registered-user count below (`auth.users` is one table shared by all
    // three schemas), not because the stats themselves need it.
    const settled = await Promise.allSettled(
      ALL_ENVIRONMENTS.map(async (env) => {
        const store = options.readStores?.[env];
        if (!store) throw new Error(`AdminReadStore is not configured for environment: ${env}`);
        const [users, answers, packAbilities, cardDifficulties] = await Promise.all([
          store.listUsers(),
          store.listAllAnswers(),
          store.listAllPackAbilities(),
          store.listCardDifficulties(),
        ]);
        return { userCount: users.length, stats: buildEnvironmentStats(answers, packAbilities, cardDifficulties) };
      }),
    );

    const environments = {} as Record<Environment, AdminEnvironmentColumn>;
    // `auth.users` is one shared table, not one per environment (CONTEXT.md),
    // so every healthy environment reports the same count; the first one to
    // resolve is as good a source as any. Stays 0 only if every environment
    // failed, which the "unavailable" columns already explain individually.
    let registeredUsers = 0;
    let registeredUsersFound = false;

    ALL_ENVIRONMENTS.forEach((env, i) => {
      const result = settled[i];
      if (result?.status === "fulfilled") {
        environments[env] = { status: "ok", ...result.value.stats };
        if (!registeredUsersFound) {
          registeredUsers = result.value.userCount;
          registeredUsersFound = true;
        }
      } else {
        const reason = result?.status === "rejected" ? result.reason : undefined;
        environments[env] = {
          status: "unavailable",
          reason: reason instanceof Error ? reason.message : String(reason),
        };
      }
    });

    return c.json(adminEnvironmentComparisonSchema.parse({ registeredUsers, environments }));
  });

  return app;
}
