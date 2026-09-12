import type { AnswerLog as AnswerLogData, AnswerLogEntry } from "@geo/contract";

/**
 * The three-way reading of an answer's outcome (ADR-0004). It exists only here,
 * at read time: storage knows `correct` and nothing else, and a *Skip* is still
 * recorded `correct: false`.
 */
type Outcome = "correct" | "incorrect" | "skip";

const OUTCOME_LABEL: Record<Outcome, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  skip: "Skip",
};

/**
 * A *Skip* is an answer submitted with no input. `correct` is checked first on
 * purpose: no blank answer has ever been graded correct, but that is a fact
 * about the data, not an invariant, and a correct answer is correct however
 * little was typed to earn it.
 */
function outcomeOf(answer: AnswerLogEntry): Outcome {
  if (answer.correct) return "correct";
  return answer.input.trim() === "" ? "skip" : "incorrect";
}

export function AnswerSummary({ answers }: { answers: AnswerLogData }) {
  const counts: Record<Outcome, number> = { correct: 0, incorrect: 0, skip: 0 };
  for (const answer of answers) counts[outcomeOf(answer)] += 1;

  const attempted = answers.length - counts.skip;
  // Zero attempts has no attempted accuracy — not 0%, which would read as
  // "always wrong" when the learner has simply never guessed.
  const attemptedAccuracy = attempted === 0 ? null : (counts.correct / attempted) * 100;
  const distinctCards = new Set(answers.map((answer) => answer.cardId)).size;
  const firstAnsweredAt = earliest(answers);

  const shares = sharesOf([counts.correct, counts.incorrect, counts.skip], answers.length);
  const slices = (["correct", "incorrect", "skip"] as const)
    .map((outcome, i) => ({ outcome, count: counts[outcome], share: shares[i] ?? 0 }))
    // A category nobody has ever hit is absent, not a zero-width sliver.
    .filter((slice) => slice.count > 0);

  return (
    <section className="answer-summary">
      <div className="answer-summary__chart" role="group" aria-labelledby="answer-summary-outcomes">
        <h3 id="answer-summary-outcomes">Outcomes</h3>

        <div className="answer-summary__plot">
          {/* The legend carries every value as text, so the pie itself is
              decorative: announcing the same numbers twice helps nobody. */}
          <svg
            className="answer-summary__pie"
            viewBox="0 0 100 100"
            aria-hidden="true"
            focusable="false"
          >
            {wedgesOf(slices).map((wedge) =>
              wedge.whole ? (
                <circle
                  key={wedge.outcome}
                  data-outcome={wedge.outcome}
                  className={`answer-summary__wedge answer-summary__wedge--${wedge.outcome}`}
                  cx={CENTRE}
                  cy={CENTRE}
                  r={RADIUS}
                />
              ) : (
                <path
                  key={wedge.outcome}
                  data-outcome={wedge.outcome}
                  className={`answer-summary__wedge answer-summary__wedge--${wedge.outcome}`}
                  d={wedge.d}
                />
              ),
            )}
          </svg>

          <ul className="answer-summary__legend">
            {slices.map((slice) => (
              <li
                key={slice.outcome}
                className={`answer-summary__key answer-summary__key--${slice.outcome}`}
              >
                <span className="answer-summary__swatch" aria-hidden="true" />
                {/* The spaces are load-bearing: without them a screen reader
                    runs the label, count and share together as one word. */}
                <span className="answer-summary__key-label">{OUTCOME_LABEL[slice.outcome]}</span>{" "}
                <span className="answer-summary__key-count">{slice.count}</span>{" "}
                <span className="answer-summary__key-share">({formatPercent(slice.share)})</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="answer-summary__headline">
          <span className="answer-summary__headline-value">{formatPercent(shares[0] ?? 0)}</span>{" "}
          <span className="answer-summary__headline-label">
            absolute accuracy — correct of all {answers.length}{" "}
            {answers.length === 1 ? "answer" : "answers"}, skips included
          </span>
        </p>
      </div>

      <table className="answer-summary__totals">
        <caption>Totals</caption>
        <tbody>
          <tr>
            <th scope="row">Questions attempted</th>
            <td>
              {attempted}{" "}
              <span className="answer-summary__note">
                of {answers.length} answered, skips excluded
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">Attempted accuracy</th>
            <td>
              {attemptedAccuracy === null ? "—" : formatPercent(round1(attemptedAccuracy))}{" "}
              <span className="answer-summary__note">
                {attemptedAccuracy === null
                  ? "no attempts yet — every answer so far is a skip"
                  : `correct of ${attempted} attempted`}
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">Distinct cards seen</th>
            <td>{distinctCards}</td>
          </tr>
          <tr>
            <th scope="row">First answer</th>
            <td>
              {firstAnsweredAt === null ? (
                "—"
              ) : (
                <time dateTime={firstAnsweredAt.iso}>{formatDate(firstAnsweredAt.iso)}</time>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/**
 * The oldest answer in the log. Folded rather than read off the end, because
 * nothing in the contract promises the server's ordering, and an `askedAt` the
 * browser can't parse is skipped rather than allowed to win the comparison.
 */
function earliest(answers: AnswerLogData): { iso: string; at: number } | null {
  let best: { iso: string; at: number } | null = null;
  for (const answer of answers) {
    const at = Date.parse(answer.askedAt);
    if (Number.isNaN(at)) continue;
    if (best === null || at < best.at) best = { iso: answer.askedAt, at };
  }
  return best;
}

/**
 * Fixed locale and UTC, so the date a learner reads is the one the server
 * recorded. Per-day metrics were left out of #233 precisely because the app has
 * never made a timezone decision; this single date does not make one either.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const CENTRE = 50;
const RADIUS = 48;

type Slice = { outcome: Outcome; count: number; share: number };
type Wedge = { outcome: Outcome; whole: true } | { outcome: Outcome; whole: false; d: string };

/**
 * Wedges sized by the *counts*, not the rounded shares, so the pie is drawn
 * from the truth and only the labels are rounded.
 */
function wedgesOf(slices: readonly Slice[]): Wedge[] {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) return [];
  // One outcome accounting for everything is a whole circle: an arc from 0° to
  // 360° starts and ends at the same point and draws nothing at all.
  if (slices.length === 1) {
    const only = slices[0] as Slice;
    return [{ outcome: only.outcome, whole: true }];
  }

  let angle = 0;
  return slices.map((slice) => {
    const start = angle;
    angle += (slice.count / total) * 360;
    return { outcome: slice.outcome, whole: false as const, d: arcPath(start, angle) };
  });
}

function arcPath(startAngle: number, endAngle: number): string {
  const from = pointOnCircle(startAngle);
  const to = pointOnCircle(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CENTRE} ${CENTRE} L ${from} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${to} Z`;
}

/** Degrees clockwise from twelve o'clock, where a pie conventionally starts. */
function pointOnCircle(degrees: number): string {
  const radians = ((degrees - 90) * Math.PI) / 180;
  const x = CENTRE + RADIUS * Math.cos(radians);
  const y = CENTRE + RADIUS * Math.sin(radians);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

/**
 * Percentages of one whole, rounded so they still sum to 100 — largest
 * remainder, so the labels agree with one another and with the pie.
 */
function sharesOf(counts: readonly number[], total: number): number[] {
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count / total) * 100);
  const floored = exact.map((value) => Math.floor(value * 10) / 10);
  let remaining = Math.round((100 - floored.reduce((a, b) => a + b, 0)) * 10);
  const order = exact
    .map((value, i) => ({ i, remainder: value - (floored[i] ?? 0) }))
    .sort((a, b) => b.remainder - a.remainder);
  const shares = [...floored];
  for (const { i } of order) {
    if (remaining <= 0) break;
    shares[i] = Math.round(((shares[i] ?? 0) + 0.1) * 10) / 10;
    remaining -= 1;
  }
  return shares;
}

function formatPercent(share: number): string {
  return `${share.toFixed(1)}%`;
}
