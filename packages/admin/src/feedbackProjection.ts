import type { AdminFeedbackFilter, AdminFeedbackRow } from "@geo/contract";
import type { AdminFeedbackRecord, AdminUser } from "./read-store.js";

/**
 * Resolves stored feedback rows into what the operator's table renders (#163):
 * the row as the service role read it, plus the submitter's email joined from
 * `auth.users`, newest-first. A pure projection — the route does the I/O, this
 * does the shaping, so both are testable on their own (prior art:
 * `populationProjection`, `resultsProjection`).
 *
 * An unknown `userId` (a user deleted since submitting, though the table's
 * `on delete cascade` makes that rare) resolves to a null email rather than
 * dropping the row: the operator should still see what was reported.
 */
export function buildFeedbackRows(
  users: readonly AdminUser[],
  feedback: readonly AdminFeedbackRecord[],
): AdminFeedbackRow[] {
  const emailByUserId = new Map(users.map((u) => [u.id, u.email]));
  return [...feedback]
    .sort((a, b) => (a.createdAt === b.createdAt ? b.id - a.id : a.createdAt < b.createdAt ? 1 : -1))
    .map((record) => {
      const row: AdminFeedbackRow = {
        id: record.id,
        createdAt: record.createdAt,
        userId: record.userId,
        userEmail: emailByUserId.get(record.userId) ?? null,
        kind: record.kind,
        comment: record.comment,
        status: record.status,
      };
      if (record.context !== undefined) row.context = record.context;
      return row;
    });
}

/** Applies the status and kind filters composably; an absent filter means "all" (#163). */
export function filterFeedbackRows(
  rows: readonly AdminFeedbackRow[],
  filter: AdminFeedbackFilter,
): AdminFeedbackRow[] {
  return rows.filter((row) => {
    if (filter.status !== undefined && row.status !== filter.status) return false;
    if (filter.kind !== undefined && row.kind !== filter.kind) return false;
    return true;
  });
}
