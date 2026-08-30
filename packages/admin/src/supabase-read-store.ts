import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminAnswerRow,
  AdminCardDifficultyRow,
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

// The schema generic is deliberately loosened from `SupabaseClient`'s default
// (`"public"` only) to `any`: `index.ts` builds one client per Environment
// via `createClient(url, key, { db: { schema } })` with `schema` a plain
// runtime string (`SCHEMA_BY_ENVIRONMENT[env]`), so the schema a given client
// is bound to isn't known at the type level — only at the call site that
// constructs it. This function works identically no matter which schema the
// client is bound to; that's the entire point of the interface (#172).
export function createSupabaseReadStore(client: SupabaseClient<any, any, any>): AdminReadStore {
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
  };
}
