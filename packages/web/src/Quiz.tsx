import type { AnswerResponse, QuestionResponse } from "@geo/contract";
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

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const [suggestEnabled, setSuggestEnabled] = useState(readAutocompletePref);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(readAutoZoomPref);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
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
    setView({ state: "loading" });
    setInput("");
    try {
      const question = await getQuestion();
      setView({ state: "asking", question });
    } catch {
      setView({ state: "error" });
    }
  }, []);

  useEffect(() => {
    void loadQuestion();
  }, [loadQuestion]);

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
        <label className="quiz-card__toggle">
          <input
            type="checkbox"
            checked={suggestEnabled}
            onChange={(e) => toggleSuggest(e.target.checked)}
          />
          Autocomplete
        </label>
        <label className="quiz-card__toggle">
          <input
            type="checkbox"
            checked={autoZoomEnabled}
            onChange={(e) => toggleAutoZoom(e.target.checked)}
          />
          Auto-zoom
        </label>
      </div>

      {wide ? (
        <div className="quiz-card__body quiz-card__body--wide">
          <div className="qpanel">
            <p className="quiz-prompt">{view.question.prompt}</p>
            <div className="qpanel__middle" />
            <form
              className="qpanel__answer"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (view.state === "asking") void submitAnswer(view.question);
                else void loadQuestion();
              }}
            >
              <div className="qpanel__slot">
                {asking ? (
                  <AnswerBox
                    value={input}
                    onChange={setInput}
                    answerTypes={view.question.answerTypes}
                    suggestEnabled={suggestEnabled}
                    submitButtonRef={nextButtonRef}
                  />
                ) : (
                  <Verdict result={view.result} />
                )}
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

          {asking ? (
            <form
              className="quiz-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitAnswer(view.question);
              }}
            >
              <AnswerBox
                value={input}
                onChange={setInput}
                answerTypes={view.question.answerTypes}
                suggestEnabled={suggestEnabled}
                submitButtonRef={submitButtonRef}
              />
              <button ref={submitButtonRef} className="btn-primary" type="submit">
                Submit
              </button>
            </form>
          ) : (
            <>
              <Verdict result={view.result} />
              <VisualAid visual={view.result.revealVisual} slot="reveal" autoZoom={autoZoomEnabled} />
              <button
                ref={nextButtonRef}
                className="btn-primary"
                type="button"
                onClick={() => void loadQuestion()}
              >
                Next question
              </button>
            </>
          )}

          <QuestionFeedback key={view.question.cardId} cardId={view.question.cardId} context={feedbackContext} />
        </div>
      )}
    </div>
  );
}
