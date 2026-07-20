import { useState } from "react";
import { AnswerLog } from "./AnswerLog.js";
import { Quiz } from "./Quiz.js";

type Tab = "quiz" | "answers";

/**
 * The app shell: a title, a two-item nav, and the active view. Each tab mounts
 * a fresh component, so switching to "My answers" refetches the log and picks
 * up anything just answered — enough navigation for the walking skeleton.
 */
export function App() {
  const [tab, setTab] = useState<Tab>("quiz");

  return (
    <main>
      <h1>Geography Quiz</h1>

      <nav aria-label="Views">
        <button type="button" aria-current={tab === "quiz"} onClick={() => setTab("quiz")}>
          Quiz
        </button>
        <button type="button" aria-current={tab === "answers"} onClick={() => setTab("answers")}>
          My answers
        </button>
      </nav>

      {tab === "quiz" ? <Quiz /> : <AnswerLog />}
    </main>
  );
}
