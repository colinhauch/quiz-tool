import type { PackList, PackSummary } from "@geo/contract";
import { useCallback, useEffect, useState } from "react";

const PACKS_URL = "/api/packs";

/**
 * The pack picker — a shelf of packs you add to your quiz or set aside.
 *
 * Two states are kept apart, because conflating them is what makes a picker
 * confusing (#20):
 *
 * - **checked** — your pending edit, held here in the browser. Each pack is a
 *   toggle: pressing its card flips it between "in your quiz" and "available".
 * - **included** — what the server actually draws from, changed only on Save.
 *
 * The Save bar is the seam between checked and included: nothing you toggle
 * reaches the queue until you commit it.
 */
type Status = "loading" | "ready" | "saving" | "error";

export function Packs() {
  const [status, setStatus] = useState<Status>("loading");
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [queued, setQueued] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const list = (await (await fetch(PACKS_URL)).json()) as PackList;
      setPacks(list.packs);
      setQueued(list.queued);
      setChecked(new Set(list.packs.filter((p) => p.included).map((p) => p.id)));
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

  return (
    <div className="packs">
      <div className="packs__head">
        <h2 className="packs__title">Packs</h2>
        <p className="packs__sub">Tap a pack to add it to your quiz or set it aside.</p>
      </div>

      <div className="packs__grid">
        {packs.map((pack) => {
          const on = checked.has(pack.id);
          return (
            <button
              key={pack.id}
              type="button"
              className={`pack-card ${on ? "pack-card--in" : "pack-card--out"}`}
              aria-pressed={on}
              aria-label={pack.label}
              onClick={() => toggle(pack.id)}
            >
              <span className="pack-card__band">
                <span className="pack-card__eyebrow">{on ? "In your quiz" : "Available"}</span>
                <span className="pack-card__mark" aria-hidden="true">
                  {on ? "✓" : "+"}
                </span>
              </span>
              <span className="pack-card__body">
                <span className="pack-card__label">{pack.label}</span>
                {pack.description && <span className="pack-card__desc">{pack.description}</span>}
                <span className="pack-card__foot">
                  <span className="pack-card__count">{pack.cardCount}</span>
                  <span className="pack-card__count-label">
                    question{pack.cardCount === 1 ? "" : "s"}
                  </span>
                  {pack.license && <span className="pack-card__src">{pack.license}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="packs__bar">
        <div>
          <div className="packs__bar-count">
            <b>{queued}</b> question{queued === 1 ? "" : "s"} in your queue
          </div>
          {checked.size === 0 ? (
            <div className="packs__bar-note packs__bar-note--warn">Choose at least one pack.</div>
          ) : (
            dirty && (
              <div className="packs__bar-note">Unsaved — your queue hasn’t changed yet.</div>
            )
          )}
        </div>
        <div className="packs__bar-spacer" />
        <button
          className="btn-primary"
          type="button"
          onClick={() => void save()}
          disabled={!dirty || checked.size === 0 || status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save selection"}
        </button>
      </div>
    </div>
  );
}
