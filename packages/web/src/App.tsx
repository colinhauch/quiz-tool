import { useEffect, useState } from "react";
import { AnswerLog } from "./AnswerLog.js";
import { type AuthBoundary, AUTH_CALLBACK_PATH, getAuthBoundary } from "./auth.js";
import { AuthCallback } from "./AuthCallback.js";
import { AuthWidget } from "./AuthWidget.js";
import { Packs } from "./Packs.js";
import { loadPreferences } from "./preferences.js";
import { Quiz } from "./Quiz.js";
import { Settings } from "./Settings.js";
import { SignInGate } from "./SignInGate.js";

type Tab = "quiz" | "answers" | "packs" | "settings";

/**
 * The app shell: an Indigo header band (carrying the topographic texture) with
 * the title and a four-item nav, then the active view. Each tab mounts a fresh
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
  // Whether the post-login preferences read has settled. Entry into the signed-in
  // app blocks on this so a synced toggle is in place before the quiz seeds from
  // it — no flash-of-default-preference. A failed read falls back to defaults
  // inside loadPreferences, so this still flips true and never strands the learner.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => boundary.subscribe(setAuth), [boundary]);

  // Load account-synced preferences once per sign-in, never for a signed-out
  // visitor. Re-runs if the learner signs out and back in (a different account).
  useEffect(() => {
    if (auth.status !== "signed-in") {
      setPrefsLoaded(false);
      return;
    }
    let active = true;
    void loadPreferences().finally(() => {
      if (active) setPrefsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [auth.status]);

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

  // Signed in, but the preferences read hasn't settled yet: hold entry so the
  // quiz never mounts against default toggles it would then have to correct.
  if (!prefsLoaded) {
    return <p className="app-loading">Loading your preferences…</p>;
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
              aria-current={tab === "settings"}
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {tab === "quiz" && <Quiz />}
        {tab === "answers" && <AnswerLog />}
        {tab === "packs" && <Packs />}
        {tab === "settings" && <Settings boundary={boundary} />}
      </main>
    </>
  );
}
