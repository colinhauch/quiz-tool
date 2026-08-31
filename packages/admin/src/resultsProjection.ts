import type { Pack } from "@geo/engine";
import type { AdminResultRow, AdminResultsFilter, AdminResultsResponse } from "@geo/contract";
import { resolveAnswerLogEntry } from "./userDetailProjection.js";
import type { AdminAnswerRow, AdminUser } from "./read-store.js";

/**
 * Resolves every recorded answer across every user into one flat, filterable
 * row (#143) — an Answer Log entry (`resolveAnswerLogEntry`, shared with the
 * single-user detail view, #141) plus which user answered it. This is the one
 * place Results and its charts/leaderboard (#144) both build their working
 * set from, so the two surfaces can never disagree on what a "row" resolves to.
 */
export function buildResultRows(pack: Pack, users: readonly AdminUser[], answers: readonly AdminAnswerRow[]): AdminResultRow[] {
  const emailByUserId = new Map(users.map((u) => [u.id, u.email]));
  return answers.map((answer) => ({
    ...resolveAnswerLogEntry(pack, answer),
    userId: answer.userId,
    userEmail: emailByUserId.get(answer.userId) ?? null,
  }));
}

/** `to` arrives as a bare date (no time) more often than not; treat it as the end of that day so the day itself is included. */
function normalizeTo(to: string): string {
  return to.includes("T") ? to : `${to}T23:59:59.999Z`;
}

/**
 * Applies the Results filters (#143) — user, pack, Relation, correctness,
 * date range — composably: every filter present narrows the set further.
 * Absent fields (a stale card that no longer resolves to a pack/Relation)
 * simply never match a `packId`/`relation` filter, which is the correct
 * behavior — a filter names things that exist in the current graph.
 */
export function filterResultRows(rows: readonly AdminResultRow[], filter: AdminResultsFilter): AdminResultRow[] {
  const to = filter.to !== undefined ? normalizeTo(filter.to) : undefined;
  return rows.filter((row) => {
    if (filter.userId !== undefined && row.userId !== filter.userId) return false;
    if (filter.packId !== undefined && row.packId !== filter.packId) return false;
    if (filter.relation !== undefined && row.relation !== filter.relation) return false;
    if (filter.correct !== undefined && row.correct !== filter.correct) return false;
    if (filter.from !== undefined && row.askedAt < filter.from) return false;
    if (to !== undefined && row.askedAt > to) return false;
    return true;
  });
}

/** `GET /results`'s response shape: the filtered rows plus counts/accuracy computed over that same filtered set. */
export function buildResultsResponse(rows: readonly AdminResultRow[]): AdminResultsResponse {
  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  return { rows: [...rows], total, accuracy: total === 0 ? 0 : correct / total };
}
