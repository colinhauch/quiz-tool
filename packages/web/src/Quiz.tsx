import type { AnswerResponse, CardStats, QuestionResponse } from "@geo/contract";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnswerBox } from "./AnswerBox.js";
import { getQuestion, submitAnswer as submitAnswerRequest } from "./apiClient.js";
import { readAutocompletePref, writeAutocompletePref } from "./autocompletePref.js";
import { readAutoZoomPref, writeAutoZoomPref } from "./autoZoomPref.js";
import { MapAid } from "./MapAid.js";
import { QuestionFeedback } from "./QuestionFeedback.js";
import { useWideLayout } from "./useWideLayout.js";
import { VisualAid } from "./VisualAid.js";

// "Asia or Europe" for a transcontinental country; "Japan" for a single answer.
const answerList = new Intl.ListFormat("en", { type: "disjunction" });

type View =
  | { state: "loading" }
  | { state: "error" }
  | { state: "asking"; question: QuestionResponse }
  | { state: "answered"; question: QuestionResponse; result: AnswerResponse };

/** The correct/incorrect verdict paragraph — shared by both layouts. */
function Verdict({ result }: { result: AnswerResponse }) {
  return (
    <p
      role="status"
      className={`quiz-result ${result.correct ? "quiz-result--correct" : "quiz-result--incorrect"}`}
    >
      <strong className="quiz-result__verdict">{result.correct ? "Correct!" : "Incorrect."}</strong>{" "}
      The answer is {answerList.format(result.acceptedAnswers)}.
    </p>
  );
}

// The card's scheduling stats, computed server-side and carried on the question
// (see `cardStatsSchema`). Attempts/Solve % are this learner's own history;
// difficulty and predicted odds are the Elo numbers. A percentage with no datum
// yet (Solve % before the first attempt) shows an em dash and stays dim.
function QuestionStats({ stats }: { stats: CardStats }) {
  const pct = (v: number) => `${Math.round(v)}%`;
  const tiles: { label: string; value: string; empty?: boolean }[] = [
    { label: "Attempts", value: String(stats.attempts) },
    stats.solvePercent === null
      ? { label: "Solve %", value: "—", empty: true }
      : { label: "Solve %", value: pct(stats.solvePercent) },
    { label: "ELO/Difficulty", value: String(Math.round(stats.difficulty)) },
    { label: "Your predicted odds", value: pct(stats.predictedOdds * 100) },
  ];

  return (
    <section className="qpanel__stats" aria-label="Question statistics">
      {tiles.map(({ label, value, empty }) => (
        <div className="qpanel__stat" key={label}>
          <span className="qpanel__stat-label">{label}</span>
          <span className={`qpanel__stat-value${empty ? " qpanel__stat-value--empty" : ""}`}>
            {value}
          </span>
        </div>
      ))}
    </section>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.5 2h3l.7 2.4a7.8 7.8 0 0 1 1.8 1l2.3-1 2.1 2.1-1 2.3c.4.6.7 1.2 1 1.8l2.4.7v3l-2.4.7a7.8 7.8 0 0 1-1 1.8l1 2.3-2.1 2.1-2.3-1a7.8 7.8 0 0 1-1.8 1l-.7 2.4h-3l-.7-2.4a7.8 7.8 0 0 1-1.8-1l-2.3 1-2.1-2.1 1-2.3a7.8 7.8 0 0 1-1-1.8L2 13.5v-3l2.4-.7c.2-.6.6-1.2 1-1.8l-1-2.3 2.1-2.1 2.3 1a7.8 7.8 0 0 1 1.8-1L10.5 2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

type CardSettingsProps = {
  suggestEnabled: boolean;
  autoZoomEnabled: boolean;
  onSuggestChange: (enabled: boolean) => void;
  onAutoZoomChange: (enabled: boolean) => void;
  onClose: () => void;
};

function CardSettings({
  suggestEnabled,
  autoZoomEnabled,
  onSuggestChange,
  onAutoZoomChange,
  onClose,
}: CardSettingsProps) {
  return (
    <div className="quiz-settings__backdrop">
      <section className="quiz-settings" id="quiz-card-settings" role="dialog" aria-modal="true" aria-labelledby="quiz-settings-title">
        <div className="quiz-settings__header">
          <h2 id="quiz-settings-title">Card settings</h2>
          <button className="quiz-settings__close" type="button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <label className="quiz-settings__toggle">
          <input type="checkbox" checked={suggestEnabled} onChange={(e) => onSuggestChange(e.target.checked)} />
          Autocomplete
        </label>
        <label className="quiz-settings__toggle">
          <input type="checkbox" checked={autoZoomEnabled} onChange={(e) => onAutoZoomChange(e.target.checked)} />
          Auto-zoom
        </label>
      </section>
    </div>
  );
}

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const [suggestEnabled, setSuggestEnabled] = useState(readAutocompletePref);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(readAutoZoomPref);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  // The next question, drawn in the background while the learner reads the
  // verdict. Holding the promise (not the resolved value) lets "Next" swap
  // instantly when it has landed and simply await it when it hasn't — either
  // way without unmounting the card to a bare loading screen. See loadQuestion.
  const prefetchedRef = useRef<Promise<QuestionResponse> | null>(null);
  const wide = useWideLayout();

  function toggleSuggest(enabled: boolean) {
    setSuggestEnabled(enabled);
    writeAutocompletePref(enabled);
  }

  function toggleAutoZoom(enabled: boolean) {
    setAutoZoomEnabled(enabled);
    writeAutoZoomPref(enabled);
  }

  const loadQuestion = useCallback(async () => {
    // Consume a background prefetch if one is in flight. When it is, keep the
    // current card mounted and await it — no flash. Only a cold load (first
    // question of the session, or a failed prefetch) falls to the bare loading
    // screen.
    const pending = prefetchedRef.current;
    prefetchedRef.current = null;
    if (!pending) setView({ state: "loading" });
    setInput("");
    try {
      const question = await (pending ?? getQuestion());
      setView({ state: "asking", question });
    } catch {
      setView({ state: "error" });
    }
  }, []);

  useEffect(() => {
    void loadQuestion();
  }, [loadQuestion]);

  // Draw the next question in the background once the current one is answered,
  // so "Next" is instant. The answer's rating update has already landed by now,
  // so this draw sees fresh ratings. A prefetched-but-unseen card (learner
  // leaves without clicking Next) is simply skipped in the scheduler's cycle.
  useEffect(() => {
    if (view.state !== "answered") return;
    const pending = getQuestion();
    // Keep the rejection from surfacing as unhandled; loadQuestion re-awaits
    // this promise and routes any failure to the error state.
    pending.catch(() => {});
    prefetchedRef.current = pending;
  }, [view.state, view.state === "answered" ? view.question.cardId : null]);

  useEffect(() => {
    if (view.state === "answered") {
      nextButtonRef.current?.focus();
    }
  }, [view.state]);

  useEffect(() => {
    if (!settingsOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  function closeSettings() {
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  }

  async function submitAnswer(question: QuestionResponse) {
    try {
      const result = await submitAnswerRequest(question.cardId, input);
      setView({ state: "answered", question, result });
    } catch {
      setView({ state: "error" });
    }
  }

  if (view.state === "loading") return <p className="quiz-message">Loading a question…</p>;
  if (view.state === "error") {
    return <p className="quiz-message">Couldn’t reach the quiz. Try again.</p>;
  }

  const asking = view.state === "asking";

  // Built here because only this component knows the state: what was typed
  // and what was accepted exist only once the question has been answered.
  const feedbackContext = {
    prompt: view.question.prompt,
    packId: view.question.packId,
    packLabel: view.question.packLabel,
    // `answered` is what makes the absent input readable: the learner
    // flagged the card before answering, rather than the client losing
    // what they typed.
    answered: view.state === "answered",
    ...(view.state === "answered" ? { input, acceptedAnswers: view.result.acceptedAnswers } : {}),
  };

  return (
    <div className="quiz-card">
      <div className="quiz-card__strip">
        <span className="quiz-card__eyebrow">{view.question.packLabel}</span>
        <button
          ref={settingsButtonRef}
          className="quiz-card__settings-button"
          type="button"
          aria-label="Open settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-controls="quiz-card-settings"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon />
        </button>
      </div>

      {settingsOpen && (
        <CardSettings
          suggestEnabled={suggestEnabled}
          autoZoomEnabled={autoZoomEnabled}
          onSuggestChange={toggleSuggest}
          onAutoZoomChange={toggleAutoZoom}
          onClose={closeSettings}
        />
      )}

      {wide ? (
        <div className="quiz-card__body quiz-card__body--wide">
          <div className="qpanel">
            <p className="quiz-prompt">{view.question.prompt}</p>
            <div className="qpanel__middle">
              <QuestionStats stats={view.question.stats} />
            </div>
            <form
              className="qpanel__answer"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (view.state === "asking") void submitAnswer(view.question);
                else void loadQuestion();
              }}
            >
              {/* Reserved whether asking or answered, so the verdict appearing
                  above the input shifts nothing below it. */}
              <div className="qpanel__verdict-slot">
                {view.state === "answered" && <Verdict result={view.result} />}
              </div>
              <div className="qpanel__slot">
                <AnswerBox
                  value={input}
                  onChange={setInput}
                  answerTypes={view.question.answerTypes}
                  suggestEnabled={suggestEnabled}
                  disabled={!asking}
                  submitButtonRef={nextButtonRef}
                />
              </div>
              <button ref={nextButtonRef} className="btn-primary" type="submit">
                {asking ? "Submit" : "Next question"}
              </button>
            </form>
            <QuestionFeedback key={view.question.cardId} cardId={view.question.cardId} context={feedbackContext} />
          </div>

          {/* The media panel (#187): one framed sub-panel, two always-reserved
              slots. Footprint is constant regardless of content, so switching
              questions never moves the question panel. */}
          <div className="mpanel">
            <div className="mpanel__image">
              <VisualAid visual={view.question.promptVisual} slot="prompt" />
            </div>
            <div className="mpanel__map">
              <MapAid
                {...(view.state === "answered" && view.result.revealVisual?.kind === "map"
                  ? {
                      lat: view.result.revealVisual.lat,
                      lon: view.result.revealVisual.lon,
                      label: view.result.revealVisual.label,
                      localGeoJSON: view.result.revealVisual.localGeoJSON,
                      regionExtent: view.result.revealVisual.regionExtent,
                    }
                  : {})}
                autoZoom={autoZoomEnabled}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="quiz-card__body">
          <p className="quiz-prompt">{view.question.prompt}</p>
          <VisualAid visual={view.question.promptVisual} slot="prompt" />

          <form
            className="quiz-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (view.state === "asking") void submitAnswer(view.question);
              else void loadQuestion();
            }}
          >
            {/* Reserved whether asking or answered, so the verdict appearing
                above the input shifts nothing below it. */}
            <div className="quiz-verdict-slot">
              {view.state === "answered" && <Verdict result={view.result} />}
            </div>
            <AnswerBox
              value={input}
              onChange={setInput}
              answerTypes={view.question.answerTypes}
              suggestEnabled={suggestEnabled}
              disabled={!asking}
              submitButtonRef={nextButtonRef}
            />
            {view.state === "answered" && (
              <VisualAid visual={view.result.revealVisual} slot="reveal" autoZoom={autoZoomEnabled} />
            )}
            <button ref={nextButtonRef} className="btn-primary" type="submit">
              {asking ? "Submit" : "Next question"}
            </button>
          </form>

          <QuestionFeedback key={view.question.cardId} cardId={view.question.cardId} context={feedbackContext} />
        </div>
      )}
    </div>
  );
}
