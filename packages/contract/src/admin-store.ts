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
