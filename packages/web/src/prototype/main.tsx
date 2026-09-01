/**
 * THROWAWAY desktop-layout prototype (skill: prototype). Forked from "variant H".
 *
 * Nomenclature (agreed with the user):
 *   • CARD          — the whole UI element.
 *   • QUESTION PANEL — the left side: strip chrome, prompt, stats, answer.
 *   • MEDIA PANEL    — the right side: the framed component holding the question
 *                      image (flag) and the map, each in an always-reserved slot.
 *
 * This round explores two things on the chosen H layout:
 *   1. Filling the empty vertical gap in the question panel — with question
 *      stats (attempts / success% / ELO / your-odds) and/or autocomplete space.
 *   2. Handling autocomplete without shifting the button — a RESERVED inline
 *      list vs. an OVERLAY popover (desktop-only, shifts nothing).
 * Plus restored chrome: the topo header strip and a gear → settings modal.
 *
 * Variants J / K / L differ in how the question panel fills the gap; the card,
 * strip, gear, and media panel are shared. Switch via `?variant=` or the bottom
 * bar. The scenario panel toggles Flag / Map / State / Typing independently.
 *
 * Real VisualAid/MapAid + real index.css. Mock data only. Not in the prod build.
 * Run:  pnpm --filter @geo/web dev   →   http://localhost:5173/prototype.html?variant=J
 */
import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { MapAid } from "../MapAid.js";
import { VisualAid } from "../VisualAid.js";
import { WORLD_VIEW } from "../mapZoom.js";
import { WORLD_LAND_PATH } from "../world-map.generated.js";
import "./prototype.css";

const answerList = new Intl.ListFormat("en", { type: "disjunction" });

// ── Mock data ──────────────────────────────────────────────────────────────
const FRANCE_FLAG =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'>" +
      "<rect width='3' height='2' fill='#fff'/>" +
      "<rect width='1' height='2' x='0' fill='#0055A4'/>" +
      "<rect width='1' height='2' x='2' fill='#EF4135'/></svg>",
  );

const FRANCE_MAP = {
  kind: "map" as const,
  entityId: "Q142",
  lat: 46.6,
  lon: 2.4,
  label: "France",
  regionExtent: { minLon: -5, minLat: 41, maxLon: 9.6, maxLat: 51.1 },
};

// Made-up question stats, for the gap-filling exploration.
const STATS = { attempts: 1204, successPct: 63, elo: 1480, difficulty: "Hard", yourOdds: 58 };
const SUGGESTIONS = ["Paris", "Papeete", "Palikir", "Panama City"];

interface Scenario {
  hasFlag: boolean;
  hasMap: boolean;
  answered: boolean;
  typing: boolean;
}

function makeQuestion({ hasFlag, hasMap }: Scenario): QuestionResponse {
  const base = { cardId: "proto", input: "text" as const, answerTypes: ["country"] };
  if (hasFlag) {
    return {
      ...base,
      prompt: "Which country does this flag belong to?",
      packId: "country-flags",
      packLabel: "Country Flags",
      promptVisual: { kind: "image", src: FRANCE_FLAG, alt: "Flag of a country" },
    };
  }
  if (hasMap) {
    return {
      ...base,
      prompt: "What is the capital of France?",
      packId: "capital-cities",
      packLabel: "Capital Cities",
    };
  }
  return {
    ...base,
    prompt: "What currency does Japan use?",
    packId: "currencies",
    packLabel: "Currencies",
  };
}

function makeResult({ hasFlag, hasMap }: Scenario): AnswerResponse {
  const answer = hasFlag ? "France" : hasMap ? "Paris" : "Japanese yen";
  return {
    correct: true,
    acceptedAnswer: answer,
    acceptedAnswers: [answer],
    ...(hasMap ? { revealVisual: FRANCE_MAP } : {}),
  };
}

// ── Shared leaf bits ─────────────────────────────────────────────────────────
function Result({ result }: { result: AnswerResponse }) {
  return (
    <p role="status" className="quiz-result quiz-result--correct">
      <strong className="quiz-result__verdict">Correct!</strong> The answer is{" "}
      {answerList.format(result.acceptedAnswers)}.
    </p>
  );
}

function FeedbackLink() {
  return (
    <div className="question-feedback">
      <button type="button" className="question-feedback__open">
        Something wrong with this question?
      </button>
    </div>
  );
}

function Suggestions() {
  return (
    <ul className="answer-suggestions" role="listbox" aria-label="Suggestions">
      {SUGGESTIONS.map((s, i) => (
        <li key={s} className={`answer-suggestion${i === 0 ? " answer-suggestion--active" : ""}`}>
          <button type="button" className="answer-suggestion__button">
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The answer region: a fixed-height slot holding the input or the verdict, with
 *  the button pinned below. `autocomplete` chooses how suggestions appear:
 *   • "overlay"  — a popover under the input; out of flow, shifts nothing.
 *   • "reserved" — an inline list in a permanently-reserved block (present in
 *                  both states) so the button never moves. */
function AnswerArea({
  scenario,
  result,
  autocomplete,
}: {
  scenario: Scenario;
  result: AnswerResponse;
  autocomplete: "overlay" | "reserved";
}) {
  const showList = scenario.typing && !scenario.answered;
  return (
    <div className="qpanel__answer">
      <div className="qpanel__slot">
        {scenario.answered ? (
          <Result result={result} />
        ) : (
          <div className="qpanel__combo">
            <input className="quiz-input" placeholder="Type your answer…" aria-label="Answer" />
            {autocomplete === "overlay" && showList && (
              <div className="qpanel__pop">
                <Suggestions />
              </div>
            )}
          </div>
        )}
      </div>
      {autocomplete === "reserved" && (
        <div className="qpanel__reserved">{showList && <Suggestions />}</div>
      )}
      <button className="btn-primary" type="button">
        {scenario.answered ? "Next question" : "Submit"}
      </button>
      <FeedbackLink />
    </div>
  );
}

// ── Question-panel stat treatments (the gap fillers) ─────────────────────────
function StatTiles() {
  return (
    <div className="stat-tiles">
      <div className="stat-tile">
        <span className="stat-tile__num">{STATS.attempts.toLocaleString()}</span>
        <span className="stat-tile__label">Attempts</span>
      </div>
      <div className="stat-tile">
        <span className="stat-tile__num">{STATS.successPct}%</span>
        <span className="stat-tile__label">Solved correctly</span>
      </div>
      <div className="stat-tile">
        <span className="stat-tile__num">{STATS.elo}</span>
        <span className="stat-tile__label">Difficulty · {STATS.difficulty}</span>
      </div>
      <div className="stat-tile stat-tile--accent">
        <span className="stat-tile__num">{STATS.yourOdds}%</span>
        <span className="stat-tile__label">Your predicted odds</span>
      </div>
    </div>
  );
}

function DifficultyGauge() {
  // ELO ~ 1000..2000 mapped to 0..100%.
  const pos = Math.max(0, Math.min(100, ((STATS.elo - 1000) / 1000) * 100));
  return (
    <div className="gauge">
      <div className="gauge__head">
        <span className="gauge__label">Difficulty</span>
        <span className="gauge__value">
          {STATS.difficulty} · ELO {STATS.elo}
        </span>
      </div>
      <div className="gauge__track">
        <div className="gauge__marker" style={{ left: `${pos}%` }} />
      </div>
      <div className="gauge__scale">
        <span>Easy</span>
        <span>Hard</span>
      </div>
      <div className="gauge__odds">
        <span className="gauge__odds-num">{STATS.yourOdds}%</span>
        <span className="gauge__odds-label">your predicted odds of a correct answer</span>
      </div>
    </div>
  );
}

function StatBar() {
  return (
    <div className="statbar">
      <div className="statbar__chips">
        <span className="chip">🎯 {STATS.successPct}% solve rate</span>
        <span className="chip">⚡ ELO {STATS.elo}</span>
        <span className="chip">🔥 4-streak</span>
      </div>
      <div className="statbar__dist" aria-label="How other learners did">
        <span className="statbar__dist-label">How others did</span>
        <div className="statbar__meter">
          <div className="statbar__meter-correct" style={{ width: `${STATS.successPct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Media panel (shared) ─────────────────────────────────────────────────────
function MapSlot({ scenario, result }: { scenario: Scenario; result: AnswerResponse }) {
  const map = result.revealVisual;
  if (!map || map.kind !== "map") return null;
  if (!scenario.answered) {
    const v = WORLD_VIEW;
    return (
      <div className="map-aid-viewport">
        <svg
          className="map-aid"
          viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="World map"
        >
          <rect className="map-aid__ocean" x={v.x} y={v.y} width={v.w} height={v.h} />
          <path className="map-aid__land" d={WORLD_LAND_PATH} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  }
  return (
    <MapAid lat={map.lat} lon={map.lon} label={map.label} regionExtent={map.regionExtent} autoZoom />
  );
}

function MediaPanel({
  q,
  scenario,
  result,
}: {
  q: QuestionResponse;
  scenario: Scenario;
  result: AnswerResponse;
}) {
  return (
    <div className="mpanel">
      <div className="mpanel__q">
        {q.promptVisual && <VisualAid visual={q.promptVisual} slot="prompt" />}
      </div>
      <div className="mpanel__map">
        <MapSlot scenario={scenario} result={result} />
      </div>
    </div>
  );
}

// ── The card shell ───────────────────────────────────────────────────────────
function Card({
  q,
  scenario,
  result,
  middle,
  autocomplete,
  onGear,
}: {
  q: QuestionResponse;
  scenario: Scenario;
  result: AnswerResponse;
  middle: React.ReactNode;
  autocomplete: "overlay" | "reserved";
  onGear: () => void;
}) {
  return (
    <div className="quiz-card card">
      <div className="quiz-card__strip">
        <span className="quiz-card__eyebrow">{q.packLabel}</span>
        <button type="button" className="card__gear" aria-label="Settings" onClick={onGear}>
          ⚙
        </button>
      </div>
      <div className="card__body">
        <div className="qpanel">
          <p className="quiz-prompt">{q.prompt}</p>
          <div className="qpanel__middle">{middle}</div>
          <AnswerArea scenario={scenario} result={result} autocomplete={autocomplete} />
        </div>
        <MediaPanel q={q} scenario={scenario} result={result} />
      </div>
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Settings</h2>
          <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <label className="modal__row">
          <input type="checkbox" defaultChecked /> Autocomplete suggestions
        </label>
        <label className="modal__row">
          <input type="checkbox" /> Auto-zoom the reveal map
        </label>
        <p className="modal__note">
          (Prototype placeholder — future card configuration lives behind this gear.)
        </p>
      </div>
    </div>
  );
}

// ── Variants — differ only in the question panel's gap filler ────────────────
function VariantJ({ scenario, onGear }: VariantProps) {
  const q = makeQuestion(scenario);
  return (
    <Card
      q={q}
      scenario={scenario}
      result={makeResult(scenario)}
      autocomplete="overlay"
      onGear={onGear}
      middle={<StatTiles />}
    />
  );
}

function VariantK({ scenario, onGear }: VariantProps) {
  const q = makeQuestion(scenario);
  return (
    <Card
      q={q}
      scenario={scenario}
      result={makeResult(scenario)}
      autocomplete="reserved"
      onGear={onGear}
      middle={<DifficultyGauge />}
    />
  );
}

function VariantL({ scenario, onGear }: VariantProps) {
  const q = makeQuestion(scenario);
  return (
    <Card
      q={q}
      scenario={scenario}
      result={makeResult(scenario)}
      autocomplete="overlay"
      onGear={onGear}
      middle={<StatBar />}
    />
  );
}

interface VariantProps {
  scenario: Scenario;
  onGear: () => void;
}

const VARIANTS = {
  J: { name: "Stat tiles · overlay autocomplete", Comp: VariantJ },
  K: { name: "Difficulty gauge · reserved autocomplete", Comp: VariantK },
  L: { name: "Stat bar + distribution · overlay", Comp: VariantL },
} as const;
type VariantKey = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as VariantKey[];

function readVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get("variant");
  return v && v in VARIANTS ? (v as VariantKey) : "J";
}

function Switcher({ current, onChange }: { current: VariantKey; onChange: (k: VariantKey) => void }) {
  const i = KEYS.indexOf(current);
  const go = (d: number) => onChange(KEYS[(i + d + KEYS.length) % KEYS.length]!);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="pt-switcher">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ‹
      </button>
      <span className="pt-switcher__label">
        {current} — {VARIANTS[current].name}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="pt-seg">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ScenarioPanel({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  const set = (patch: Partial<Scenario>) => onChange({ ...scenario, ...patch });
  const yn: [string, string][] = [
    ["y", "On"],
    ["n", "Off"],
  ];
  return (
    <div className="pt-scenario">
      <div className="pt-scenario__title">Scenario</div>
      <div className="pt-scenario__row">
        <span>Flag image</span>
        <Seg
          value={scenario.hasFlag ? "y" : "n"}
          options={[["y", "Present"], ["n", "None"]]}
          onChange={(v) => set({ hasFlag: v === "y" })}
        />
      </div>
      <div className="pt-scenario__row">
        <span>Map</span>
        <Seg
          value={scenario.hasMap ? "y" : "n"}
          options={[["y", "Available"], ["n", "None"]]}
          onChange={(v) => set({ hasMap: v === "y" })}
        />
      </div>
      <div className="pt-scenario__row">
        <span>State</span>
        <Seg
          value={scenario.answered ? "y" : "n"}
          options={[["n", "Asking"], ["y", "Answered"]]}
          onChange={(v) => set({ answered: v === "y" })}
        />
      </div>
      <div className="pt-scenario__row">
        <span>Autocomplete typing</span>
        <Seg value={scenario.typing ? "y" : "n"} options={yn} onChange={(v) => set({ typing: v === "y" })} />
      </div>
      <p className="pt-scenario__hint">
        Flip Flag/Map — the question panel shouldn’t move. Toggle Typing to see autocomplete handling.
      </p>
    </div>
  );
}

function Root() {
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [scenario, setScenario] = useState<Scenario>({
    hasFlag: true,
    hasMap: true,
    answered: false,
    typing: false,
  });
  const [gearOpen, setGearOpen] = useState(false);

  function change(k: VariantKey) {
    setVariant(k);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", k);
    window.history.replaceState(null, "", url);
  }

  const { Comp } = VARIANTS[variant];

  return (
    <>
      <header className="app-header">
        <div className="app-header__topo" aria-hidden="true" />
        <div className="app-header__inner">
          <h1 className="app-title">Geography Quiz — desktop layout prototype</h1>
        </div>
      </header>
      <main className="pt-stage-main">
        <Comp scenario={scenario} onGear={() => setGearOpen(true)} />
      </main>
      {gearOpen && <SettingsModal onClose={() => setGearOpen(false)} />}
      <ScenarioPanel scenario={scenario} onChange={setScenario} />
      <Switcher current={variant} onChange={change} />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
