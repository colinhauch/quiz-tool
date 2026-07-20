import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { type FormEvent, useCallback, useEffect, useState } from "react";

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

  return (
    <>
      {view.state === "loading" && <p>Loading a question…</p>}
      {view.state === "error" && <p>Couldn’t reach the quiz. Try again.</p>}

      {view.state === "asking" && (
        <form onSubmit={(e) => submitAnswer(e, view.question)}>
          <p>{view.question.prompt}</p>
          <input
            aria-label="Your answer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit">Submit</button>
        </form>
      )}

      {view.state === "answered" && (
        <div>
          <p>{view.question.prompt}</p>
          <p role="status">
            {view.result.correct ? "Correct!" : "Incorrect."} The answer is{" "}
            {view.result.acceptedAnswer}.
          </p>
          <button type="button" onClick={() => void loadQuestion()}>
            Next question
          </button>
        </div>
      )}
    </>
  );
}
