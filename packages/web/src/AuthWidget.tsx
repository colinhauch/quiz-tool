import { type FormEvent, useEffect, useState } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";

type Mode = "signin" | "signup";

/**
 * The app's one sign-in / sign-out surface. Talks only to the {@link AuthBoundary}
 * — never to `supabase-js` directly — so it renders the same way for a fake
 * boundary in tests as for the real singleton in the app (default prop).
 *
 * Signed out (only ever rendered inside the sign-in gate) it offers three
 * visually separated ways in — email+password, magic link, and Google — none
 * hidden. The password panel carries its own Sign in / Create account toggle;
 * the passwordless options (magic link, Google) serve both modes unchanged.
 * Signed in (rendered in the header) it is just a Sign out button.
 */
export function AuthWidget({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [state, setState] = useState(() => boundary.getState());
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A positive status line (magic link sent, or "confirm your email" after
  // signup) shown in place of any error.
  const [notice, setNotice] = useState<string | null>(null);
  // One in-flight guard across every action, so a slow request can't be
  // double-submitted and the flows can't race each other.
  const [pending, setPending] = useState(false);

  useEffect(() => boundary.subscribe(setState), [boundary]);

  if (state.status === "signed-in") {
    return (
      <div className="auth-widget">
        <button
          type="button"
          className="auth-widget__signout"
          onClick={() => void boundary.signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  // Every action shares this run/guard/report shape; the two callers differ only
  // in the work they do and the copy they show on failure.
  function run(work: () => Promise<void>, failure: string) {
    if (pending) return;
    setError(null);
    setNotice(null);
    setPending(true);
    work()
      .catch(() => setError(failure))
      .finally(() => setPending(false));
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (mode === "signin") {
      run(
        () => boundary.signInWithPassword(email, password),
        "That email and password don't match an account.",
      );
      return;
    }
    run(async () => {
      const { confirmationRequired } = await boundary.signUpWithPassword(email, password);
      if (confirmationRequired) {
        setNotice("Account created — check your email to confirm it, then sign in.");
      }
    }, "Couldn't create that account. It may already exist.");
  }

  function sendMagicLink() {
    // The browser only validates the email field on a form submit; this button
    // isn't the submitter, so guard an empty/malformed address ourselves.
    if (!email.includes("@")) {
      setNotice(null);
      setError("Enter your email address first.");
      return;
    }
    run(async () => {
      await boundary.signInWithMagicLink(email);
      setNotice("Check your email for a sign-in link.");
    }, "Couldn't send a sign-in link. Try again.");
  }

  return (
    <div className="auth-widget">
      <section className="auth-method">
        <button
          type="button"
          className="auth-widget__google"
          disabled={pending}
          onClick={() => void boundary.signInWithGoogle()}
        >
          Sign in with Google
        </button>
      </section>

      <div className="auth-widget__divider" aria-hidden="true">
        or
      </div>

      <section className="auth-method auth-widget__password-panel">
        <div className="auth-widget__tabs" role="tablist" aria-label="Email account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className="auth-widget__tab"
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className="auth-widget__tab"
            onClick={() => switchMode("signup")}
          >
            Create account
          </button>
        </div>

        <form className="auth-widget__password" onSubmit={submitPassword}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
              setNotice(null);
            }}
          />
          <input
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="auth-widget__password-submit" disabled={pending}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>

      <div className="auth-widget__divider" aria-hidden="true">
        or
      </div>

      <section className="auth-method">
        <button
          type="button"
          className="auth-widget__magic"
          disabled={pending}
          onClick={sendMagicLink}
        >
          Email me a sign-in link
        </button>
      </section>

      {error && (
        <p className="auth-widget__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth-widget__notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
