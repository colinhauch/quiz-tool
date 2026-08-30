/**
 * `AdminReadStore` — the single seam every cross-user read passes through
 * (#140). It exists because every other store in this codebase
 * (`AnswerStore`/`RatingStore`/`SelectionStore` in `@geo/server/storage`) is
 * deliberately scoped to *one* signed-in learner by Postgres RLS; nothing in
 * the player app ever needs to see across users. The admin visualizer is the
 * first thing that does, so it gets its own interface rather than widening
 * the player-facing ones.
 *
 * The shipped implementation (`supabase-read-store.ts`) uses the service-role
 * key, which bypasses RLS entirely — that is what "cross-user" *means* here.
 * A future RLS-extension implementation (an admin role with a read-all policy)
 * satisfies the exact same interface, so callers never change when that
 * lands; only the one class swaps.
 */

/** One user, as `auth.users` reports it via the service-role Admin API. */
export interface AdminUser {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

/** The rating snapshot an answer carried at ask time (mirrors `RatingSnapshotRow` in `@geo/server/storage`). */
export interface AdminRatingSnapshot {
  difficulty: number;
  ability: number;
  kApplied: number;
  packId: string;
}

/** One recorded answer, across any user. */
export interface AdminAnswerRow {
  userId: string;
  cardId: string;
  input: string;
  correct: boolean;
  askedAt: string;
  snapshot?: AdminRatingSnapshot;
}

/** One `(user, pack)` Elo ability row from the cross-user `pack_ability` cache. */
export interface AdminPackAbilityRow {
  userId: string;
  packId: string;
  ability: number;
}

/** One card's global Elo difficulty, from the cross-user `card_difficulty` cache. */
export interface AdminCardDifficultyRow {
  cardId: string;
  difficulty: number;
  answerCount: number;
}

/** The snapshot a question-feedback row captured at submission time (mirrors the `context` jsonb column). */
export interface AdminFeedbackContext {
  prompt?: string;
  packLabel?: string;
  packId?: string;
  acceptedAnswers?: string[];
  input?: string;
}

/**
 * One row of the `feedback` table, as the service role reads it (#163). It
 * carries `userId` only — the email is joined in by the projection, so
 * identity has one source of truth (`auth.users`) rather than a denormalized
 * copy on the feedback row.
 */
export interface AdminFeedbackRecord {
  id: number;
  userId: string;
  kind: "general" | "question";
  cardId?: string;
  comment: string;
  context?: AdminFeedbackContext;
  status: "unresolved" | "resolved";
  createdAt: string;
}

export interface AdminReadStore {
  /** Every user in the system. */
  listUsers(): Promise<AdminUser[]>;
  /** Every recorded answer across every user, in ask order. */
  listAllAnswers(): Promise<AdminAnswerRow[]>;
  /** One user's recorded answers, in ask order. */
  listAnswersForUser(userId: string): Promise<AdminAnswerRow[]>;
  /** Every `(user, pack)` ability row across every user. */
  listAllPackAbilities(): Promise<AdminPackAbilityRow[]>;
  /** The global card-difficulty cache — every rated Card. */
  listCardDifficulties(): Promise<AdminCardDifficultyRow[]>;
  /** Every learner-submitted feedback row, across every user (#163). */
  listFeedback(): Promise<AdminFeedbackRecord[]>;
}

/** In-memory seed data for {@link createInMemoryReadStore}. */
export interface InMemoryReadStoreSeed {
  users?: AdminUser[];
  answers?: AdminAnswerRow[];
  packAbilities?: AdminPackAbilityRow[];
  cardDifficulties?: AdminCardDifficultyRow[];
  feedback?: AdminFeedbackRecord[];
}

/**
 * A fake `AdminReadStore` backed by plain arrays — no network, no Supabase.
 * The BFF route tests inject this instead of the service-role implementation,
 * exactly as `admin-app.test.ts` injects a fixture `Pack` instead of loading
 * one from disk.
 */
export function createInMemoryReadStore(seed: InMemoryReadStoreSeed = {}): AdminReadStore {
  const users = seed.users ?? [];
  const answers = seed.answers ?? [];
  const packAbilities = seed.packAbilities ?? [];
  const cardDifficulties = seed.cardDifficulties ?? [];
  const feedback = seed.feedback ?? [];

  return {
    async listUsers() {
      return users;
    },
    async listAllAnswers() {
      return answers;
    },
    async listAnswersForUser(userId) {
      return answers.filter((a) => a.userId === userId);
    },
    async listAllPackAbilities() {
      return packAbilities;
    },
    async listCardDifficulties() {
      return cardDifficulties;
    },
    async listFeedback() {
      return feedback;
    },
  };
}
