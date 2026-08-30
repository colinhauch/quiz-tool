import type { AdminAccuracyBucket, AdminActivityDay, AdminPopulation } from "@geo/contract";
import type { AdminAnswerRow, AdminUser } from "./read-store.js";

/** Fixed-width accuracy buckets the population's per-user accuracy is sorted into. Users with zero answers have no accuracy and are excluded. */
const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0-25%", min: 0, max: 0.25 },
  { label: "25-50%", min: 0.25, max: 0.5 },
  { label: "50-75%", min: 0.5, max: 0.75 },
  { label: "75-100%", min: 0.75, max: 1 },
];

function bucketFor(accuracy: number): string {
  for (const bucket of BUCKETS) {
    // The top bucket's upper bound is inclusive (a perfect 100% still lands in "75-100%").
    if (accuracy >= bucket.min && (accuracy < bucket.max || bucket.max === 1)) return bucket.label;
  }
  return BUCKETS[BUCKETS.length - 1]?.label ?? "75-100%";
}

/**
 * The all-users aggregate view (#142): total counts, an accuracy distribution
 * across users, and per-day activity across the whole population. A pure
 * projection over whatever `AdminReadStore` returns — no filters, unlike
 * Results (#143), which is the answer-level counterpart of this.
 */
export function buildPopulation(users: readonly AdminUser[], answers: readonly AdminAnswerRow[]): AdminPopulation {
  const perUserTotals = new Map<string, { total: number; correct: number }>();
  for (const answer of answers) {
    const entry = perUserTotals.get(answer.userId) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (answer.correct) entry.correct += 1;
    perUserTotals.set(answer.userId, entry);
  }

  const bucketCounts = new Map<string, number>(BUCKETS.map((b) => [b.label, 0]));
  for (const { total, correct } of perUserTotals.values()) {
    if (total === 0) continue;
    const label = bucketFor(correct / total);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + 1);
  }
  const accuracyDistribution: AdminAccuracyBucket[] = BUCKETS.map((b) => ({
    label: b.label,
    userCount: bucketCounts.get(b.label) ?? 0,
  }));

  const perDay = new Map<string, { users: Set<string>; count: number }>();
  for (const answer of answers) {
    const date = answer.askedAt.slice(0, 10);
    const entry = perDay.get(date) ?? { users: new Set<string>(), count: 0 };
    entry.users.add(answer.userId);
    entry.count += 1;
    perDay.set(date, entry);
  }
  const activityByDay: AdminActivityDay[] = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { users: activeUsers, count }]) => ({ date, activeUsers: activeUsers.size, answerCount: count }));

  return {
    totalUsers: users.length,
    totalAnswers: answers.length,
    accuracyDistribution,
    activityByDay,
  };
}
