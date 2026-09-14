import type { AbilityHistory } from "@geo/contract";
import { type AbilityDayValue, abilitySeriesOf } from "./abilityChart.js";

/**
 * The learner's ability over time (#247/#250): one line per engaged pack on a
 * shared θ axis, with a ranked leaderboard legend beneath. Follows the repo's
 * other hand-rolled charts (`AnswerSummary`, the admin `AbilitySparkline`) — no
 * charting dependency, and no hover layer: the SVG is `aria-hidden` decoration
 * and the legend is the accessible reading, carrying every pack's identity and
 * current value as text so the chart never depends on colour alone.
 *
 * Built to stay legible as packs multiply. Colour is assigned from the stable
 * series order (`abilitySeriesOf` sorts by first engaged day, never by rank), so
 * the leaderboard can reorder without a pack ever changing colour, and it wraps
 * the 8-step ramp rather than inventing hues. The overall/aggregate line is a
 * separate ticket; this draws per-pack lines only.
 */
export function AbilityChart({ points }: { points: AbilityHistory }) {
  const { days, series, overall } = abilitySeriesOf(points);

  if (series.length === 0) {
    return (
      <section className="ability-chart" aria-labelledby="ability-chart-title">
        <h3 id="ability-chart-title">Ability over time</h3>
        {/* Mirrors the admin sparkline's empty state — a message, not a blank axis. */}
        <p className="ability-chart__empty">No answers yet. Answer a question to start the chart.</p>
      </section>
    );
  }

  const dayIndex = new Map(days.map((day, i) => [day, i]));
  const abilities = series.flatMap((s) => s.values.map((v) => v.ability));
  // A one-value span has no range; a 1-unit floor keeps the flat line off the
  // axis edge instead of dividing by zero.
  const min = Math.min(...abilities);
  const max = Math.max(...abilities);
  const span = max - min || 1;

  const x = (day: string) =>
    days.length === 1 ? PLOT_W / 2 : ((dayIndex.get(day) as number) / (days.length - 1)) * PLOT_W;
  const y = (ability: number) => PLOT_H - ((ability - min) / span) * PLOT_H;

  // Colour is keyed to the stable order, so it stays with the pack. The legend
  // re-sorts by current ability (a leaderboard) but carries the same colour.
  const withColour = series.map((s, i) => ({ series: s, colour: colourClass(i) }));
  const ranked = [...withColour].sort((a, b) => b.series.latest - a.series.latest);

  // The overall line always spans the whole axis, so its endpoints are the ends
  // of the series. `series` is non-empty here, so `overall` is too.
  const overallFirst = (overall[0] as AbilityDayValue).ability;
  const overallLatest = (overall[overall.length - 1] as AbilityDayValue).ability;

  return (
    <section className="ability-chart" aria-labelledby="ability-chart-title">
      <h3 id="ability-chart-title">Ability over time</h3>

      <div className="ability-chart__plot">
        {/* Every value is in the legend below, so the drawing is decorative:
            announcing the lines to a screen reader would only repeat it. */}
        <svg
          className="ability-chart__svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          aria-hidden="true"
          focusable="false"
        >
          <g transform={`translate(${PAD_L} ${PAD_T})`}>
            {[max, (max + min) / 2, min].map((value) => (
              <line
                key={value}
                className="ability-chart__grid"
                x1={0}
                x2={PLOT_W}
                y1={y(value).toFixed(1)}
                y2={y(value).toFixed(1)}
              />
            ))}
            <line className="ability-chart__axis" x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} />
            {withColour.map(({ series: s, colour }) => (
              <Line key={s.packId} values={s.values} variant={colour} x={x} y={y} />
            ))}
            {/* The overall line rides on top of the per-pack ramp in a heavier,
                neutral stroke, so it reads as the aggregate rather than one more
                pack. */}
            <Line values={overall} variant="ability-chart__overall" x={x} y={y} />
          </g>
        </svg>
      </div>

      {/* Overall sits above the ranked packs and off the ramp: it is the
          aggregate, not a competitor in the leaderboard, so it carries a label
          rather than a rank. */}
      <div className="ability-chart__overall-key">
        <span className="ability-chart__swatch ability-chart__swatch--overall" aria-hidden="true" />
        <span className="ability-chart__key-label">Overall</span>{" "}
        <span className="ability-chart__key-value">{Math.round(overallLatest)}</span>{" "}
        <Change values={overall} first={overallFirst} latest={overallLatest} />
      </div>

      {/* The ranked legend is the identity carrier: sorted by current ability so
          it reads as a leaderboard ("which pack is climbing, what to study
          next"), and it scales — a future top-N or filter is a slice of this
          list, not a redesign. */}
      <ol className="ability-chart__legend">
        {ranked.map(({ series: s, colour }, rank) => (
          <li key={s.packId} className={`ability-chart__key ${colour}`} data-pack={s.packId}>
            <span className="ability-chart__rank">{rank + 1}</span>
            <span className="ability-chart__swatch" aria-hidden="true" />
            {/* Spaces are load-bearing: without them a screen reader runs the
                label and numbers together as one word. */}
            <span className="ability-chart__key-label">{s.label}</span>{" "}
            <span className="ability-chart__key-value">{Math.round(s.latest)}</span>{" "}
            <Change values={s.values} first={s.first} latest={s.latest} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * One line, or a single marker when there is only one day of data. `variant` is
 * the class both the line and its marker wear — a per-pack colour class, or the
 * overall line's distinct class — so the overall line reuses this same
 * single/multi-day handling.
 */
function Line({
  values,
  variant,
  x,
  y,
}: {
  values: AbilityDayValue[];
  variant: string;
  x: (day: string) => number;
  y: (ability: number) => number;
}) {
  // A single day is a marker, not a zero-length line (which would draw nothing) —
  // mirroring the admin sparkline's single-point handling.
  if (values.length === 1) {
    const only = values[0] as AbilityDayValue;
    return (
      <circle
        className={`ability-chart__marker ${variant}`}
        cx={x(only.day).toFixed(1)}
        cy={y(only.ability).toFixed(1)}
        r={3}
      />
    );
  }
  const pts = values.map((v) => `${x(v.day).toFixed(1)},${y(v.ability).toFixed(1)}`);
  return <polyline className={`ability-chart__line ${variant}`} points={pts.join(" ")} fill="none" />;
}

/**
 * The change since a line's first day, as a signed value with a direction word —
 * the word, not just the arrow glyph, so the reading is unambiguous without
 * colour. A line with a single day of data has no change to report yet. Shared
 * by the per-pack keys and the overall key.
 */
function Change({ values, first, latest }: { values: AbilityDayValue[]; first: number; latest: number }) {
  const delta = Math.round(latest) - Math.round(first);
  if (values.length === 1 || delta === 0) {
    return <span className="ability-chart__change ability-chart__change--flat">no change yet</span>;
  }
  const rising = delta > 0;
  return (
    <span
      className={`ability-chart__change ability-chart__change--${rising ? "up" : "down"}`}
    >
      {rising ? "▲" : "▼"} {rising ? "up" : "down"} {Math.abs(delta)}
    </span>
  );
}

/**
 * Which colour a line and its legend swatch wear — assigned by the stable series
 * rank and wrapped modulo the ramp, so packs past the eighth reuse a hue while
 * the legend text keeps them distinct. Must match `--colour-0…n` in `index.css`.
 */
function colourClass(index: number): string {
  return `ability-chart__colour--${index % CATEGORICAL_RAMP}`;
}

/** How many colours the ramp holds. Matches `--colour-0…n` in `index.css`. */
const CATEGORICAL_RAMP = 8;

// Drawing geometry, in viewBox units. The SVG scales uniformly to its
// container width (default `preserveAspectRatio`, height from CSS `auto`), so
// these are proportions, not pixels.
const VIEW_W = 760;
const VIEW_H = 240;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 20;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;
