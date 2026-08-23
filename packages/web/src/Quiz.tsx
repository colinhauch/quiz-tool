import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerBox } from "./AnswerBox.js";
import { getQuestion, submitAnswer as submitAnswerRequest } from "./apiClient.js";
import { readAutocompletePref, writeAutocompletePref } from "./autocompletePref.js";

type View =
  | { state: "loading" }
  | { state: "error" }
  | { state: "asking"; question: QuestionResponse }
  | { state: "answered"; question: QuestionResponse; result: AnswerResponse };

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const [suggestEnabled, setSuggestEnabled] = useState(readAutocompletePref);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  function toggleSuggest(enabled: boolean) {
    setSuggestEnabled(enabled);
    writeAutocompletePref(enabled);
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
      </div>
      <div className="quiz-card__body">
        <p className="quiz-prompt">{view.question.prompt}</p>

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
              The answer is {view.result.acceptedAnswer}.
            </p>
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
      </div>
    </div>
  );
}
