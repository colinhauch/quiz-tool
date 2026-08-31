import { useEffect, useState } from "react";
import type { AdminPackDetail, AdminPackList, AdminRelationGroup } from "@geo/contract";
import { getPackDetail, getPacks } from "./apiClient.js";
import { EntityDetail } from "./EntityDetail.js";
import { consumePacksFocus } from "./navigation.js";
import { EnvironmentNote } from "./EnvironmentNote.js";

type View =
  | { kind: "list" }
  | { kind: "pack"; packId: string; highlightStatementId?: string }
  | { kind: "entity"; entityId: string };

/** Turns a pending cross-surface focus request (`navigation.ts`) into a view. */
function viewFromFocus(focus: ReturnType<typeof consumePacksFocus>): View | undefined {
  if (!focus) return undefined;
  if (focus.kind === "pack") return { kind: "pack", packId: focus.packId };
  if (focus.kind === "entity") return { kind: "entity", entityId: focus.entityId };
  return { kind: "pack", packId: focus.packId, highlightStatementId: focus.statementId };
}

/** Packs surface — pack list → pack detail → entity rich view (#136, #137). */
export function Packs() {
  const [view, setView] = useState<View>({ kind: "list" });

  // Consumed in an effect, not during render: `navigation.ts`'s store notifies
  // subscribers (including `App`, which switched the shell to this surface)
  // synchronously, and updating another component mid-render is exactly the
  // anti-pattern React warns about. Running one tick later avoids it, at the
  // cost of a one-frame flash of the pack list before the jump lands.
  useEffect(() => {
    const next = viewFromFocus(consumePacksFocus());
    if (next) setView(next);
  }, []);

  return (
    <section className="admin-surface" aria-labelledby="surface-Packs">
      <h1 id="surface-Packs" className="admin-surface__title">
        Packs
      </h1>
      <EnvironmentNote kind="pack-graph" />
      <nav aria-label="Breadcrumb" className="admin-breadcrumb">
        <button type="button" className="admin-link" onClick={() => setView({ kind: "list" })}>
          All packs
        </button>
        {view.kind === "pack" && <span> / Pack: {view.packId}</span>}
        {view.kind === "entity" && <span> / Entity: {view.entityId}</span>}
      </nav>

      {view.kind === "list" && <PackListView onSelectPack={(packId) => setView({ kind: "pack", packId })} />}
      {view.kind === "pack" && (
        <PackDetailView
          packId={view.packId}
          highlightStatementId={view.highlightStatementId}
          onSelectEntity={(entityId) => setView({ kind: "entity", entityId })}
        />
      )}
      {view.kind === "entity" && (
        <EntityDetail
          entityId={view.entityId}
          onSelectEntity={(entityId) => setView({ kind: "entity", entityId })}
          onSelectPack={(packId) => setView({ kind: "pack", packId })}
        />
      )}
    </section>
  );
}

function PackListView({ onSelectPack }: { onSelectPack: (packId: string) => void }) {
  const [packs, setPacks] = useState<AdminPackList | undefined>(undefined);

  useEffect(() => {
    getPacks().then(setPacks);
  }, []);

  if (!packs) return <p className="admin-surface__placeholder">Loading…</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Pack</th>
          <th>Version</th>
          <th>License</th>
          <th>Credits</th>
          <th>Statements</th>
          <th>Cards</th>
        </tr>
      </thead>
      <tbody>
        {packs.map((pack) => (
          <tr key={pack.id}>
            <td>
              <button type="button" className="admin-link" onClick={() => onSelectPack(pack.id)}>
                {pack.label}
              </button>
            </td>
            <td>{pack.version}</td>
            <td>{pack.license ?? "—"}</td>
            <td>{pack.credits?.map((c) => c.source).join(", ") ?? "—"}</td>
            <td>{pack.statementCount}</td>
            <td>{pack.cardCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RelationGroupView({
  group,
  highlightStatementId,
  onSelectEntity,
}: {
  group: AdminRelationGroup;
  highlightStatementId: string | undefined;
  onSelectEntity: (entityId: string) => void;
}) {
  return (
    <div className="admin-relation-group">
      <h3>
        {group.relation}{" "}
        <span className="admin-muted">
          {group.definedHere ? "(defined here)" : `(asserted — defined by ${group.definedBy ?? "unknown pack"})`}
        </span>
      </h3>
      <table>
        <thead>
          <tr>
            <th>Statement</th>
            <th>Subject</th>
            <th>Object</th>
          </tr>
        </thead>
        <tbody>
          {group.statements.map((statement) => (
            <tr key={statement.id} className={statement.id === highlightStatementId ? "admin-highlight" : undefined}>
              <td>{statement.id}</td>
              <td>
                <button type="button" className="admin-link" onClick={() => onSelectEntity(statement.subject.id)}>
                  {statement.subject.label}
                </button>
              </td>
              <td>
                {statement.object.kind === "entity" ? (
                  (() => {
                    const { entity } = statement.object;
                    return (
                      <button type="button" className="admin-link" onClick={() => onSelectEntity(entity.id)}>
                        {entity.label}
                      </button>
                    );
                  })()
                ) : (
                  statement.object.literal
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PackDetailView({
  packId,
  highlightStatementId,
  onSelectEntity,
}: {
  packId: string;
  highlightStatementId: string | undefined;
  onSelectEntity: (entityId: string) => void;
}) {
  const [detail, setDetail] = useState<AdminPackDetail | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    getPackDetail(packId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (detail === undefined) return <p className="admin-surface__placeholder">Loading…</p>;
  if (detail === null) return <p className="admin-surface__placeholder">Unknown pack: {packId}</p>;

  return (
    <div className="admin-pack-detail">
      <h2>{detail.label}</h2>
      <p className="admin-muted">
        v{detail.version}
        {detail.license ? ` · ${detail.license}` : ""}
      </p>

      <h3>Entities ({detail.entities.length})</h3>
      <ul className="admin-entity-list">
        {detail.entities.map((entity) => (
          <li key={entity.id}>
            <button type="button" className="admin-link" onClick={() => onSelectEntity(entity.id)}>
              {entity.label}
            </button>{" "}
            <span className="admin-muted">({entity.types.join(", ") || "no type"})</span>
          </li>
        ))}
      </ul>

      <h3>Statements</h3>
      {detail.relations.length === 0 && <p className="admin-surface__placeholder">No statements.</p>}
      {detail.relations.map((group) => (
        <RelationGroupView
          key={group.relation}
          group={group}
          highlightStatementId={highlightStatementId}
          onSelectEntity={onSelectEntity}
        />
      ))}
    </div>
  );
}
