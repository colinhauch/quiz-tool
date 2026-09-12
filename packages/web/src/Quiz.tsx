import type { AnswerResponse, CardStats, QuestionResponse } from "@geo/contract";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnswerBox } from "./AnswerBox.js";
import { getQuestion, submitAnswer as submitAnswerRequest } from "./apiClient.js";
import {
  readAutocompletePref,
  readAutoZoomPref,
  readMapProjectionPref,
  writeAutocompletePref,
  writeAutoZoomPref,
} from "./preferences.js";
import { MapAid } from "./MapAid.js";
import { type ProjectionId, projectionFor } from "./projection.js";
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

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const [suggestEnabled, setSuggestEnabled] = useState(readAutocompletePref);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(readAutoZoomPref);
  // The map projection (#221): read from the account-synced preferences store,
  // where Settings is the only writer (#235). Read rather than held in state —
  // nothing here changes it, and a change in Settings is picked up on the remount
  // a tab switch does. `projectionFor` resolves the stored id to a valid one
  // (falling back to Equal Earth for an unknown/legacy/missing id).
  const projectionId: ProjectionId = projectionFor(readMapProjectionPref()).id;
  const nextButtonRef = useRef<HTMLButtonElement>(null);
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
      </div>

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
                      boundaryGeoJSON: view.result.revealVisual.boundaryGeoJSON,
                    }
                  : {})}
                autoZoom={autoZoomEnabled}
                projectionId={projectionId}
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
              <VisualAid
                visual={view.result.revealVisual}
                slot="reveal"
                autoZoom={autoZoomEnabled}
                projectionId={projectionId}
              />
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
