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

/** `GET /users` — every user (#140). */
export const adminUserListSchema = z.array(adminUserSchema);

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
 * The snapshot a question-feedback row carries — what the learner saw on the
 * card at submission time (spec #160). Deliberately its own shape rather than
 * the player-facing `feedbackContextSchema` in `index.ts`: the two seams stay
 * apart so a change to what learners submit cannot silently redefine what the
 * operator reads. Every field is optional — a flag raised before answering has
 * no `input`/`acceptedAnswers`, and general feedback carries no context at all.
 */
export const adminFeedbackContextSchema = z
  .object({
    prompt: z.string().optional(),
    packLabel: z.string().optional(),
    packId: z.string().optional(),
    acceptedAnswers: z.array(z.string()).optional(),
    input: z.string().optional(),
  })
  .strict();

export type AdminFeedbackContext = z.infer<typeof adminFeedbackContextSchema>;

/**
 * One learner-submitted feedback row, resolved for display (#163): the stored
 * row plus the submitter's email, joined from `auth.users` at read time (the
 * feedback row itself stores only `user_id`, keeping one source of truth for
 * identity). `status` is read-only in v1 — the admin exposes no route that
 * writes it. The stored `card_id` is deliberately not carried: the operator's
 * table shows what the learner saw (prompt, pack, accepted answers), and
 * tracing a report back to its Card is an out-of-band SQL job in v1 (#160).
 */
export const adminFeedbackRowSchema = z
  .object({
    id: z.number().int(),
    createdAt: z.string().min(1),
    userId: z.string().min(1),
    userEmail: z.string().min(1).nullable(),
    kind: z.enum(["general", "question"]),
    comment: z.string().min(1),
    context: adminFeedbackContextSchema.optional(),
    status: z.enum(["unresolved", "resolved"]),
  })
  .strict();

export type AdminFeedbackRow = z.infer<typeof adminFeedbackRowSchema>;

/** `GET /feedback` — every submitted report, newest-first (#163). */
export const adminFeedbackListSchema = z.array(adminFeedbackRowSchema);

export type AdminFeedbackList = z.infer<typeof adminFeedbackListSchema>;

/**
 * `GET /feedback`'s filters (#163): status and kind, each optional and
 * composable. "All" is simply the absence of the filter, so the operator's
 * default view (no query string) is everything.
 */
export const adminFeedbackFilterSchema = z
  .object({
    status: z.enum(["unresolved", "resolved"]).optional(),
    kind: z.enum(["general", "question"]).optional(),
  })
  .strict();

export type AdminFeedbackFilter = z.infer<typeof adminFeedbackFilterSchema>;
