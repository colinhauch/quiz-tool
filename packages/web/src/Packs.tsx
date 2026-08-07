import type { PackList, PackSummary } from "@geo/contract";
import { useCallback, useEffect, useState } from "react";

const PACKS_URL = "/api/packs";

/**
 * The pack picker.
 *
 * Three states are deliberately kept apart, because conflating them is what
 * makes a picker confusing (#20):
 *
 * - **focused** — whose details you are reading. Changes nothing.
 * - **checked** — your pending edit, held here in the browser.
 * - **included** — what the server actually draws from, changed only on Save.
 *
 * Reading about a pack is therefore free, and no question you are asked changes
 * until you commit. The Save button is the seam between checked and included.
 */
type Status = "loading" | "ready" | "saving" | "error";

export function Packs() {
  const [status, setStatus] = useState<Status>("loading");
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [queued, setQueued] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const list = (await (await fetch(PACKS_URL)).json()) as PackList;
      setPacks(list.packs);
      setQueued(list.queued);
      setChecked(new Set(list.packs.filter((p) => p.included).map((p) => p.id)));
      setFocused((current) => current ?? list.packs[0]?.id ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch(PACKS_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packIds: [...checked] }),
      });
      if (!res.ok) throw new Error("save rejected");
      await load();
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") return <p className="quiz-message">Loading packs…</p>;
  if (status === "error") {
    return <p className="quiz-message">Couldn’t load your packs. Try again.</p>;
  }

  // An empty selection is refused by the contract, so the UI refuses it first —
  // disabling Save explains the rule where the learner is about to break it,
  // rather than letting the server reject the request afterwards.
  const included = new Set(packs.filter((p) => p.included).map((p) => p.id));
  const dirty = checked.size !== included.size || [...checked].some((id) => !included.has(id));
  const detail = packs.find((p) => p.id === focused);

  return (
    <div className="packs">
      <div className="packs__list">
        <h2 className="packs__heading">Your packs</h2>
        <ul>
          {packs.map((pack) => (
            <li key={pack.id}>
              <div className={`pack-row ${focused === pack.id ? "pack-row--focused" : ""}`}>
                <input
                  type="checkbox"
                  id={`pack-${pack.id}`}
                  checked={checked.has(pack.id)}
                  onChange={() => toggle(pack.id)}
                />
                <label className="pack-row__label" htmlFor={`pack-${pack.id}`}>
                  {pack.label}
                </label>
                <button
                  type="button"
                  className="pack-row__details"
                  aria-expanded={focused === pack.id}
                  onClick={() => setFocused(pack.id)}
                >
                  Details
                </button>
              </div>
            </li>
          ))}
        </ul>

        <p className="packs__status">
          {checked.size} of {packs.length} checked · {queued} question
          {queued === 1 ? "" : "s"} in your queue
        </p>

        <button
          className="btn-primary"
          type="button"
          onClick={() => void save()}
          disabled={!dirty || checked.size === 0 || status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save selection"}
        </button>

        {checked.size === 0 && <p className="packs__warning">Choose at least one pack.</p>}
        {dirty && checked.size > 0 && (
          <p className="packs__warning">Unsaved — your queue hasn’t changed yet.</p>
        )}
      </div>

      {detail && (
        <aside className="pack-detail">
          <span className="quiz-card__eyebrow">{detail.included ? "In your queue" : "Not included"}</span>
          <h3 className="pack-detail__title">{detail.label}</h3>
          <p className="pack-detail__meta">
            v{detail.version}
            {detail.license ? ` · ${detail.license}` : ""}
          </p>
          {detail.description && <p className="pack-detail__description">{detail.description}</p>}
          <dl className="pack-detail__facts">
            <div>
              <dt>Questions</dt>
              <dd>{detail.cardCount}</dd>
            </div>
            <div>
              <dt>Statements</dt>
              <dd>{detail.statementCount}</dd>
            </div>
          </dl>
          {detail.credits && detail.credits.length > 0 && (
            <p className="pack-detail__credits">
              {detail.credits.map((c) => `${c.source}, retrieved ${c.retrieved}`).join("; ")}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
