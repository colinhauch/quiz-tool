import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnswerRecord,
  AnswerStore,
  FeedbackRecord,
  FeedbackStore,
  SelectionStore,
} from "./storage.js";

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
}

export function createSupabaseAnswerStore(client: SupabaseClient): AnswerStore {
  return {
    async record(answer: AnswerRecord) {
      // user_id is omitted on purpose: the column defaults to auth.uid() and the
      // RLS with-check pins it to the caller, so it cannot be forged here.
      const { error } = await client.from("answers").insert({
        card_id: answer.cardId,
        input: answer.input,
        correct: answer.correct,
        asked_at: answer.askedAt,
      });
      if (error) throw new Error(`answers.insert failed: ${error.message}`);
    },

    async all() {
      // Ordered by id so the append log reads back in insertion order, matching
      // the sqlite store; RLS already restricts the rows to the caller.
      const { data, error } = await client
        .from("answers")
        .select("card_id, input, correct, asked_at")
        .order("id", { ascending: true });
      if (error) throw new Error(`answers.select failed: ${error.message}`);
      return (data as AnswerRow[] | null ?? []).map((row) => ({
        cardId: row.card_id,
        input: row.input,
        correct: row.correct,
        askedAt: row.asked_at,
      }));
    },
  };
}

/**
 * Supabase-backed feedback store — insert only. There is no read here on purpose:
 * the `feedback` table has an insert policy for `authenticated` and no select
 * policy, so a select would return nothing anyway (only the admin's `service_role`
 * reads it). `user_id` is omitted for the same reason the answer store omits it —
 * the column defaults to `auth.uid()` and the RLS with-check pins it to the caller.
 */
export function createSupabaseFeedbackStore(client: SupabaseClient): FeedbackStore {
  return {
    async record(feedback: FeedbackRecord) {
      const { error } = await client.from("feedback").insert({
        kind: feedback.kind,
        card_id: feedback.cardId,
        comment: feedback.comment,
        context: feedback.context,
        created_at: feedback.createdAt,
      });
      if (error) throw new Error(`feedback.insert failed: ${error.message}`);
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
