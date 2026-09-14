import type { AbilityPoint } from "@geo/contract";

/**
 * One pack's ability on one UTC day: the point plotted for that pack's line.
 * A day a pack was not played still carries a value — the last one known — so
 * the line reads as "unchanged", never as a break or a drop.
 */
export type AbilityDayValue = { day: string; ability: number };

/**
 * One pack's whole line: what to call it and its held-flat value on every day
 * from its first engaged day to the end of the timeline. `first` and `latest`
 * are the endpoints the ranked legend reads (the change chip is their
 * difference); they are `values[0]` and `values.at(-1)` respectively, surfaced
 * so the legend never has to reach into the array.
 */
export type AbilitySeries = {
  packId: string;
  label: string;
  values: AbilityDayValue[];
  first: number;
  latest: number;
};

/**
 * The plot-ready model: the shared day axis (every UTC day any pack was played,
 * oldest first) and one line per engaged pack. This is the whole compute seam —
 * the renderer does geometry and nothing else, and a future control that draws
 * only the top-N packs, or filters them, is a slice of `series` here, not a
 * change to this function.
 */
export type AbilityChartModel = { days: string[]; series: AbilitySeries[] };

/** The UTC calendar day of an ISO instant, `YYYY-MM-DD`, or null if unparseable. */
function utcDay(askedAt: string): string | null {
  const at = Date.parse(askedAt);
  if (Number.isNaN(at)) return null;
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Turns the learner's raw ability points (`GET /ability`, oldest first) into
 * plot-ready per-pack series (#250). The rules, all here so they are testable
 * without a browser:
 *
 * - **Last of day wins.** A pack's value for a UTC day is its *last* snapshot
 *   that day — the most recent ask. UTC matches the app's only date decision
 *   (`AnswerSummary.formatDate`); the app has made no timezone choice and this
 *   makes none either.
 * - **Hold flat.** A pack carries its last known value forward across days it
 *   wasn't played, up to the end of the timeline, so every line is comparable
 *   across the same day axis.
 * - **No back-fill.** A pack's line begins on its first engaged day; nothing is
 *   invented for the days before the pack existed for this learner.
 *
 * Points are sorted defensively rather than trusting the route's order, and a
 * point with an unparseable `askedAt` is dropped (it cannot be placed on the
 * day axis) rather than allowed to corrupt one.
 *
 * Series are ordered by first engaged day, then packId — a *stable* identity
 * order, deliberately not by ability. The legend re-sorts by ability into a
 * leaderboard, but colour is assigned from this stable order, so a pack keeps
 * its colour as it climbs the ranking.
 */
export function abilitySeriesOf(points: readonly AbilityPoint[]): AbilityChartModel {
  // Oldest first, ties broken by arrival order, so "last of day" is well defined
  // however the points arrived.
  const dated = points
    .map((p, i) => ({ p, i, day: utcDay(p.askedAt), at: Date.parse(p.askedAt) }))
    .filter((d): d is typeof d & { day: string } => d.day !== null)
    .sort((a, b) => a.at - b.at || a.i - b.i);

  const packs = new Map<string, { label: string | undefined; byDay: Map<string, number> }>();
  const allDays = new Set<string>();
  for (const { p, day } of dated) {
    allDays.add(day);
    const seen = packs.get(p.packId);
    if (seen) {
      seen.byDay.set(day, p.ability); // later in the sorted list → last of its day
      seen.label ??= p.packLabel; // first label wins; a later point can fill an earlier gap
    } else {
      packs.set(p.packId, { label: p.packLabel, byDay: new Map([[day, p.ability]]) });
    }
  }

  const days = [...allDays].sort();

  const series: AbilitySeries[] = [...packs]
    .map(([packId, { label, byDay }]) => {
      const first = firstDay(byDay);
      const values: AbilityDayValue[] = [];
      let last = 0;
      for (const day of days) {
        if (day < first) continue; // no back-fill before the pack's first engaged day
        if (byDay.has(day)) last = byDay.get(day) as number;
        values.push({ day, ability: last });
      }
      return {
        packId,
        label: label ?? packId,
        values,
        first: values[0]?.ability ?? 0,
        latest: values[values.length - 1]?.ability ?? 0,
      };
    })
    .sort((a, b) => a.values[0]!.day.localeCompare(b.values[0]!.day) || a.packId.localeCompare(b.packId));

  return { days, series };
}

/** The earliest day a pack was played — its line's start. */
function firstDay(byDay: Map<string, number>): string {
  let min: string | null = null;
  for (const day of byDay.keys()) if (min === null || day < min) min = day;
  return min as string;
}
