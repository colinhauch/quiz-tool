import { useEffect, useState } from "react";
import type {
  AdminAccuracyByKey,
  AdminCardDifficulty,
  AdminLeaderboardEntry,
  AdminResultRow,
  AdminResultsCharts,
  AdminResultsFilter,
  AdminResultsResponse,
  AdminTimeSeriesPoint,
} from "@geo/contract";
import { getResults, getResultsCharts } from "./apiClient.js";
import { AnswerJumpLinks } from "./AnswerJumpLinks.js";

/** `correct`'s tri-state as a `<select>` needs it: unset, or one of the two booleans, spelled out as strings. */
type CorrectFilterOption = "" | "true" | "false";

function correctFilterToOption(correct: boolean | undefined): CorrectFilterOption {
  if (correct === undefined) return "";
  return correct ? "true" : "false";
}

function FiltersForm({
  pending,
  onChange,
  onApply,
}: {
  pending: AdminResultsFilter;
  onChange: (next: AdminResultsFilter) => void;
  onApply: () => void;
}) {
  return (
    <form
      className="admin-results-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <label>
        User ID
        <input
          value={pending.userId ?? ""}
          onChange={(e) => onChange({ ...pending, userId: e.target.value || undefined })}
        />
      </label>
      <label>
        Pack
        <input
          value={pending.packId ?? ""}
          onChange={(e) => onChange({ ...pending, packId: e.target.value || undefined })}
        />
      </label>
      <label>
        Relation
        <input
          value={pending.relation ?? ""}
          onChange={(e) => onChange({ ...pending, relation: e.target.value || undefined })}
        />
      </label>
      <label>
        Correct
        <select
          value={correctFilterToOption(pending.correct)}
          onChange={(e) => {
            const value = e.target.value as CorrectFilterOption;
            onChange({ ...pending, correct: value === "" ? undefined : value === "true" });
          }}
        >
          <option value="">Any</option>
          <option value="true">Correct</option>
          <option value="false">Incorrect</option>
        </select>
      </label>
      <label>
        From
        <input type="date" value={pending.from ?? ""} onChange={(e) => onChange({ ...pending, from: e.target.value || undefined })} />
      </label>
      <label>
        To
        <input type="date" value={pending.to ?? ""} onChange={(e) => onChange({ ...pending, to: e.target.value || undefined })} />
      </label>
      <button type="submit">Apply filters</button>
    </form>
  );
}

function ResultsTable({ rows }: { rows: AdminResultRow[] }) {
  if (rows.length === 0) return <p className="admin-muted">No answers match the current filters.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Card</th>
          <th>Pack</th>
          <th>Relation</th>
          <th>Input</th>
          <th>Correct</th>
          <th>When</th>
          <th>Jump</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.userId}:${row.cardId}:${row.askedAt}:${i}`}>
            <td>{row.userEmail ?? row.userId}</td>
            <td>{row.cardId}</td>
            <td>{row.packId ?? "—"}</td>
            <td>{row.relation ?? "—"}</td>
            <td>{row.input}</td>
            <td>{row.correct ? "✓" : "✗"}</td>
            <td>{row.askedAt}</td>
            <td>
              <AnswerJumpLinks entry={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimeSeriesTable({ title, points }: { title: string; points: AdminTimeSeriesPoint[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {points.length === 0 ? (
        <p className="admin-muted">No data.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Count</th>
              {points[0]?.accuracy !== undefined && <th>Accuracy</th>}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.count}</td>
                {p.accuracy !== undefined && <td>{(p.accuracy * 100).toFixed(1)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AccuracyByKeyTable({ title, rows }: { title: string; rows: AdminAccuracyByKey[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="admin-muted">No data.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Count</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td>{r.count}</td>
                <td>{(r.accuracy * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LeaderboardTable({ title, entries }: { title: string; entries: AdminLeaderboardEntry[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {entries.length === 0 ? (
        <p className="admin-muted">No data.</p>
      ) : (
        <ol>
          {entries.map((entry, i) => (
            <li key={`${entry.userId}:${entry.packId ?? ""}:${i}`}>
              {entry.userEmail ?? entry.userId}
              {entry.ability !== undefined && ` — ${entry.ability.toFixed(1)} (${entry.packId})`}
              {entry.accuracy !== undefined && ` — ${(entry.accuracy * 100).toFixed(1)}%`}
              {entry.volume !== undefined && ` — ${entry.volume} answers`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CardDifficultyList({ title, cards }: { title: string; cards: AdminCardDifficulty[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {cards.length === 0 ? (
        <p className="admin-muted">No data.</p>
      ) : (
        <ol>
          {cards.map((card) => (
            <li key={card.cardId}>
              {card.cardId} — difficulty {card.difficulty.toFixed(1)} ({card.answerCount} answers)
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChartsView({ charts }: { charts: AdminResultsCharts }) {
  return (
    <div className="admin-results-charts">
      <TimeSeriesTable title="Accuracy over time" points={charts.accuracyOverTime} />
      <TimeSeriesTable title="Volume over time" points={charts.volumeOverTime} />
      <AccuracyByKeyTable title="Accuracy by pack" rows={charts.accuracyByPack} />
      <AccuracyByKeyTable title="Accuracy by Relation" rows={charts.accuracyByRelation} />

      <h3>Leaderboard</h3>
      <div className="admin-leaderboard">
        <LeaderboardTable title="By ability" entries={charts.leaderboard.byAbility} />
        <LeaderboardTable title="By accuracy" entries={charts.leaderboard.byAccuracy} />
        <LeaderboardTable title="By volume" entries={charts.leaderboard.byVolume} />
      </div>

      <h3>Cards</h3>
      <div className="admin-card-difficulty">
        <CardDifficultyList title="Hardest Cards" cards={charts.hardestCards} />
        <CardDifficultyList title="Easiest Cards" cards={charts.easiestCards} />
      </div>
    </div>
  );
}

/** Results surface — every answer across all users, composable filters, charts, leaderboard, hardest/easiest Cards (#143, #144). */
export function Results() {
  const [pendingFilter, setPendingFilter] = useState<AdminResultsFilter>({});
  const [filter, setFilter] = useState<AdminResultsFilter>({});
  const [results, setResults] = useState<AdminResultsResponse | undefined>(undefined);
  const [charts, setCharts] = useState<AdminResultsCharts | undefined>(undefined);

  useEffect(() => {
    getResults(filter).then(setResults);
    getResultsCharts(filter).then(setCharts);
  }, [filter]);

  return (
    <section className="admin-surface" aria-labelledby="surface-Results">
      <h1 id="surface-Results" className="admin-surface__title">
        Results
      </h1>

      <FiltersForm pending={pendingFilter} onChange={setPendingFilter} onApply={() => setFilter(pendingFilter)} />

      {results ? (
        <p>
          {results.total} answers · {(results.accuracy * 100).toFixed(1)}% accuracy
        </p>
      ) : (
        <p className="admin-surface__placeholder">Loading…</p>
      )}
      {results && <ResultsTable rows={results.rows} />}
      {charts && <ChartsView charts={charts} />}
    </section>
  );
}
