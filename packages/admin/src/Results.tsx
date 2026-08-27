import { useEffect, useState } from "react";
import type { AdminResultRow, AdminResultsFilter, AdminResultsResponse } from "@geo/contract";
import { getResults } from "./apiClient.js";
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

/** Results surface — every answer across all users, with composable filters (#143). */
export function Results() {
  const [pendingFilter, setPendingFilter] = useState<AdminResultsFilter>({});
  const [filter, setFilter] = useState<AdminResultsFilter>({});
  const [results, setResults] = useState<AdminResultsResponse | undefined>(undefined);

  useEffect(() => {
    getResults(filter).then(setResults);
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
    </section>
  );
}
