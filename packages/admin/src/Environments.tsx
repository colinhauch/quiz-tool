import { useEffect, useState } from "react";
import type { AdminEnvironmentComparison, Environment } from "@geo/contract";
import { getEnvironmentComparison } from "./apiClient.js";
import { readEnvironmentPref } from "./environmentPref.js";
import { EnvironmentNote } from "./EnvironmentNote.js";
import { ENVIRONMENT_SCHEMAS } from "./environmentSchemas.js";


/** One comparison row: a label and how to read it off a healthy column. Kept as data so the table's shape lives in one place. */
const ROWS: {
  readonly label: string;
  readonly read: (stats: Extract<AdminEnvironmentComparison["environments"][Environment], { status: "ok" }>) => string;
}[] = [
  { label: "Users with answers", read: (s) => String(s.usersWithAnswers) },
  { label: "Answers", read: (s) => String(s.totalAnswers) },
  { label: "Accuracy", read: (s) => (s.totalAnswers === 0 ? "—" : `${Math.round(s.accuracy * 100)}%`) },
  { label: "Distinct cards answered", read: (s) => String(s.distinctCardsAnswered) },
  { label: "First answer", read: (s) => formatDate(s.firstAnswerAt) },
  { label: "Last answer", read: (s) => formatDate(s.lastAnswerAt) },
  { label: "Packs with ability rows", read: (s) => String(s.packsWithAbilityRows) },
  { label: "Rated cards", read: (s) => String(s.ratedCards) },
];

/** An absent timestamp means the Environment has no answers yet — a real state, not a missing value, so it reads as a dash rather than blank. */
function formatDate(iso: string | null): string {
  return iso === null ? "—" : iso.slice(0, 10);
}

/**
 * The Environments comparison surface (#174): all three Environments side by
 * side, answering "where is the data?" without switching three times.
 *
 * Unlike every other cross-user surface this one reads *every* Environment at
 * once, so it takes no `?env=` and the left-nav selector does not apply to it.
 * The selector nonetheless stays visible and enabled while this surface is
 * open — a disabled control you then cannot use to leave the page is worse
 * than an inert one — and the selected Environment's column is marked, so the
 * two views read as connected rather than as unrelated screens.
 *
 * `selectedEnvironment` is injectable so a test can state which column should
 * be marked without reaching into `localStorage`; in the app it defaults to
 * the operator's persisted choice, the same one `apiClient` attaches to every
 * other request.
 */
export function Environments({ selectedEnvironment }: { selectedEnvironment?: Environment } = {}) {
  const [comparison, setComparison] = useState<AdminEnvironmentComparison | undefined>(undefined);
  const selected = selectedEnvironment ?? readEnvironmentPref();

  useEffect(() => {
    getEnvironmentComparison().then(setComparison);
  }, []);

  if (!comparison) return <p className="admin-muted">Loading environments…</p>;

  return (
    <section className="admin-surface">
      <h2>Environments</h2>
      <EnvironmentNote kind="all-environments" />

      {/* The auth pool is shared across all three environments, so this count
          is carried once rather than repeated per column, where it would
          wrongly imply a per-environment pool. */}
      <p data-testid="shared-registered-users">
        <strong>{comparison.registeredUsers}</strong> registered users{" "}
        <span className="admin-muted">(shared across every environment — one auth pool)</span>
      </p>

      <table className="admin-env-comparison">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {ENVIRONMENT_SCHEMAS.map((col) => (
              <th key={col.id} scope="col" className={col.id === selected ? "admin-env-column-selected" : undefined}>
                {col.id} <span className="admin-muted">({col.schema})</span>
                {col.id === selected ? " (selected)" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {ENVIRONMENT_SCHEMAS.map((col) => {
                const column = comparison.environments[col.id];
                const marked = col.id === selected ? "admin-env-column-selected" : undefined;
                if (!column || column.status === "unavailable") {
                  return (
                    <td key={col.id} className={marked}>
                      <span className="admin-muted">—</span>
                    </td>
                  );
                }
                return (
                  <td key={col.id} className={marked}>
                    {row.read(column)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* A dead environment is one column's problem, never the page's: its
          reason is stated below the table while the healthy columns render
          their figures normally. */}
      {ENVIRONMENT_SCHEMAS.map((col) => {
        const column = comparison.environments[col.id];
        if (!column) return <p key={col.id} className="admin-muted">{col.id}: no data returned.</p>;
        if (column.status !== "unavailable") return null;
        return (
          <p key={col.id} className="admin-muted">
            <strong>{col.id}</strong> unavailable: {column.reason}
          </p>
        );
      })}
    </section>
  );
}
