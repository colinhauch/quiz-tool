import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminAnswerRow,
  AdminCardDifficultyRow,
  AdminFeedbackContext,
  AdminFeedbackRecord,
  AdminPackAbilityRow,
  AdminReadStore,
  AdminUser,
} from "./read-store.js";

/**
 * The service-role `AdminReadStore` implementation (#140) — the production
 * path behind the interface in `read-store.ts`. `client` must be built with
 * `SUPABASE_SERVICE_KEY` (never the anon/publishable key): the service role
 * bypasses Postgres RLS entirely, which is what makes a cross-user read
 * possible at all, and is why only the BFF (`index.ts`) may ever hold that
 * key. This module imports nothing Node-native, mirroring `supabase-storage.ts`.
 *
 * The RLS-extension alternative (an admin role + read-all policies) is
 * deferred (#140 scope) — it would satisfy this same interface, so adopting
 * it later is a one-class swap at the call site in `index.ts`, nothing here.
 */

/** PostgREST's default page size cap; every full-table read below paginates past it (mirrors `supabase-storage.ts`'s `readAllCards`). */
const PAGE = 1000;

interface AnswerRow {
  user_id: string;
  card_id: string;
  input: string;
  correct: boolean;
  asked_at: string;
  card_difficulty: number | null;
  pack_ability: number | null;
  k_applied: number | null;
  rating_pack_id: string | null;
}

function toAnswerRow(row: AnswerRow): AdminAnswerRow {
  const record: AdminAnswerRow = {
    userId: row.user_id,
    cardId: row.card_id,
    input: row.input,
    correct: row.correct,
    askedAt: row.asked_at,
  };
  if (row.rating_pack_id !== null && row.card_difficulty !== null && row.pack_ability !== null && row.k_applied !== null) {
    record.snapshot = {
      difficulty: row.card_difficulty,
      ability: row.pack_ability,
      kApplied: row.k_applied,
      packId: row.rating_pack_id,
    };
  }
  return record;
}

const ANSWER_COLUMNS = "user_id, card_id, input, correct, asked_at, card_difficulty, pack_ability, k_applied, rating_pack_id";

interface FeedbackRow {
  id: number;
  user_id: string;
  kind: "general" | "question";
  card_id: string | null;
  comment: string;
  context: Record<string, unknown> | null;
  status: "unresolved" | "resolved";
  created_at: string;
}

/**
 * `context` is a jsonb column, so nothing constrains what is actually in it —
 * a row written out-of-band (the resolve-by-SQL workflow spec #160 describes)
 * could carry an extra key. The route parses rows through a `.strict()`
 * contract schema, so an unexpected key would fail the whole request; picking
 * the known fields here keeps one bad row from taking the surface down.
 */
function toFeedbackContext(context: Record<string, unknown>): AdminFeedbackContext {
  const out: AdminFeedbackContext = {};
  if (typeof context.prompt === "string") out.prompt = context.prompt;
  if (typeof context.packLabel === "string") out.packLabel = context.packLabel;
  if (typeof context.packId === "string") out.packId = context.packId;
  if (Array.isArray(context.acceptedAnswers)) {
    out.acceptedAnswers = context.acceptedAnswers.filter((a): a is string => typeof a === "string");
  }
  if (typeof context.input === "string") out.input = context.input;
  return out;
}

function toFeedbackRecord(row: FeedbackRow): AdminFeedbackRecord {
  const record: AdminFeedbackRecord = {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.card_id !== null) record.cardId = row.card_id;
  if (row.context !== null) record.context = toFeedbackContext(row.context);
  return record;
}

export function createSupabaseReadStore(client: SupabaseClient): AdminReadStore {
  return {
    async listUsers() {
      // The Admin API paginates; loop until a short page proves the end, same
      // guard `readAllCards` uses for PostgREST's row cap.
      const out: AdminUser[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE });
        if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
        for (const u of data.users) {
          out.push({
            id: u.id,
            email: u.email ?? null,
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at ?? null,
          });
        }
        if (data.users.length < PAGE) break;
      }
      return out;
    },

    async listAllAnswers() {
      const out: AdminAnswerRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("answers")
          .select(ANSWER_COLUMNS)
          .order("asked_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`answers.select-all failed: ${error.message}`);
        const rows = (data as AnswerRow[] | null) ?? [];
        out.push(...rows.map(toAnswerRow));
        if (rows.length < PAGE) break;
      }
      return out;
    },

    async listAnswersForUser(userId) {
      const out: AdminAnswerRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("answers")
          .select(ANSWER_COLUMNS)
          .eq("user_id", userId)
          .order("asked_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`answers.select-for-user failed: ${error.message}`);
        const rows = (data as AnswerRow[] | null) ?? [];
        out.push(...rows.map(toAnswerRow));
        if (rows.length < PAGE) break;
      }
      return out;
    },

    async listAllPackAbilities() {
      const out: AdminPackAbilityRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("pack_ability")
          .select("user_id, pack_id, ability")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`pack_ability.select-all failed: ${error.message}`);
        const rows = (data as { user_id: string; pack_id: string; ability: number }[] | null) ?? [];
        out.push(...rows.map((r) => ({ userId: r.user_id, packId: r.pack_id, ability: r.ability })));
        if (rows.length < PAGE) break;
      }
      return out;
    },

    async listCardDifficulties() {
      const out: AdminCardDifficultyRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("card_difficulty")
          .select("card_id, difficulty, answer_count")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`card_difficulty.select-all failed: ${error.message}`);
        const rows = (data as { card_id: string; difficulty: number; answer_count: number }[] | null) ?? [];
        out.push(...rows.map((r) => ({ cardId: r.card_id, difficulty: r.difficulty, answerCount: r.answer_count })));
        if (rows.length < PAGE) break;
      }
      return out;
    },

    // Only the service role can read this table at all: `feedback`'s RLS is
    // insert-only for `authenticated` with no select policy (spec #160), so a
    // learner can submit but never read feedback back — the admin BFF is the
    // one reader. Ordering is re-established by `buildFeedbackRows` anyway;
    // asking Postgres for it keeps paging stable across requests.
    async listFeedback() {
      const out: AdminFeedbackRecord[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
          .from("feedback")
          .select("id, user_id, kind, card_id, comment, context, status, created_at")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`feedback.select-all failed: ${error.message}`);
        const rows = (data as FeedbackRow[] | null) ?? [];
        out.push(...rows.map(toFeedbackRecord));
        if (rows.length < PAGE) break;
      }
      return out;
    },
  };
}
