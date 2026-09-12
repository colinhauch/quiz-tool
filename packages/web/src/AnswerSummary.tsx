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

/**
 * The grouping key for answers no pack owns. No real pack id can be empty (the
 * contract requires at least one character), so it cannot collide, and it is
 * also the `data-pack` handle the tests read.
 */
const UNOWNED = "";

/**
 * What the breakdown calls answers no pack owns. They get a band of their own
 * rather than being dropped: dropping them makes every other share wrong, and
 * the shares are the whole point of the chart.
 */
const UNOWNED_LABEL = "Card no longer in any pack";

/** One pack's worth of the log: what to call it, how much of the log it is. */
type PackTally = { packId: string; label: string; count: number; share: number };

/**
 * The log grouped by the pack that owns each answer's card, largest first.
 * Ranked by magnitude rather than by name because the question the chart
 * answers is "where has my practice gone?"; ties break towards the owned pack,
 * so the order is a function of the data and not of the log's arrival sequence.
 *
 * The pack id is the grouping key even when a label exists — two packs may
 * share a display name, and the id is what the server resolved.
 */
function packTalliesOf(answers: AnswerLogData): PackTally[] {
  const counts = new Map<string, { label: string | undefined; count: number }>();
  for (const answer of answers) {
    const key = answer.packId ?? UNOWNED;
    const seen = counts.get(key);
    // First label wins, and a later entry can supply one an earlier entry
    // lacked: the two fields go absent independently at the seam.
    if (seen) {
      seen.count += 1;
      seen.label ??= answer.packLabel;
    } else {
      counts.set(key, { label: answer.packLabel, count: 1 });
    }
  }

  const ranked = [...counts].sort(([aId, a], [bId, b]) => {
    if (a.count !== b.count) return b.count - a.count;
    if (aId === UNOWNED) return 1;
    if (bId === UNOWNED) return -1;
    return labelFor(aId, a.label).localeCompare(labelFor(bId, b.label));
  });

  const shares = sharesOf(
    ranked.map(([, entry]) => entry.count),
    answers.length,
  );
  return ranked.map(([packId, entry], i) => ({
    packId,
    label: labelFor(packId, entry.label),
    count: entry.count,
    share: shares[i] ?? 0,
  }));
}

/**
 * A pack's display name, falling back to its id. The label is absent whenever
 * the graph held the statement but not the manifest that names its pack — an id
 * is worse to read but still true, and better than a band labelled with
 * nothing.
 */
function labelFor(packId: string, label: string | undefined): string {
  if (packId === UNOWNED) return UNOWNED_LABEL;
  return label ?? packId;
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

  const packTallies = packTalliesOf(answers);
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
              <LegendKey
                key={slice.outcome}
                colour={`answer-summary__key--${slice.outcome}`}
                label={OUTCOME_LABEL[slice.outcome]}
                count={slice.count}
                share={slice.share}
              />
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

      {/* A stacked bar rather than a second pie: there are seven packs today,
          and a pie is a weak form for comparing that many magnitudes — the
          small slices become indistinguishable wedges. The bar spans the whole
          grid because it is the one block here that gets better with width. */}
      <div className="answer-summary__packs" role="group" aria-labelledby="answer-summary-packs">
        <h3 id="answer-summary-packs">Packs</h3>

        <div className="answer-summary__plot answer-summary__plot--stacked">
          {/* Segments are sized by the counts, not the rounded shares, so the
              proportions come from the truth and only the labels are rounded.
              Two things deliberately break exact proportionality: hairline
              separators, and a floor that keeps a pack with a handful of
              answers visible at all. Both cost the smallest packs a pixel or
              two of over-read; their exact figures sit in the legend below. */}
          <div className="answer-summary__bar" aria-hidden="true">
            {packTallies.map((tally, i) => (
              <span
                key={tally.packId}
                data-pack={tally.packId}
                className={`answer-summary__segment ${colourClass(packTallies, i)}`}
                style={{ flexGrow: tally.count }}
              />
            ))}
          </div>

          <ul className="answer-summary__legend answer-summary__legend--packs">
            {packTallies.map((tally, i) => (
              <LegendKey
                key={tally.packId}
                colour={colourClass(packTallies, i)}
                label={tally.label}
                count={tally.count}
                share={tally.share}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * One entry of a chart legend: a swatch, then the label, count and share as
 * text. Both charts announce their values here and mark the drawing itself
 * `aria-hidden`, so this markup is the accessible reading of either one — which
 * is why they share it rather than each keeping a copy.
 */
function LegendKey({
  colour,
  label,
  count,
  share,
}: {
  colour: string;
  label: string;
  count: number;
  share: number;
}) {
  return (
    <li className={`answer-summary__key ${colour}`}>
      <span className="answer-summary__swatch" aria-hidden="true" />
      {/* The spaces are load-bearing: without them a screen reader runs the
          label, count and share together as one word. */}
      <span className="answer-summary__key-label">{label}</span>{" "}
      <span className="answer-summary__key-count">{count}</span>{" "}
      <span className="answer-summary__key-share">({formatPercent(share)})</span>
    </li>
  );
}

/**
 * Which colour a tally wears — worn by both the bar segment and its legend
 * swatch, so the two can never drift apart. Packs carry no semantics, so the
 * ramp is categorical and assigned by rank, deliberately avoiding the three
 * outcome colours, which do mean something. It wraps rather than running out,
 * because the number of packs is not fixed; the legend carries every value as
 * text, so colour is never the only way to read the chart.
 *
 * The unowned tally is off the ramp and does not consume a rank: it is not a
 * pack, and letting it take a colour would silently skip one for every learner
 * who has an unowned answer.
 */
function colourClass(tallies: readonly PackTally[], index: number): string {
  if (tallies[index]?.packId !== UNOWNED) {
    const rank = tallies.slice(0, index).filter((t) => t.packId !== UNOWNED).length;
    return `answer-summary__colour--${rank % CATEGORICAL_RAMP}`;
  }
  return "answer-summary__colour--unowned";
}

/** How many colours the ramp holds. Must match `--colour-0…n` in `index.css`. */
const CATEGORICAL_RAMP = 8;

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
