import type { AdminUserRow } from "@geo/contract";
import type { AdminAnswerRow, AdminUser } from "./read-store.js";

/**
 * Pairs the shared user roster with each user's activity in one Environment
 * (#173) — a pure projection, like every other admin aggregation.
 *
 * The two inputs have different scopes, which is the whole reason this exists:
 * `users` comes from `auth.users`, shared by every Environment, while
 * `answers` comes from one Environment's schema. Every user survives the join,
 * including those with nothing in this Environment — they come back as an
 * explicit zero, because "registered but never played here" is a finding, not
 * an absence to be filtered away.
 */
export function projectUserRows(users: AdminUser[], answers: AdminAnswerRow[]): AdminUserRow[] {
  const counts = new Map<string, number>();
  const latest = new Map<string, string>();

  for (const answer of answers) {
    counts.set(answer.userId, (counts.get(answer.userId) ?? 0) + 1);
    // Answers arrive in ask order today, but ordering is the store's promise,
    // not this function's assumption — compare rather than take the last seen.
    const seen = latest.get(answer.userId);
    if (seen === undefined || answer.askedAt > seen) latest.set(answer.userId, answer.askedAt);
  }

  return users.map((user) => ({
    ...user,
    answerCount: counts.get(user.id) ?? 0,
    lastAnsweredAt: latest.get(user.id) ?? null,
  }));
}
