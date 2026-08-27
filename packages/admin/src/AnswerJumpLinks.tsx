import type { AdminAnswerLogEntry } from "@geo/contract";
import { focusPacksOn } from "./navigation.js";

/**
 * "Jump to its Card/Entity on the Packs surface" (#141, #143) — shared by the
 * single-user Answer Log and the all-users Results table so the two never
 * diverge on what a jump does. Renders nothing when the answer's card no
 * longer resolves (both fields absent) rather than a dead link.
 */
export function AnswerJumpLinks({ entry }: { entry: Pick<AdminAnswerLogEntry, "statementId" | "packId" | "subjectEntityId"> }) {
  if (!entry.statementId && !entry.subjectEntityId) return <span className="admin-muted">—</span>;
  return (
    <>
      {entry.statementId && (
        <button
          type="button"
          className="admin-link"
          onClick={() => focusPacksOn({ kind: "statement", packId: entry.packId ?? "", statementId: entry.statementId as string })}
        >
          Card
        </button>
      )}
      {entry.statementId && entry.subjectEntityId && " · "}
      {entry.subjectEntityId && (
        <button type="button" className="admin-link" onClick={() => focusPacksOn({ kind: "entity", entityId: entry.subjectEntityId as string })}>
          Entity
        </button>
      )}
    </>
  );
}
