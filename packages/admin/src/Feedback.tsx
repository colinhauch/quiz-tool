import { useEffect, useState } from "react";
import type { AdminFeedbackFilter, AdminFeedbackList, AdminFeedbackRow } from "@geo/contract";
import { getFeedback } from "./apiClient.js";

/** Each filter's "all" is the absence of a filter; the `<select>` needs a value to show for it. */
type StatusOption = "all" | "unresolved" | "resolved";
type KindOption = "all" | "general" | "question";

function FeedbackFilters({
  status,
  kind,
  onStatusChange,
  onKindChange,
}: {
  status: StatusOption;
  kind: KindOption;
  onStatusChange: (next: StatusOption) => void;
  onKindChange: (next: KindOption) => void;
}) {
  return (
    <form className="admin-feedback-filters" onSubmit={(e) => e.preventDefault()}>
      <label>
        Status
        <select value={status} onChange={(e) => onStatusChange(e.target.value as StatusOption)}>
          <option value="all">All</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => onKindChange(e.target.value as KindOption)}>
          <option value="all">All</option>
          <option value="general">General</option>
          <option value="question">Question</option>
        </select>
      </label>
    </form>
  );
}

/** The pack a question report was captured against — the label when it was recorded, else the raw id. */
function packOf(row: AdminFeedbackRow): string | undefined {
  return row.context?.packLabel ?? row.context?.packId;
}

/**
 * What the report captured as the correct answer. A flag raised before the
 * learner answered never had one, so say that rather than showing a bare dash —
 * the empty cell would otherwise read as missing data (#162).
 */
function acceptedAnswerOf(row: AdminFeedbackRow): string {
  const accepted = row.context?.acceptedAnswers?.join(", ");
  if (accepted) return accepted;
  return row.context?.answered === false ? "not yet answered" : "—";
}

function FeedbackTable({ rows }: { rows: AdminFeedbackList }) {
  if (rows.length === 0) return <p className="admin-muted">No feedback matches the current filters.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>User</th>
          <th>Kind</th>
          <th>Comment</th>
          <th>Pack</th>
          <th>Prompt</th>
          <th>Correct answer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.createdAt}</td>
            <td>{row.userEmail ?? row.userId}</td>
            <td>{row.kind}</td>
            <td>{row.comment}</td>
            <td>{packOf(row) ?? "—"}</td>
            <td>{row.context?.prompt ?? "—"}</td>
            <td>{acceptedAnswerOf(row)}</td>
            <td>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Feedback surface (#163) — every learner-submitted report in one newest-first
 * table, filterable by status and by kind. Deliberately **read-only**: it
 * displays `status` but offers no control that writes it, keeping the admin's
 * "no route writes" invariant (spec #160). Resolving is done out-of-band via
 * SQL / Claude Code until a triage UI is built.
 *
 * Both filters default to "all": the page's job is to show everything that came
 * in, and narrowing to the unresolved backlog is one select away.
 */
export function Feedback() {
  const [status, setStatus] = useState<StatusOption>("all");
  const [kind, setKind] = useState<KindOption>("all");
  const [rows, setRows] = useState<AdminFeedbackList | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const filter: AdminFeedbackFilter = {};
    if (status !== "all") filter.status = status;
    if (kind !== "all") filter.kind = kind;

    // Toggling a filter starts a new request without cancelling the old one, so
    // a slow first response could otherwise land after a faster second and
    // render rows that contradict the selects.
    let current = true;
    setFailed(false);
    getFeedback(filter)
      .then((next) => {
        if (current) setRows(next);
      })
      .catch(() => {
        // The route 500s when the BFF has no Supabase credentials — the one
        // failure this surface is expected to hit. Say so rather than sitting
        // on "Loading…" forever.
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [status, kind]);

  return (
    <section className="admin-surface" aria-labelledby="surface-Feedback">
      <h1 id="surface-Feedback" className="admin-surface__title">
        Feedback
      </h1>
      <p className="admin-muted">
        Read-only. Mark a report resolved out-of-band (SQL / Claude Code) — the admin app never writes.
      </p>

      <FeedbackFilters status={status} kind={kind} onStatusChange={setStatus} onKindChange={setKind} />

      {failed && (
        <p className="admin-surface__placeholder">
          Could not load feedback — the BFF needs Supabase credentials (see `.env.local`).
        </p>
      )}
      {!failed && (rows ? <FeedbackTable rows={rows} /> : <p className="admin-surface__placeholder">Loading…</p>)}
    </section>
  );
}
