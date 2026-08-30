import { findCard, ownerPackId, type Pack } from "@geo/engine";
import type { AdminAnswerLogEntry, AdminUser, AdminUserAbility, AdminUserAggregate, AdminUserDetail } from "@geo/contract";
import { computeAbilityTrajectory } from "./abilityTrajectory.js";
import type { AdminAnswerRow, AdminPackAbilityRow } from "./read-store.js";

/**
 * Resolves one raw answer row for display and for jumping to its Card/Entity
 * on the Packs surface (#141). `findCard` throws when the card's statement is
 * no longer in the assembled graph (a pack changed or was removed) — that
 * answer still happened, so it renders with the resolved fields simply absent
 * rather than being dropped, mirroring how `answerLogEntrySchema`'s
 * `acceptedAnswer` handles the same staleness in `@geo/contract/index.ts`.
 */
export function resolveAnswerLogEntry(pack: Pack, answer: AdminAnswerRow): AdminAnswerLogEntry {
  const entry: AdminAnswerLogEntry = {
    cardId: answer.cardId,
    input: answer.input,
    correct: answer.correct,
    askedAt: answer.askedAt,
  };
  try {
    const { statement } = findCard(pack, answer.cardId);
    entry.statementId = statement.id;
    entry.relation = statement.relation;
    entry.packId = statement.pack;
    entry.subjectEntityId = statement.subject;
  } catch {
    // Card no longer resolves — leave the resolved fields absent.
  }
  return entry;
}

/** How many of a user's most recent answers the detail view surfaces (#141: "recent Answer Log entries"). */
const RECENT_ANSWERS_LIMIT = 50;

/**
 * Builds the single-user detail view (#141): ability per pack, per-user
 * rollups, the most recent Answer Log entries (newest first), and the
 * replay-derived ability trajectory. `answers` must be in ask order (oldest
 * first) — that's both what the trajectory needs and what `AdminReadStore`
 * returns.
 */
export function buildUserDetail(
  pack: Pack,
  user: AdminUser,
  answers: readonly AdminAnswerRow[],
  packAbilities: readonly AdminPackAbilityRow[],
): AdminUserDetail {
  const abilities: AdminUserAbility[] = packAbilities
    .filter((row) => row.userId === user.id)
    .map((row) => ({
      packId: row.packId,
      packLabel: pack.packs.get(row.packId)?.labels.en ?? row.packId,
      ability: row.ability,
    }));

  const totalAnswers = answers.length;
  const correctCount = answers.filter((a) => a.correct).length;
  const packsTouched = [...new Set(answers.map((a) => a.snapshot?.packId ?? ownerPackId(pack, a.cardId)).filter((id): id is string => id !== undefined))];
  const lastActiveAt = answers.reduce<string | null>((latest, a) => (latest === null || a.askedAt > latest ? a.askedAt : latest), null);

  const aggregate: AdminUserAggregate = {
    totalAnswers,
    accuracy: totalAnswers === 0 ? 0 : correctCount / totalAnswers,
    packsTouched,
    lastActiveAt,
  };

  const recentAnswers = [...answers]
    .sort((a, b) => b.askedAt.localeCompare(a.askedAt))
    .slice(0, RECENT_ANSWERS_LIMIT)
    .map((a) => resolveAnswerLogEntry(pack, a));

  const trajectory = computeAbilityTrajectory(pack, user.id, answers);

  return { user, abilities, aggregate, recentAnswers, trajectory };
}
