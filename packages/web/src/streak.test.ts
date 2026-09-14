import type { AnswerLogEntry } from "@geo/contract";
import { describe, expect, it } from "vitest";
import { STREAK_DAY_BOUNDARY_HOURS_GMT, STREAK_THRESHOLD, streakOf } from "./streak.js";

/**
 * A log entry with just the fields the streak reads. `correct`/`input` decide
 * skip vs. attempt (ADR-0004); `askedAt` decides the day. The rest are filler
 * the contract requires but the streak never looks at.
 */
function answer(askedAt: string, opts: { correct?: boolean; input?: string } = {}): AnswerLogEntry {
  const correct = opts.correct ?? true;
  return {
    cardId: "c",
    question: "q",
    input: opts.input ?? (correct ? "a" : "wrong"),
    correct,
    askedAt,
  };
}

/** `n` attempts (all correct) on the given GMT day at noon. */
function attempts(day: string, n: number): AnswerLogEntry[] {
  return Array.from({ length: n }, () => answer(`${day}T12:00:00.000Z`));
}

/** A day fully satisfied: exactly the threshold's worth of attempts. */
function fullDay(day: string): AnswerLogEntry[] {
  return attempts(day, STREAK_THRESHOLD);
}

const NOW = new Date("2026-09-14T12:00:00.000Z");

describe("streakOf", () => {
  it("reports zeros and today's threshold for an empty log", () => {
    expect(streakOf([], NOW)).toEqual({
      current: 0,
      longest: 0,
      today: { answered: 0, threshold: STREAK_THRESHOLD, met: false },
    });
  });

  it("counts today toward the current streak once it meets the threshold", () => {
    const s = streakOf(fullDay("2026-09-14"), NOW);
    expect(s.current).toBe(1);
    expect(s.today).toEqual({ answered: STREAK_THRESHOLD, threshold: STREAK_THRESHOLD, met: true });
  });

  it("does not count an in-progress today, but keeps the run through yesterday", () => {
    const log = [...fullDay("2026-09-13"), ...attempts("2026-09-14", STREAK_THRESHOLD - 1)];
    const s = streakOf(log, NOW);
    expect(s.current).toBe(1); // yesterday satisfied; today short is not yet a miss
    expect(s.today).toEqual({
      answered: STREAK_THRESHOLD - 1,
      threshold: STREAK_THRESHOLD,
      met: false,
    });
  });

  it("extends the current streak across consecutive satisfied days including today", () => {
    const log = [...fullDay("2026-09-12"), ...fullDay("2026-09-13"), ...fullDay("2026-09-14")];
    expect(streakOf(log, NOW).current).toBe(3);
  });

  it("breaks the current streak on the first elapsed day below threshold", () => {
    const log = [
      ...fullDay("2026-09-11"),
      ...attempts("2026-09-12", STREAK_THRESHOLD - 1), // short day = gap
      ...fullDay("2026-09-13"),
      ...fullDay("2026-09-14"),
    ];
    expect(streakOf(log, NOW).current).toBe(2); // 13th + 14th only
  });

  it("excludes skips: a day of only skips does not count", () => {
    const log = Array.from({ length: STREAK_THRESHOLD + 5 }, () =>
      answer("2026-09-14T12:00:00.000Z", { correct: false, input: "  " }),
    );
    const s = streakOf(log, NOW);
    expect(s.current).toBe(0);
    expect(s.today.answered).toBe(0);
  });

  it("excludes skips: threshold-minus-one attempts plus many skips is short", () => {
    const log = [
      ...attempts("2026-09-14", STREAK_THRESHOLD - 1),
      ...Array.from({ length: 20 }, () =>
        answer("2026-09-14T12:00:00.000Z", { correct: false, input: "" }),
      ),
    ];
    const s = streakOf(log, NOW);
    expect(s.today.answered).toBe(STREAK_THRESHOLD - 1);
    expect(s.today.met).toBe(false);
    expect(s.current).toBe(0);
  });

  it("counts incorrect attempts (only blank/skip is excluded)", () => {
    const log = attempts("2026-09-14", STREAK_THRESHOLD - 1).concat(
      answer("2026-09-14T12:00:00.000Z", { correct: false, input: "guess" }),
    );
    expect(streakOf(log, NOW).today.met).toBe(true);
  });

  it("buckets answers by the 03:00 GMT boundary", () => {
    // 02:59 GMT on the 14th belongs to the 13th's streak-day; 03:00 to the 14th.
    const beforeBoundary = Array.from({ length: STREAK_THRESHOLD }, () =>
      answer("2026-09-14T02:59:00.000Z"),
    );
    const s = streakOf(beforeBoundary, NOW);
    expect(s.today.answered).toBe(0); // landed on the 13th, not today
    expect(s.current).toBe(1); // 13th satisfied; today (short) not yet a miss → run ends yesterday
  });

  it("credits the previous streak-day for pre-boundary answers", () => {
    // Yesterday satisfied via a batch just before the boundary; today untouched.
    const log = Array.from({ length: STREAK_THRESHOLD }, () =>
      answer("2026-09-14T02:59:00.000Z"),
    );
    // now is 04:00 GMT on the 14th → today is the 14th, yesterday is the 13th run.
    expect(streakOf(log, new Date("2026-09-14T04:00:00.000Z")).current).toBe(1);
  });

  it("reports longest exceeding current when a past run was longer", () => {
    const log = [
      ...fullDay("2026-09-01"),
      ...fullDay("2026-09-02"),
      ...fullDay("2026-09-03"),
      // gap
      ...fullDay("2026-09-14"),
    ];
    const s = streakOf(log, NOW);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
  });

  it("exposes the day boundary as 03:00 GMT", () => {
    expect(STREAK_DAY_BOUNDARY_HOURS_GMT).toBe(3);
  });
});
