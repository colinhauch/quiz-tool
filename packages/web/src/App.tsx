import type { QuestionResponse } from "@geo/contract";
import { useEffect, useState } from "react";

/** Where the browser reaches the Node server; `/api` is proxied in dev (see vite.config.ts). */
const QUESTION_URL = "/api/question";

type Status =
  | { state: "loading" }
  | { state: "ready"; question: QuestionResponse }
  | { state: "error" };

export function App() {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    let active = true;
    fetch(QUESTION_URL)
      .then((res) => res.json() as Promise<QuestionResponse>)
      .then((question) => {
        if (active) setStatus({ state: "ready", question });
      })
      .catch(() => {
        if (active) setStatus({ state: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Geography Quiz</h1>
      {status.state === "ready" && <p>{status.question.prompt}</p>}
      {status.state === "loading" && <p>Loading a question…</p>}
      {status.state === "error" && <p>Couldn’t load a question. Try again.</p>}
    </main>
  );
}
