import { useEffect, useState } from "react";
import type { AdminEntityDetail } from "@geo/contract";
import { getEntityDetail } from "./apiClient.js";

/**
 * The rich Entity view (#137): labels, aliases, types, Owner pack, coordinate
 * when present, and every Statement the entity is subject or object of. Each
 * statement's other entity is a link, so the operator traverses the graph by
 * clicking; `onSelectPack` and `onSelectEntity` are owned by `Packs`, which
 * keeps the breadcrumb (its own view state) in sync as the operator moves.
 */
export function EntityDetail({
  entityId,
  onSelectEntity,
  onSelectPack,
}: {
  entityId: string;
  onSelectEntity: (entityId: string) => void;
  onSelectPack: (packId: string) => void;
}) {
  const [detail, setDetail] = useState<AdminEntityDetail | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    getEntityDetail(entityId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (detail === undefined) return <p className="admin-surface__placeholder">Loading…</p>;
  if (detail === null) return <p className="admin-surface__placeholder">Unknown entity: {entityId}</p>;

  return (
    <div className="admin-entity-detail">
      <h2>{detail.label}</h2>
      <dl>
        <dt>Types</dt>
        <dd>{detail.types.length > 0 ? detail.types.join(", ") : "—"}</dd>
        <dt>Aliases</dt>
        <dd>{detail.aliases.length > 0 ? detail.aliases.join(", ") : "—"}</dd>
        <dt>Owner pack</dt>
        <dd>
          {detail.ownerPackId ? (
            <button type="button" className="admin-link" onClick={() => onSelectPack(detail.ownerPackId!)}>
              {detail.ownerPackLabel ?? detail.ownerPackId}
            </button>
          ) : (
            "unknown"
          )}
        </dd>
        {detail.coordinate && (
          <>
            <dt>Coordinate</dt>
            <dd>
              {detail.coordinate.lat}, {detail.coordinate.lon}
            </dd>
          </>
        )}
      </dl>

      <h3>Statements ({detail.statements.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Relation</th>
            <th>Subject</th>
            <th>Object</th>
            <th>Pack</th>
          </tr>
        </thead>
        <tbody>
          {detail.statements.map((statement) => (
            <tr key={statement.id}>
              <td>{statement.role}</td>
              <td>{statement.relation}</td>
              <td>
                <button
                  type="button"
                  className="admin-link"
                  disabled={statement.subject.id === entityId}
                  onClick={() => onSelectEntity(statement.subject.id)}
                >
                  {statement.subject.label}
                </button>
              </td>
              <td>
                {statement.object.kind === "entity" ? (
                  (() => {
                    const { entity } = statement.object;
                    return (
                      <button
                        type="button"
                        className="admin-link"
                        disabled={entity.id === entityId}
                        onClick={() => onSelectEntity(entity.id)}
                      >
                        {entity.label}
                      </button>
                    );
                  })()
                ) : (
                  statement.object.literal
                )}
              </td>
              <td>
                <button type="button" className="admin-link" onClick={() => onSelectPack(statement.packId)}>
                  {statement.packId}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
