import { findCard, type Pack } from "@geo/engine";
import type {
  AdminAccuracyByKey,
  AdminCardDifficulty,
  AdminLeaderboard,
  AdminLeaderboardEntry,
  AdminResultRow,
  AdminResultsFilter,
  AdminTimeSeriesPoint,
} from "@geo/contract";
import type { AdminCardDifficultyRow, AdminPackAbilityRow, AdminUser } from "./read-store.js";

/** How many rows each leaderboard and the hardest/easiest-Cards views surface. */
const LEADERBOARD_LIMIT = 20;
const CARD_LIST_LIMIT = 10;

/** Accuracy and volume, bucketed by day — the shared shape behind `accuracyOverTime`/`volumeOverTime` (#144). */
function bucketByDay(rows: readonly AdminResultRow[]): Map<string, { total: number; correct: number }> {
  const byDay = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    const date = row.askedAt.slice(0, 10);
    const entry = byDay.get(date) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (row.correct) entry.correct += 1;
    byDay.set(date, entry);
  }
  return byDay;
}

/** `accuracyOverTime` (#144): each day's accuracy over the (filtered) Results set. */
export function buildAccuracyOverTime(rows: readonly AdminResultRow[]): AdminTimeSeriesPoint[] {
  return [...bucketByDay(rows).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, correct }]) => ({ date, count: total, accuracy: total === 0 ? 0 : correct / total }));
}

/** `volumeOverTime` (#144): each day's answer count over the (filtered) Results set. */
export function buildVolumeOverTime(rows: readonly AdminResultRow[]): AdminTimeSeriesPoint[] {
  return [...bucketByDay(rows).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total }]) => ({ date, count: total }));
}

/** Accuracy grouped by an arbitrary key extractor — `accuracyByPack`/`accuracyByRelation` share this shape (#144). Rows whose key is absent (a stale card) are excluded. */
function buildAccuracyBy(rows: readonly AdminResultRow[], keyOf: (row: AdminResultRow) => string | undefined): AdminAccuracyByKey[] {
  const byKey = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === undefined) continue;
    const entry = byKey.get(key) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (row.correct) entry.correct += 1;
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { total, correct }]) => ({ key, count: total, accuracy: total === 0 ? 0 : correct / total }));
}

export function buildAccuracyByPack(rows: readonly AdminResultRow[]): AdminAccuracyByKey[] {
  return buildAccuracyBy(rows, (row) => row.packId);
}

export function buildAccuracyByRelation(rows: readonly AdminResultRow[]): AdminAccuracyByKey[] {
  return buildAccuracyBy(rows, (row) => row.relation);
}

/**
 * The three leaderboards (#144) — deliberately admin-only, distinct from the
 * player app's no-leaderboard stance. `byAbility` reads the cross-user
 * `pack_ability` cache directly (ability is per-`(user, pack)`, not derivable
 * from the filtered Results rows alone); `byAccuracy`/`byVolume` are computed
 * from the same (filtered) Results rows every other #144 view uses, so a
 * Results filter narrows them exactly as it narrows the charts.
 */
export function buildLeaderboard(
  users: readonly AdminUser[],
  packAbilities: readonly AdminPackAbilityRow[],
  filter: AdminResultsFilter,
  filteredRows: readonly AdminResultRow[],
): AdminLeaderboard {
  const emailByUserId = new Map(users.map((u) => [u.id, u.email]));

  const byAbility: AdminLeaderboardEntry[] = packAbilities
    .filter((row) => (filter.userId === undefined || row.userId === filter.userId) && (filter.packId === undefined || row.packId === filter.packId))
    .sort((a, b) => b.ability - a.ability)
    .slice(0, LEADERBOARD_LIMIT)
    .map((row) => ({ userId: row.userId, userEmail: emailByUserId.get(row.userId) ?? null, packId: row.packId, ability: row.ability }));

  const perUser = new Map<string, { total: number; correct: number }>();
  for (const row of filteredRows) {
    const entry = perUser.get(row.userId) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (row.correct) entry.correct += 1;
    perUser.set(row.userId, entry);
  }

  // byAccuracy and byVolume are the same ranking over `perUser`, differing only
  // in the metric each ranks and reports; one helper keeps them from drifting.
  const topBy = (
    metric: (stats: { total: number; correct: number }) => number,
  ): { userId: string; userEmail: string | null; value: number }[] =>
    [...perUser.entries()]
      .map(([userId, stats]) => ({ userId, value: metric(stats) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, LEADERBOARD_LIMIT)
      .map(({ userId, value }) => ({ userId, userEmail: emailByUserId.get(userId) ?? null, value }));

  const byAccuracy: AdminLeaderboardEntry[] = topBy(({ total, correct }) =>
    total === 0 ? 0 : correct / total,
  ).map(({ value, ...entry }) => ({ ...entry, accuracy: value }));

  const byVolume: AdminLeaderboardEntry[] = topBy(({ total }) => total).map(({ value, ...entry }) => ({
    ...entry,
    volume: value,
  }));

  return { byAbility, byAccuracy, byVolume };
}

/** Resolves a card id's statement/Relation/pack for display, absent when the card no longer resolves in the current graph. */
function resolveCard(pack: Pack, row: AdminCardDifficultyRow): AdminCardDifficulty {
  const card: AdminCardDifficulty = { cardId: row.cardId, difficulty: row.difficulty, answerCount: row.answerCount };
  try {
    const { statement } = findCard(pack, row.cardId);
    card.statementId = statement.id;
    card.relation = statement.relation;
    card.packId = statement.pack;
  } catch {
    // Card no longer resolves — leave the resolved fields absent.
  }
  return card;
}

/**
 * Hardest/easiest Cards (#144), driven by the global `card_difficulty` cache —
 * not the (possibly filtered) Results set, since difficulty is a property of
 * the Card itself, shared across every learner who has ever answered it.
 * Higher `difficulty` (Elo) means harder; ties broken by id for a stable order.
 */
export function buildHardestEasiestCards(pack: Pack, cardDifficulties: readonly AdminCardDifficultyRow[]): { hardestCards: AdminCardDifficulty[]; easiestCards: AdminCardDifficulty[] } {
  const sorted = [...cardDifficulties].sort((a, b) => b.difficulty - a.difficulty || a.cardId.localeCompare(b.cardId));
  const hardestCards = sorted.slice(0, CARD_LIST_LIMIT).map((row) => resolveCard(pack, row));
  const easiestCards = [...sorted]
    .reverse()
    .slice(0, CARD_LIST_LIMIT)
    .map((row) => resolveCard(pack, row));
  return { hardestCards, easiestCards };
}
