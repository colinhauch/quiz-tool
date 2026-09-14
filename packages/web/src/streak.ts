import type { AnswerLog, AnswerLogEntry } from "@geo/contract";

/**
 * How many questions a learner must *answer* in one streak-day for the day to
 * count toward their streak (spec #248). A named constant, not per-user
 * configuration: v1 ships a single tunable value, and making it a real
 * preference is a later ticket. Deliberately not in `preferencesSchema`.
 */
export const STREAK_THRESHOLD = 10;

/**
 * The streak-day boundary, in hours after midnight GMT (spec #248). A day runs
 * from 03:00 GMT to the next 03:00 GMT, so late-night practice still lands on
 * the day it felt like. Fixed zone (GMT), never device-local — the app has
 * never made a per-user timezone decision, and this doesn't either. A sibling of
 * {@link STREAK_THRESHOLD}: one place to tune, not a preference yet.
 */
export const STREAK_DAY_BOUNDARY_HOURS_GMT = 3;

const MS_PER_DAY = 86_400_000;
const BOUNDARY_MS = STREAK_DAY_BOUNDARY_HOURS_GMT * 3_600_000;

/** The learner's daily-streak figures, all derived from the answer log. */
export interface Streak {
  /** Consecutive satisfied streak-days ending today (if met) or yesterday. */
  current: number;
  /** The longest run of consecutive satisfied streak-days anywhere in history. */
  longest: number;
  /** Progress within the current streak-day. */
  today: { answered: number; threshold: number; met: boolean };
}

/**
 * The integer index of the streak-day an instant falls in: midnights are shifted
 * to the 03:00 GMT boundary, so an answer at 02:59 GMT counts for the previous
 * calendar day. Consecutive days differ by exactly 1, which is what the streak
 * walks rely on.
 */
function dayIndex(ms: number): number {
  return Math.floor((ms - BOUNDARY_MS) / MS_PER_DAY);
}

/**
 * Whether an entry counts toward a day's total: a real attempt, not a *skip*.
 * Same reading as the answer summary (ADR-0004) — a skip is a blank submission
 * (`correct: false` with empty input); a correct answer counts however little
 * was typed, and an incorrect non-blank guess counts too.
 */
function isAttempt(entry: AnswerLogEntry): boolean {
  return entry.correct || entry.input.trim() !== "";
}

/**
 * The learner's current streak, longest streak, and today's progress, derived
 * purely from their answer log and the current instant.
 *
 * `now` is a parameter, not the wall clock, so the result is deterministic under
 * test; production passes `new Date()`.
 *
 * Today counts toward the current streak only once it has met the threshold — an
 * in-progress today that is still short is not yet a miss, so the current streak
 * is the run ending yesterday until today is secured. The first *elapsed* day
 * below threshold breaks the run.
 */
export function streakOf(answers: AnswerLog, now: Date): Streak {
  const attemptsByDay = new Map<number, number>();
  for (const entry of answers) {
    if (!isAttempt(entry)) continue;
    const at = Date.parse(entry.askedAt);
    if (Number.isNaN(at)) continue;
    const day = dayIndex(at);
    attemptsByDay.set(day, (attemptsByDay.get(day) ?? 0) + 1);
  }

  const satisfied = (day: number): boolean => (attemptsByDay.get(day) ?? 0) >= STREAK_THRESHOLD;

  const todayIndex = dayIndex(now.getTime());
  const answeredToday = attemptsByDay.get(todayIndex) ?? 0;
  const todayMet = answeredToday >= STREAK_THRESHOLD;

  // Walk backwards from today (if met) or yesterday, counting satisfied days.
  let current = 0;
  for (let day = todayMet ? todayIndex : todayIndex - 1; satisfied(day); day -= 1) {
    current += 1;
  }

  // Longest run of consecutive satisfied days anywhere in the log.
  const days = [...attemptsByDay.keys()].filter(satisfied).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return {
    current,
    longest,
    today: { answered: answeredToday, threshold: STREAK_THRESHOLD, met: todayMet },
  };
}
