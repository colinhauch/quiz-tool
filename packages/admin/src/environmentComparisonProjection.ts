import type { AdminEnvironmentStats } from "@geo/contract";
import type { AdminAnswerRow, AdminCardDifficultyRow, AdminPackAbilityRow } from "./read-store.js";

/**
 * The pure aggregation behind the Environments comparison surface (#174):
 * turns one environment's raw `AdminReadStore` rows into the row-set the
 * table renders, exactly the way `buildPopulation`/`buildLeaderboard` turn
 * raw rows into their surfaces' shapes. Deliberately takes no `AdminUser[]`
 * — every figure here is derivable from answers/abilities/difficulties
 * alone, and the one number this projection does *not* compute is the
 * registered-user count (`adminEnvironmentComparisonSchema.registeredUsers`),
 * which the route builds once from a single environment's `listUsers()`
 * because `auth.users` is shared across all three (CONTEXT.md).
 *
 * No new `AdminReadStore` method backs this — every input here already comes
 * out of `listAllAnswers`/`listAllPackAbilities`/`listCardDifficulties`,
 * which is the ticket's explicit constraint (the interface is the seam a
 * future RLS-based implementation swaps in as one class).
 */
export function buildEnvironmentStats(
  answers: readonly AdminAnswerRow[],
  packAbilities: readonly AdminPackAbilityRow[],
  cardDifficulties: readonly AdminCardDifficultyRow[],
): AdminEnvironmentStats {
  const usersWithAnswers = new Set(answers.map((a) => a.userId)).size;
  const totalAnswers = answers.length;
  const correctAnswers = answers.filter((a) => a.correct).length;
  // The division-by-zero case: an environment with no answers reads as 0%
  // accuracy, not NaN — there is nothing to divide by, and 0 is the value
  // every consumer (the table, the contract's `.min(0).max(1)`) can render
  // without a special case.
  const accuracy = totalAnswers === 0 ? 0 : correctAnswers / totalAnswers;
  const distinctCardsAnswered = new Set(answers.map((a) => a.cardId)).size;

  let firstAnswerAt: string | null = null;
  let lastAnswerAt: string | null = null;
  for (const answer of answers) {
    if (firstAnswerAt === null || answer.askedAt < firstAnswerAt) firstAnswerAt = answer.askedAt;
    if (lastAnswerAt === null || answer.askedAt > lastAnswerAt) lastAnswerAt = answer.askedAt;
  }

  const packsWithAbilityRows = new Set(packAbilities.map((p) => p.packId)).size;
  const ratedCards = new Set(cardDifficulties.map((c) => c.cardId)).size;

  return {
    usersWithAnswers,
    totalAnswers,
    accuracy,
    distinctCardsAnswered,
    firstAnswerAt,
    lastAnswerAt,
    packsWithAbilityRows,
    ratedCards,
  };
}
