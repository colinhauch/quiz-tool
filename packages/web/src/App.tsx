import { useEffect, useState } from "react";
import { AnswerLog } from "./AnswerLog.js";
import { type AuthBoundary, AUTH_CALLBACK_PATH, getAuthBoundary } from "./auth.js";
import { AuthCallback } from "./AuthCallback.js";
import { AuthWidget } from "./AuthWidget.js";
import { Feedback } from "./Feedback.js";
import { Packs } from "./Packs.js";
import { Quiz } from "./Quiz.js";
import { SignInGate } from "./SignInGate.js";

type Tab = "quiz" | "answers" | "packs" | "feedback";

/**
 * The app shell: an Indigo header band (carrying the topographic texture) with
 * the title and a three-item nav, then the active view. Each tab mounts a fresh
 * component, so switching to "My answers" refetches the log and picks up
 * anything just answered, and returning to the quiz draws from whatever pack
 * selection was just saved — enough navigation for the walking skeleton.
 *
 * Access is gated on the auth boundary: a signed-out learner (whether they never
 * signed in, or a live session expired) sees {@link SignInGate} instead of the
 * views, so no question is ever asked without an authenticated request behind it.
 * The boundary is a prop (defaulting to the app singleton) so tests drive the
 * gate without a real Supabase session.
 */
export function App({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [tab, setTab] = useState<Tab>("quiz");
  const [auth, setAuth] = useState(() => boundary.getState());
  const [isAuthCallback, setIsAuthCallback] = useState(
    () => window.location.pathname === AUTH_CALLBACK_PATH,
  );

  useEffect(() => boundary.subscribe(setAuth), [boundary]);

  if (isAuthCallback) {
    return (
      <AuthCallback
        onDone={() => {
          window.history.replaceState(null, "", "/");
          setIsAuthCallback(false);
        }}
      />
    );
  }

  if (auth.status === "signed-out") {
    return <SignInGate reason={auth.reason} boundary={boundary} />;
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__topo" aria-hidden="true" />
        <div className="app-header__inner">
          <div className="app-header__bar">
            <h1 className="app-title">Geography Quiz</h1>
            <AuthWidget boundary={boundary} />
          </div>
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
