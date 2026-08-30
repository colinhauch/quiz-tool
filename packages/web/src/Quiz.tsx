import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerBox } from "./AnswerBox.js";
import { getQuestion, submitAnswer as submitAnswerRequest } from "./apiClient.js";
import { readAutocompletePref, writeAutocompletePref } from "./autocompletePref.js";
import { readAutoZoomPref, writeAutoZoomPref } from "./autoZoomPref.js";
import { QuestionFeedback } from "./QuestionFeedback.js";
import { VisualAid } from "./VisualAid.js";

// "Asia or Europe" for a transcontinental country; "Japan" for a single answer.
const answerList = new Intl.ListFormat("en", { type: "disjunction" });

type View =
  | { state: "loading" }
  | { state: "error" }
  | { state: "asking"; question: QuestionResponse }
  | { state: "answered"; question: QuestionResponse; result: AnswerResponse };

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const [suggestEnabled, setSuggestEnabled] = useState(readAutocompletePref);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(readAutoZoomPref);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

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
      <div className="quiz-card__body">
        <p className="quiz-prompt">{view.question.prompt}</p>
        <VisualAid visual={view.question.promptVisual} slot="prompt" />

        {view.state === "asking" ? (
          <AnswerBox
            value={input}
            onChange={setInput}
            onSubmit={() => void submitAnswer(view.question)}
            answerTypes={view.question.answerTypes}
            suggestEnabled={suggestEnabled}
          />
        ) : (
          <>
            <p
              role="status"
              className={`quiz-result ${
                view.result.correct ? "quiz-result--correct" : "quiz-result--incorrect"
              }`}
            >
              <strong className="quiz-result__verdict">
                {view.result.correct ? "Correct!" : "Incorrect."}
              </strong>{" "}
              The answer is {answerList.format(view.result.acceptedAnswers)}.
            </p>
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

        {/*
          Flagging the card the learner is looking at. Keyed on the card so
          moving to the next question starts from a closed, empty box rather
          than carrying the last card's draft or confirmation. The snapshot is
          built here because only this component knows the state: what was typed
          and what was accepted exist only once the question has been answered.
        */}
        <QuestionFeedback
          key={view.question.cardId}
          cardId={view.question.cardId}
          context={{
            prompt: view.question.prompt,
            packId: view.question.packId,
            packLabel: view.question.packLabel,
            ...(view.state === "answered"
              ? { input, acceptedAnswers: view.result.acceptedAnswers }
              : {}),
          }}
        />
      </div>
    </div>
  );
}
