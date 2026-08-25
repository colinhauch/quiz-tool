import { SEED_RATING } from "@geo/engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerRecord, AnswerStore, RatingStore, SelectionStore } from "./storage.js";

/**
 * Supabase-backed stores — the production persistence path behind the same
 * interfaces the local better-sqlite3 stores implement (`storage.ts`).
 *
 * Ownership is never written by this code. Each `client` is scoped to one
 * signed-in user (its auth carries that user's JWT), the `user_id` columns
 * default to `auth.uid()`, and Postgres RLS forces every read and write to that
 * user's rows. So a store built from user A's client physically cannot see or
 * touch user B's data — the isolation lives in the database, not here (#57, #51).
 *
 * This module deliberately imports nothing from Node (`better-sqlite3` lives
 * only in `storage.ts`), so it bundles cleanly into a Cloudflare Worker.
 */

interface AnswerRow {
  card_id: string;
  input: string;
  correct: boolean;
  asked_at: string;
  card_difficulty: number | null;
  pack_ability: number | null;
  k_applied: number | null;
  rating_pack_id: string | null;
}

export function createSupabaseAnswerStore(client: SupabaseClient): AnswerStore {
  return {
    async record(answer: AnswerRecord) {
      // user_id is omitted on purpose: the column defaults to auth.uid() and the
      // RLS with-check pins it to the caller, so it cannot be forged here. The
      // four snapshot columns are null when the answer carried no rating (an
      // edge not in the graph).
      const { error } = await client.from("answers").insert({
        card_id: answer.cardId,
        input: answer.input,
        correct: answer.correct,
        asked_at: answer.askedAt,
        card_difficulty: answer.snapshot?.difficulty ?? null,
        pack_ability: answer.snapshot?.ability ?? null,
        k_applied: answer.snapshot?.kApplied ?? null,
        rating_pack_id: answer.snapshot?.packId ?? null,
      });
      if (error) throw new Error(`answers.insert failed: ${error.message}`);
    },

    async all() {
      // Ordered by id so the append log reads back in insertion order, matching
      // the sqlite store; RLS already restricts the rows to the caller.
      const { data, error } = await client
        .from("answers")
        .select("card_id, input, correct, asked_at, card_difficulty, pack_ability, k_applied, rating_pack_id")
        .order("id", { ascending: true });
      if (error) throw new Error(`answers.select failed: ${error.message}`);
      return (data as AnswerRow[] | null ?? []).map((row) => {
        const record: AnswerRecord = {
          cardId: row.card_id,
          input: row.input,
          correct: row.correct,
          askedAt: row.asked_at,
        };
        if (
          row.rating_pack_id !== null &&
          row.card_difficulty !== null &&
          row.pack_ability !== null &&
          row.k_applied !== null
        ) {
          record.snapshot = {
            difficulty: row.card_difficulty,
            ability: row.pack_ability,
            kApplied: row.k_applied,
            packId: row.rating_pack_id,
          };
        }
        return record;
      });
    },
  };
}

/**
 * Supabase-backed rating cache. `card_difficulty` is **global** — every learner's
 * answers move it — so it is written by any authenticated caller (its rows carry
 * no owner; a user tampering only corrupts a cache the log rebuilds). `pack_ability`
 * is per-`(learner, pack)`: `user_id` defaults to `auth.uid()` and RLS pins it, so
 * a store built from one user's client reads and writes only that user's ability.
 */
export function createSupabaseRatingStore(client: SupabaseClient): RatingStore {
  return {
    async readCard(cardId: string) {
      const { data, error } = await client
        .from("card_difficulty")
        .select("difficulty, answer_count")
        .eq("card_id", cardId)
        .maybeSingle();
      if (error) throw new Error(`card_difficulty.select failed: ${error.message}`);
      if (!data) return { difficulty: SEED_RATING, answerCount: 0 };
      return { difficulty: data.difficulty as number, answerCount: data.answer_count as number };
    },

    async readAbility(packId: string) {
      const { data, error } = await client
        .from("pack_ability")
        .select("ability")
        .eq("pack_id", packId)
        .maybeSingle();
      if (error) throw new Error(`pack_ability.select failed: ${error.message}`);
      return data ? (data.ability as number) : SEED_RATING;
    },

    async writeCard(cardId: string, difficulty: number, answerCount: number) {
      const { error } = await client
        .from("card_difficulty")
        .upsert({ card_id: cardId, difficulty, answer_count: answerCount }, { onConflict: "card_id" });
      if (error) throw new Error(`card_difficulty.upsert failed: ${error.message}`);
    },

    async writeAbility(packId: string, ability: number) {
      // user_id omitted: defaults to auth.uid(), pinned by RLS. Conflict on the
      // (user_id, pack_id) primary key updates this learner's ability in place.
      const { error } = await client
        .from("pack_ability")
        .upsert({ pack_id: packId, ability }, { onConflict: "user_id,pack_id" });
      if (error) throw new Error(`pack_ability.upsert failed: ${error.message}`);
    },
  };
}

export function createSupabaseSelectionStore(client: SupabaseClient): SelectionStore {
  return {
    async read() {
      // The sentinel row records that a selection was ever saved, keeping "saved
      // nothing" distinct from a first run. No row => first run => null, which
      // the app turns into "every selectable pack".
      const { data: state, error: stateErr } = await client
        .from("pack_selection_state")
        .select("user_id")
        .maybeSingle();
      if (stateErr) throw new Error(`pack_selection_state.select failed: ${stateErr.message}`);
      if (!state) return null;

      const { data, error } = await client
        .from("pack_selection")
        .select("pack_id")
        .order("pack_id", { ascending: true });
      if (error) throw new Error(`pack_selection.select failed: ${error.message}`);
      return (data as { pack_id: string }[] | null ?? []).map((row) => row.pack_id);
    },

    async write(packIds: string[]) {
      // One RPC so the whole-set replace is atomic in a single transaction — a
      // delete-then-insert over three PostgREST calls could half-apply.
      const { error } = await client.rpc("set_pack_selection", { p_pack_ids: packIds });
      if (error) throw new Error(`set_pack_selection failed: ${error.message}`);
    },
  };
}
