import { useState } from "react";
import { AnswerLog } from "./AnswerLog.js";
import { Feedback } from "./Feedback.js";
import { Packs } from "./Packs.js";
import { Quiz } from "./Quiz.js";

type Tab = "quiz" | "answers" | "packs" | "feedback";

/**
 * The app shell: an Indigo header band (carrying the topographic texture) with
 * the title and a three-item nav, then the active view. Each tab mounts a fresh
 * component, so switching to "My answers" refetches the log and picks up
 * anything just answered, and returning to the quiz draws from whatever pack
 * selection was just saved — enough navigation for the walking skeleton.
 */
export function App() {
  const [tab, setTab] = useState<Tab>("quiz");

  return (
    <>
      <header className="app-header">
        <div className="app-header__topo" aria-hidden="true" />
        <div className="app-header__inner">
          <h1 className="app-title">Geography Quiz</h1>
          <nav className="app-nav" aria-label="Views">
            <button type="button" aria-current={tab === "quiz"} onClick={() => setTab("quiz")}>
              Quiz
            </button>
            <button
              type="button"
              aria-current={tab === "answers"}
              onClick={() => setTab("answers")}
            >
              My answers
            </button>
            <button type="button" aria-current={tab === "packs"} onClick={() => setTab("packs")}>
              Packs
            </button>
            <button
              type="button"
              aria-current={tab === "feedback"}
              onClick={() => setTab("feedback")}
            >
              Feedback
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {tab === "quiz" && <Quiz />}
        {tab === "answers" && <AnswerLog />}
        {tab === "packs" && <Packs />}
        {tab === "feedback" && <Feedback />}
      </main>
    </>
  );
}
