import { applyAnswer, emptyRatings, ownerPackId, type Pack } from "@geo/engine";
import type { AdminAbilityTrajectoryPoint } from "@geo/contract";
import type { AdminAnswerRow } from "./read-store.js";

/**
 * The ability-over-time graph for one user (#141), computed by replaying
 * their Answer Log through the engine's own rating primitive — no new rating
 * math. `replay` (`@geo/engine`) only returns the *final* tables; this needs
 * the sequence, so it drives the same `applyAnswer` step `replay` calls
 * internally, capturing a point whenever an answer actually moves a rating
 * (an edge no longer in the graph moves none and is skipped, exactly as
 * `applyAnswer` treats it).
 *
 * `answers` must already be in ask order — the callers here always source
 * them from `AdminReadStore`, which returns them that way.
 */
export function computeAbilityTrajectory(
  pack: Pack,
  userId: string,
  answers: readonly AdminAnswerRow[],
): AdminAbilityTrajectoryPoint[] {
  let ratings = emptyRatings();
  const points: AdminAbilityTrajectoryPoint[] = [];
  for (const answer of answers) {
    const packId = ownerPackId(pack, answer.cardId);
    const { ratings: next, snapshot } = applyAnswer(
      ratings,
      { cardId: answer.cardId, learnerId: userId, correct: answer.correct },
      packId,
    );
    ratings = next;
    if (snapshot) points.push({ askedAt: answer.askedAt, packId: snapshot.packId, ability: snapshot.ability });
  }
  return points;
}
