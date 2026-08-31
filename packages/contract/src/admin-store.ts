import { z } from "zod";

/**
 * The cross-user seam's HTTP contract (#140–#144): Users, single-user detail,
 * population aggregates, Results (with filters), and the analytical views
 * layered on Results (charts, leaderboard, hardest/easiest Cards). Kept apart
 * from `admin.ts`, which covers the graph-only surfaces (Packs, Entity, Graph
 * Health, Generator Preview) that never touch `AdminReadStore`.
 *
 * Schemas arrive with the slice that adds their route (#140 ships the first
 * one: Users).
 */

/**
 * The three environments the admin can read from — `prod`, `test`, `dev` —
 * distinct from the Postgres *schema* each one binds to (`prod` → `public`;
 * `test`/`dev` name their own schema of the same name). Two words because
 * `prod → public` is the one place they diverge, and that divergence is the
 * whole reason CONTEXT.md records them as separate terms. Every cross-user
 * route below accepts this as `?env=`; absent means `prod` (today's
 * behaviour), present-and-unrecognized is a client error. The graph-only
 * surfaces in `admin.ts` (Packs, Entity, Graph Health, Generator Preview)
 * never see it — they read the local pack graph, not a schema.
 */
export const environmentSchema = z.enum(["prod", "test", "dev"]);

export type Environment = z.infer<typeof environmentSchema>;

/** One user, as `auth.users` reports it through the service-role Admin API. */
export const adminUserSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    lastSignInAt: z.string().min(1).nullable(),
  })
  .strict();

export type AdminUser = z.infer<typeof adminUserSchema>;

/**
 * One row of `GET /users` (#140, widened by #173): a user, plus how active
 * they have been *in the requested Environment*.
 *
 * The two halves have different scopes on purpose. `auth.users` is shared
 * across every Environment (CONTEXT.md's `Environment`/`schema` entries), so
 * the identity fields are the same whichever Environment is selected, while
 * the activity fields come from that Environment's schema alone. The roster is
 * deliberately not filtered down to active users: "registered here but never
 * played here" is exactly the signal an operator comes to this surface for,
 * and filtering would hide it.
 */
export const adminUserRowSchema = adminUserSchema
  .extend({
    /** Answers this user has recorded in the requested Environment. `0` is a real state — see this schema's doc comment. */
    answerCount: z.number().int().nonnegative(),
    /** `askedAt` of their most recent answer in the requested Environment, or `null` if they have none. */
    lastAnsweredAt: z.string().min(1).nullable(),
  })
  .strict();

export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

/** `GET /users` — every user, with per-Environment activity (#140, #173). */
export const adminUserListSchema = z.array(adminUserRowSchema);

export type AdminUserList = z.infer<typeof adminUserListSchema>;

/** One recorded answer, resolved for display and for jumping to its Card/Entity on the Packs surface. */
export const adminAnswerLogEntrySchema = z
  .object({
    cardId: z.string().min(1),
    input: z.string(),
    correct: z.boolean(),
    askedAt: z.string().min(1),
    /** The statement the card resolves to, absent if it's no longer in the graph. */
    statementId: z.string().min(1).optional(),
    relation: z.string().min(1).optional(),
    packId: z.string().min(1).optional(),
    /** The card's subject entity, for a jump straight to it. */
    subjectEntityId: z.string().min(1).optional(),
  })
  .strict();

export type AdminAnswerLogEntry = z.infer<typeof adminAnswerLogEntrySchema>;

/** One pack's Elo ability for the user being viewed. */
export const adminUserAbilitySchema = z
  .object({
    packId: z.string().min(1),
    packLabel: z.string().min(1),
    ability: z.number(),
  })
  .strict();

export type AdminUserAbility = z.infer<typeof adminUserAbilitySchema>;

/** Per-user rollups: total answers, overall accuracy, packs touched, last-active. */
export const adminUserAggregateSchema = z
  .object({
    totalAnswers: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
    packsTouched: z.array(z.string().min(1)),
    lastActiveAt: z.string().min(1).nullable(),
  })
  .strict();

export type AdminUserAggregate = z.infer<typeof adminUserAggregateSchema>;

/** One point on the ability-over-time graph — the ability the answer moved to, and which pack it belongs to. */
export const adminAbilityTrajectoryPointSchema = z
  .object({
    askedAt: z.string().min(1),
    packId: z.string().min(1),
    ability: z.number(),
  })
  .strict();

export type AdminAbilityTrajectoryPoint = z.infer<typeof adminAbilityTrajectoryPointSchema>;

/**
 * `GET /users/:userId` — the single-user detail view (#141): ability per pack,
 * rollups, recent Answer Log entries, and the replay-derived ability trajectory.
 */
export const adminUserDetailSchema = z
  .object({
    user: adminUserSchema,
    abilities: z.array(adminUserAbilitySchema),
    aggregate: adminUserAggregateSchema,
    recentAnswers: z.array(adminAnswerLogEntrySchema),
    trajectory: z.array(adminAbilityTrajectoryPointSchema),
  })
  .strict();

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** One bucket of the accuracy-distribution histogram — e.g. "50-75%" and how many users fall in it. */
export const adminAccuracyBucketSchema = z
  .object({
    label: z.string().min(1),
    userCount: z.number().int().nonnegative(),
  })
  .strict();

export type AdminAccuracyBucket = z.infer<typeof adminAccuracyBucketSchema>;

/** One day's activity across the whole population. */
export const adminActivityDaySchema = z
  .object({
    date: z.string().min(1),
    activeUsers: z.number().int().nonnegative(),
    answerCount: z.number().int().nonnegative(),
  })
  .strict();

export type AdminActivityDay = z.infer<typeof adminActivityDaySchema>;

/** `GET /population` — aggregate counts, accuracy distribution, and activity across every user (#142). */
export const adminPopulationSchema = z
  .object({
    totalUsers: z.number().int().nonnegative(),
    totalAnswers: z.number().int().nonnegative(),
    accuracyDistribution: z.array(adminAccuracyBucketSchema),
    activityByDay: z.array(adminActivityDaySchema),
  })
  .strict();

export type AdminPopulation = z.infer<typeof adminPopulationSchema>;

/**
 * `GET /results` query params (#143). Every filter is optional and composable;
 * omitting all of them lists every answer across every user.
 */
export const adminResultsFilterSchema = z
  .object({
    userId: z.string().min(1).optional(),
    packId: z.string().min(1).optional(),
    relation: z.string().min(1).optional(),
    correct: z.boolean().optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  })
  .strict();

export type AdminResultsFilter = z.infer<typeof adminResultsFilterSchema>;

/** One answer row in the Results surface: an answer log entry plus which user answered it. */
export const adminResultRowSchema = adminAnswerLogEntrySchema
  .extend({
    userId: z.string().min(1),
    userEmail: z.string().min(1).nullable(),
  })
  .strict();

export type AdminResultRow = z.infer<typeof adminResultRowSchema>;

/** `GET /results` response — the filtered rows plus counts/accuracy over that same filtered set. */
export const adminResultsResponseSchema = z
  .object({
    rows: z.array(adminResultRowSchema),
    total: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
  })
  .strict();

export type AdminResultsResponse = z.infer<typeof adminResultsResponseSchema>;

/** One point on a time-bucketed chart (accuracy or volume over time). */
export const adminTimeSeriesPointSchema = z
  .object({
    date: z.string().min(1),
    count: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1).optional(),
  })
  .strict();

export type AdminTimeSeriesPoint = z.infer<typeof adminTimeSeriesPointSchema>;

/** Accuracy broken down by a dimension (pack id or Relation). */
export const adminAccuracyByKeySchema = z
  .object({
    key: z.string().min(1),
    count: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
  })
  .strict();

export type AdminAccuracyByKey = z.infer<typeof adminAccuracyByKeySchema>;

/** One leaderboard row — whichever of ability/accuracy/volume the board is ranked by is present. */
export const adminLeaderboardEntrySchema = z
  .object({
    userId: z.string().min(1),
    userEmail: z.string().min(1).nullable(),
    packId: z.string().min(1).optional(),
    ability: z.number().optional(),
    accuracy: z.number().min(0).max(1).optional(),
    volume: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AdminLeaderboardEntry = z.infer<typeof adminLeaderboardEntrySchema>;

/** `GET /results/leaderboard` — three boards over the (optionally filtered) population. */
export const adminLeaderboardSchema = z
  .object({
    byAbility: z.array(adminLeaderboardEntrySchema),
    byAccuracy: z.array(adminLeaderboardEntrySchema),
    byVolume: z.array(adminLeaderboardEntrySchema),
  })
  .strict();

export type AdminLeaderboard = z.infer<typeof adminLeaderboardSchema>;

/** One Card from the global `card_difficulty` cache, resolved for display. */
export const adminCardDifficultySchema = z
  .object({
    cardId: z.string().min(1),
    difficulty: z.number(),
    answerCount: z.number().int().nonnegative(),
    statementId: z.string().min(1).optional(),
    relation: z.string().min(1).optional(),
    packId: z.string().min(1).optional(),
  })
  .strict();

export type AdminCardDifficulty = z.infer<typeof adminCardDifficultySchema>;

/**
 * `GET /results/charts` — the analytical layer over the (optionally filtered)
 * Results set (#144): accuracy/volume over time, accuracy by pack and by
 * Relation, the three leaderboards, and hardest/easiest Cards globally.
 */
export const adminResultsChartsSchema = z
  .object({
    accuracyOverTime: z.array(adminTimeSeriesPointSchema),
    volumeOverTime: z.array(adminTimeSeriesPointSchema),
    accuracyByPack: z.array(adminAccuracyByKeySchema),
    accuracyByRelation: z.array(adminAccuracyByKeySchema),
    leaderboard: adminLeaderboardSchema,
    hardestCards: z.array(adminCardDifficultySchema),
    easiestCards: z.array(adminCardDifficultySchema),
  })
  .strict();

export type AdminResultsCharts = z.infer<typeof adminResultsChartsSchema>;

/**
 * One environment's row-set for the Environments comparison surface (#174):
 * every figure derivable from the existing `AdminReadStore` methods with no
 * new method added, per that ticket's constraint (the interface is the swap
 * point for a future RLS-based implementation, and widening it here would
 * widen it for that implementation too). Deliberately excludes a
 * registered-user count — `auth.users` is shared across all three
 * environments (CONTEXT.md's `Environment`/`schema` entries), so that count
 * is carried once on {@link adminEnvironmentComparisonSchema} instead of
 * repeated per column, where it would wrongly imply a per-environment pool.
 */
export const adminEnvironmentStatsSchema = z
  .object({
    /** Distinct users with at least one answer in this environment. */
    usersWithAnswers: z.number().int().nonnegative(),
    totalAnswers: z.number().int().nonnegative(),
    /** 0 when `totalAnswers` is 0 — the division-by-zero case, not an absent value. */
    accuracy: z.number().min(0).max(1),
    distinctCardsAnswered: z.number().int().nonnegative(),
    /** `askedAt` of the earliest recorded answer, or `null` if the environment has none yet. */
    firstAnswerAt: z.string().min(1).nullable(),
    lastAnswerAt: z.string().min(1).nullable(),
    /** Distinct `(user, pack)` ability rows' packs — how many packs the Elo system has touched here. */
    packsWithAbilityRows: z.number().int().nonnegative(),
    /** Distinct Cards present in the `card_difficulty` cache — how much of the graph has been rated here. */
    ratedCards: z.number().int().nonnegative(),
  })
  .strict();

export type AdminEnvironmentStats = z.infer<typeof adminEnvironmentStatsSchema>;

/**
 * One column of the Environments comparison table: either a healthy
 * environment's stats, or — when its `AdminReadStore` was unreachable or
 * simply not configured — a single explanatory `reason` and nothing else.
 * A discriminated union rather than an optional-everything shape, so a
 * client can never read `totalAnswers` off a column that never produced one.
 */
export const adminEnvironmentColumnSchema = z.discriminatedUnion("status", [
  adminEnvironmentStatsSchema.extend({ status: z.literal("ok") }).strict(),
  z.object({ status: z.literal("unavailable"), reason: z.string().min(1) }).strict(),
]);

export type AdminEnvironmentColumn = z.infer<typeof adminEnvironmentColumnSchema>;

/**
 * `GET /environments` — the Environments comparison surface (#174): all
 * three environments side by side, built by fanning out to every configured
 * `AdminReadStore` concurrently and tolerating partial failure (`Promise.
 * allSettled` in `admin-app.ts`), so one unreachable schema never blanks the
 * other two columns. Unlike every other cross-user route, this one does not
 * take `?env=` — reading all environments at once is the entire point of the
 * surface, so there is no single environment to select.
 */
export const adminEnvironmentComparisonSchema = z
  .object({
    /** The shared `auth.users` registration count — one figure, not one per column (see `adminEnvironmentStatsSchema`'s doc comment). */
    registeredUsers: z.number().int().nonnegative(),
    environments: z.record(environmentSchema, adminEnvironmentColumnSchema),
  })
  .strict();

export type AdminEnvironmentComparison = z.infer<typeof adminEnvironmentComparisonSchema>;
