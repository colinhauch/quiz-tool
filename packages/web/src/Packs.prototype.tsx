/*
 * PROTOTYPE — Packs tab redesign (throwaway; see Packs.prototype.css).
 *
 * Three structurally different takes on the pack picker, switchable with a
 * floating bar or ?variant=A|B|C. Keeps the app's identity (Indigo/orange,
 * Garamond, topo contours) but rethinks layout, hierarchy, and the primary
 * include affordance:
 *
 *   A — Map shelf:     grid of self-contained cards; the card IS the toggle.
 *   B — Atlas contents: editorial list, per-row switch, inline detail drawer.
 *   C — Study builder:  available list + a live queue that stages the
 *                        checked→included change before Save commits it.
 *
 * Read-only: mock data in memory, Save/Discard are local stubs (no /api call).
 * Vocabulary held to #20: focused / checked / included, Save is the seam.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import "./Packs.prototype.css";

type MockPack = {
  id: string;
  label: string;
  description: string;
  version: string;
  license: string;
  credit: string;
  cardCount: number;
  statementCount: number;
  included: boolean; // the committed selection
};

/* The two real packs (Continental Countries, Core Cities) are included; the
   rest are plausible upcoming packs, left out, so the affordances have room. */
const MOCK_PACKS: MockPack[] = [
  {
    id: "continental-countries",
    label: "Continental Countries",
    description: "Which continent each country belongs to.",
    version: "0.0.1",
    license: "CC0-1.0",
    credit: "Wikidata, retrieved 2026-07-26",
    cardCount: 193,
    statementCount: 193,
    included: true,
  },
  {
    id: "core-cities",
    label: "Core Cities",
    description: "Which country a major city sits in.",
    version: "0.0.1",
    license: "CC0-1.0",
    credit: "hand-authored fixture, retrieved 2026-07-19",
    cardCount: 6,
    statementCount: 6,
    included: true,
  },
  {
    id: "world-capitals",
    label: "World Capitals",
    description: "Capital cities of every sovereign country.",
    version: "0.0.1",
    license: "CC0-1.0",
    credit: "Wikidata, retrieved 2026-07-28",
    cardCount: 195,
    statementCount: 195,
    included: false,
  },
  {
    id: "rivers-lakes",
    label: "Rivers & Lakes",
    description: "Which country the world's major rivers and lakes run through.",
    version: "0.0.1",
    license: "CC0-1.0",
    credit: "Wikidata, retrieved 2026-07-30",
    cardCount: 84,
    statementCount: 84,
    included: false,
  },
  {
    id: "national-flags",
    label: "National Flags",
    description: "Match each flag to its country.",
    version: "0.0.1",
    license: "CC-BY-4.0",
    credit: "Wikimedia Commons, retrieved 2026-08-01",
    cardCount: 60,
    statementCount: 60,
    included: false,
  },
];

/** Shared state: committed selection + pending (checked) edit. */
function usePicker() {
  const [packs] = useState(MOCK_PACKS);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(MOCK_PACKS.filter((p) => p.included).map((p) => p.id)),
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set(included));

  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const dirty =
    checked.size !== included.size || [...checked].some((id) => !included.has(id));
  const queued = packs
    .filter((p) => checked.has(p.id))
    .reduce((n, p) => n + p.cardCount, 0);

  const save = () => setIncluded(new Set(checked)); // stub for PUT /packs
  const discard = () => setChecked(new Set(included));

  const added = packs.filter((p) => checked.has(p.id) && !included.has(p.id));
  const removed = packs.filter((p) => !checked.has(p.id) && included.has(p.id));

  return { packs, included, checked, toggle, dirty, queued, save, discard, added, removed };
}

type Picker = ReturnType<typeof usePicker>;

/* ── Variant A — Map shelf ─────────────────────────────────── */
function VariantA(p: Picker) {
  return (
    <div className="pv-break">
      <div className="pv-head">
        <h1 className="pv-title">Packs</h1>
        <p className="pv-sub">Tap a pack to add it to your quiz or set it aside.</p>
      </div>

      <div className="pv-a__grid">
        {p.packs.map((pack) => {
          const on = p.checked.has(pack.id);
          return (
            <button
              key={pack.id}
              type="button"
              className={`pv-card ${on ? "pv-card--in" : "pv-card--out"}`}
              aria-pressed={on}
              onClick={() => p.toggle(pack.id)}
            >
              <div className="pv-card__band">
                <span className="pv-card__eyebrow">{on ? "In your quiz" : "Available"}</span>
                <span className="pv-mark" aria-hidden="true">
                  {on ? "✓" : "+"}
                </span>
              </div>
              <div className="pv-card__body">
                <span className="pv-card__label">{pack.label}</span>
                <span className="pv-card__desc">{pack.description}</span>
                <span className="pv-card__foot">
                  <span className="pv-card__count">{pack.cardCount}</span>
                  <span className="pv-card__count-label">questions</span>
                  <span className="pv-card__src">{pack.license}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <CommitBar picker={p} />
    </div>
  );
}

/* ── Variant B — Atlas contents ────────────────────────────── */
function VariantB(p: Picker) {
  const [focused, setFocused] = useState<string | null>(null);
  const changeNote =
    p.added.length || p.removed.length
      ? [
          p.added.length ? `adding ${p.added.map((x) => x.label).join(", ")}` : "",
          p.removed.length ? `removing ${p.removed.map((x) => x.label).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="pv-break" style={{ maxWidth: 720 }}>
      <div className="pv-b">
        <div className="pv-b__lead">
          You're drawing from <b>{p.checked.size}</b> {p.checked.size === 1 ? "pack" : "packs"} —{" "}
          <b>{p.queued}</b> questions queued.
          {changeNote && <span className="pv-b__pending">Unsaved: {changeNote}</span>}
        </div>

        <ul>
          {p.packs.map((pack) => {
            const on = p.checked.has(pack.id);
            const open = focused === pack.id;
            return (
              <li key={pack.id}>
                <div className={`pv-row ${on ? "" : "pv-row--out"}`}>
                  <div className="pv-swatch pv-topo" aria-hidden="true" />
                  <button
                    type="button"
                    className="pv-row__main"
                    aria-expanded={open}
                    onClick={() => setFocused(open ? null : pack.id)}
                  >
                    <div className="pv-row__label">
                      {pack.label}
                      <span className="pv-caret">{open ? "▲" : "▼"}</span>
                    </div>
                    <div className="pv-row__desc">{pack.description}</div>
                    <div className="pv-row__meta">
                      {pack.cardCount} questions · {pack.license}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="pv-switch"
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Add"} ${pack.label}`}
                    onClick={() => p.toggle(pack.id)}
                  />
                  {open && (
                    <dl className="pv-drawer">
                      <p>{pack.description}</p>
                      <div>
                        <dt>Questions</dt>
                        <dd>{pack.cardCount}</dd>
                      </div>
                      <div>
                        <dt>Statements</dt>
                        <dd>{pack.statementCount}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{pack.version}</dd>
                      </div>
                      <span className="pv-drawer__credit">Source: {pack.credit}</span>
                    </dl>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <CommitBar picker={p} />
    </div>
  );
}

/* ── Variant C — Study-set builder ─────────────────────────── */
function VariantC(p: Picker) {
  const includedPacks = p.packs.filter((x) => p.checked.has(x.id));
  return (
    <div className="pv-break">
      <div className="pv-head">
        <h1 className="pv-title">Build your study set</h1>
        <p className="pv-sub">Add packs on the left; your queue updates on the right.</p>
      </div>

      <div className="pv-c">
        <div className="pv-c__avail">
          <h2>Available packs</h2>
          <ul>
            {p.packs.map((pack) => {
              const on = p.checked.has(pack.id);
              return (
                <li key={pack.id}>
                  <div className="pv-avail">
                    <div className="pv-avail__text">
                      <div className="pv-avail__label">{pack.label}</div>
                      <div className="pv-avail__desc">{pack.description}</div>
                      <div className="pv-avail__count">
                        {pack.cardCount} questions · {pack.credit}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`pv-addbtn ${on ? "pv-addbtn--in" : "pv-addbtn--add"}`}
                      onClick={() => p.toggle(pack.id)}
                    >
                      {on ? "Added ✓" : "+ Add"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="pv-queue">
          <div className="pv-queue__topo">
            <div className="pv-queue__eyebrow">Your queue</div>
            <div className="pv-queue__num">{p.queued}</div>
            <div className="pv-queue__num-label">
              questions from {p.checked.size} {p.checked.size === 1 ? "pack" : "packs"}
            </div>
          </div>
          <div className="pv-queue__body">
            <ul className="pv-queue__list">
              {includedPacks.map((pack) => (
                <li key={pack.id} className="pv-queue__item">
                  <span>{pack.label}</span>
                  <small>{pack.cardCount}</small>
                  <button
                    type="button"
                    className="pv-queue__x"
                    aria-label={`Remove ${pack.label}`}
                    onClick={() => p.toggle(pack.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            {p.dirty ? (
              <>
                <div className="pv-staged">
                  <div className="pv-staged__title">Pending — not saved</div>
                  {p.added.map((x) => (
                    <div key={x.id} className="pv-staged__line pv-staged__line--add">
                      <b>+ {x.label}</b> (+{x.cardCount})
                    </div>
                  ))}
                  {p.removed.map((x) => (
                    <div key={x.id} className="pv-staged__line pv-staged__line--rem">
                      <b>− {x.label}</b> (−{x.cardCount})
                    </div>
                  ))}
                </div>
                <div className="pv-queue__actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={p.checked.size === 0}
                    onClick={p.save}
                  >
                    Save
                  </button>
                  <button type="button" className="pv-queue__discard" onClick={p.discard}>
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <p className="pv-queue__saved">Everything saved.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* Sticky commit bar shared by A and B. */
function CommitBar({ picker: p }: { picker: Picker }) {
  return (
    <div className="pv-bar">
      <div>
        <div className="pv-bar__count">
          <b>{p.queued}</b> questions in your queue
        </div>
        {p.dirty && (
          <div className="pv-bar__note">Unsaved — your queue hasn't changed yet.</div>
        )}
      </div>
      <div className="pv-bar__spacer" />
      <button
        type="button"
        className="btn-primary"
        disabled={!p.dirty || p.checked.size === 0}
        onClick={p.save}
      >
        Save selection
      </button>
    </div>
  );
}

const VARIANTS: Record<string, { name: string; render: (p: Picker) => ReactNode }> = {
  A: { name: "Map shelf", render: (p) => <VariantA {...p} /> },
  B: { name: "Atlas contents", render: (p) => <VariantB {...p} /> },
  C: { name: "Study builder", render: (p) => <VariantC {...p} /> },
};
const KEYS = Object.keys(VARIANTS);

export function PacksPrototype() {
  const picker = usePicker();
  const [variant, setVariant] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
    return q && VARIANTS[q] ? q : "A";
  });

  const go = useMemo(
    () => (key: string) => {
      setVariant(key);
      const url = new URL(window.location.href);
      url.searchParams.set("variant", key);
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const cycle = useMemo(
    () => (dir: number) => {
      const i = KEYS.indexOf(variant);
      go(KEYS[(i + dir + KEYS.length) % KEYS.length]);
    },
    [variant, go],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  return (
    <>
      {VARIANTS[variant].render(picker)}
      {import.meta.env.DEV && (
        <div className="pv-switcher" role="group" aria-label="Prototype variant switcher">
          <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>
            ‹
          </button>
          <span className="pv-switcher__label">
            <b>{variant}</b> — {VARIANTS[variant].name}
          </span>
          <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>
            ›
          </button>
        </div>
      )}
    </>
  );
}
