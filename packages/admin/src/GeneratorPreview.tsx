import { useEffect, useState } from "react";
import type { AdminGeneratorPreview, AdminPackDetail, AdminPackList } from "@geo/contract";
import { getGeneratorPreview, getPackDetail, getPacks } from "./apiClient.js";
import { EnvironmentNote } from "./EnvironmentNote.js";

/** Every statement across a pack's relation groups, flattened for the picker. */
function statementsOf(detail: AdminPackDetail) {
  return detail.relations.flatMap((group) => group.statements);
}

/**
 * Generator Preview surface (#139): pick a pack, pick one of its statements,
 * see what the generator renders — forward and reverse cards side by side
 * where the relation supports both, and a non-quizzable statement (its relation
 * has no generator) shown as such rather than erroring.
 */
export function GeneratorPreview() {
  const [packs, setPacks] = useState<AdminPackList | undefined>(undefined);
  const [packId, setPackId] = useState<string>("");
  const [packDetail, setPackDetail] = useState<AdminPackDetail | null | undefined>(undefined);
  const [statementId, setStatementId] = useState<string>("");
  const [preview, setPreview] = useState<AdminGeneratorPreview | null | undefined>(undefined);

  useEffect(() => {
    getPacks().then(setPacks);
  }, []);

  useEffect(() => {
    setPackDetail(undefined);
    setStatementId("");
    setPreview(undefined);
    if (!packId) return;
    getPackDetail(packId).then(setPackDetail);
  }, [packId]);

  useEffect(() => {
    setPreview(undefined);
    if (!statementId) return;
    getGeneratorPreview(statementId).then(setPreview);
  }, [statementId]);

  return (
    <section className="admin-surface" aria-labelledby="surface-Generator Preview">
      <h1 id="surface-Generator Preview" className="admin-surface__title">
        Generator Preview
      </h1>
      <EnvironmentNote kind="pack-graph" />

      <label htmlFor="generator-preview-pack">Pack</label>
      <select id="generator-preview-pack" value={packId} onChange={(e) => setPackId(e.target.value)}>
        <option value="">Choose a pack…</option>
        {packs?.map((pack) => (
          <option key={pack.id} value={pack.id}>
            {pack.label}
          </option>
        ))}
      </select>

      {packDetail && (
        <ul className="admin-statement-picker">
          {statementsOf(packDetail).map((statement) => (
            <li key={statement.id}>
              <button type="button" className="admin-link" onClick={() => setStatementId(statement.id)}>
                {statement.id}
              </button>
            </li>
          ))}
          {statementsOf(packDetail).length === 0 && <li className="admin-muted">This pack has no statements.</li>}
        </ul>
      )}

      {preview === null && <p className="admin-surface__placeholder">Unknown statement.</p>}
      {preview && (
        <div className="admin-generator-preview">
          <p className="admin-muted">Source: {preview.provenance}</p>
          {preview.cards.map((card) => (
            <div key={card.hiddenSlot} className="admin-generator-card">
              <h3>Hidden slot: {card.hiddenSlot}</h3>
              {card.quizzable ? (
                <dl>
                  <dt>Prompt</dt>
                  <dd>{card.prompt}</dd>
                  <dt>Question kind</dt>
                  <dd>{card.questionKind}</dd>
                  <dt>Correct answer</dt>
                  <dd>{card.correctAnswer}</dd>
                  {card.distractors && card.distractors.length > 0 && (
                    <>
                      <dt>Distractors</dt>
                      <dd>{card.distractors.join(", ")}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="admin-muted">Non-quizzable: {card.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
