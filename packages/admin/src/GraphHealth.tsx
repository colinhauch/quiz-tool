import { useEffect, useState } from "react";
import type { AdminGraphHealthReport, AdminHealthIssue } from "@geo/contract";
import { getGraphHealth } from "./apiClient.js";
import { focusPacksOn } from "./navigation.js";

/** Jumps the shell to the Packs surface, focused on the item's Entity or Statement (#138). */
function drillDown(item: AdminHealthIssue): void {
  if (item.targetType === "entity") {
    focusPacksOn({ kind: "entity", entityId: item.targetId });
  } else {
    focusPacksOn({ kind: "statement", packId: item.packId ?? "", statementId: item.targetId });
  }
}

/** Graph Health surface — orphans, uncovered statements, coverage gaps (#138). */
export function GraphHealth() {
  const [report, setReport] = useState<AdminGraphHealthReport | undefined>(undefined);

  useEffect(() => {
    getGraphHealth().then(setReport);
  }, []);

  return (
    <section className="admin-surface" aria-labelledby="surface-Graph Health">
      <h1 id="surface-Graph Health" className="admin-surface__title">
        Graph Health
      </h1>
      {!report && <p className="admin-surface__placeholder">Loading…</p>}
      {report?.checks.map((check) => (
        <div key={check.id} className="admin-health-check">
          <h2>
            {check.label} <span className="admin-health-count">{check.count}</span>
          </h2>
          {check.items.length === 0 ? (
            <p className="admin-muted">No issues.</p>
          ) : (
            <ul>
              {check.items.map((item) => (
                <li key={`${item.targetType}:${item.targetId}`}>
                  <button type="button" className="admin-link" onClick={() => drillDown(item)}>
                    {item.targetId}
                  </button>{" "}
                  <span className="admin-muted">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
