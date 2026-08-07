import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

/** Where the browser reaches the Node server; `/api` is proxied in dev (see vite.config.ts). */
const QUESTION_URL = "/api/question";
const ANSWER_URL = "/api/answer";

type View =
  | { state: "loading" }
  | { state: "error" }
  | { state: "asking"; question: QuestionResponse }
  | { state: "answered"; question: QuestionResponse; result: AnswerResponse };

export function Quiz() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [input, setInput] = useState("");
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const loadQuestion = useCallback(async () => {
    setView({ state: "loading" });
    setInput("");
    try {
      const question = (await (await fetch(QUESTION_URL)).json()) as QuestionResponse;
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

  async function submitAnswer(event: FormEvent, question: QuestionResponse) {
    event.preventDefault();
    try {
      const res = await fetch(ANSWER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: question.cardId, input }),
      });
      const result = (await res.json()) as AnswerResponse;
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
      </div>
      <div className="quiz-card__body">
        <p className="quiz-prompt">{view.question.prompt}</p>

        {view.state === "asking" ? (
          <form className="quiz-form" onSubmit={(e) => submitAnswer(e, view.question)}>
            <input
              className="quiz-input"
              aria-label="Your answer"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            <button className="btn-primary" type="submit">
              Submit
            </button>
          </form>
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
