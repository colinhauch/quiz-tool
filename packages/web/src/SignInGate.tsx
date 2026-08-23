import { type AuthBoundary, getAuthBoundary, type SignedOutReason } from "./auth.js";
import { AuthWidget } from "./AuthWidget.js";

/**
 * The screen a signed-out learner sees in place of the app. It carries the same
 * Indigo header band as the shell, explains why sign-in is needed, and hands the
 * actual sign-in controls to {@link AuthWidget} (the app's one auth surface).
 * When the learner was bumped by an expired session, the copy says so rather
 * than reading like a first visit.
 */
export function SignInGate({
  reason,
  boundary = getAuthBoundary(),
}: {
  reason: SignedOutReason;
  boundary?: AuthBoundary;
}) {
  const expired = reason === "expired";
  return (
    <>
      <header className="app-header">
        <div className="app-header__topo" aria-hidden="true" />
        <div className="app-header__inner">
          <h1 className="app-title">Geography Quiz</h1>
        </div>
      </header>

      <main className="app-main">
        <div className="sign-in-gate">
          <p className="sign-in-gate__message" role={expired ? "status" : undefined}>
            {expired
              ? "Your session has expired. Sign in again to keep going."
              : "Sign in to start answering questions."}
          </p>
          <AuthWidget boundary={boundary} />
        </div>
      </main>
    </>
  );
}
