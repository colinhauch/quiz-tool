import { type FormEvent, useEffect, useState } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";

/**
 * The app's one sign-in / sign-out surface. Talks only to the {@link AuthBoundary}
 * — never to `supabase-js` directly — so it renders the same way for a fake
 * boundary in tests as for the real singleton in the app (default prop).
 *
 * Signed out (only ever rendered inside the sign-in gate) it offers all three
 * ways in at once — email+password, magic link, and Google — none hidden. A
 * single email field feeds both the password form and the magic link. Signed in
 * (rendered in the header) it is just a Sign out button.
 */
export function AuthWidget({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [state, setState] = useState(() => boundary.getState());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One in-flight guard across every action, so a slow request can't be
  // double-submitted and password + magic-link can't race each other.
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

  function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setLinkSent(false);
    setPending(true);
    boundary
      .signInWithPassword(email, password)
      .catch(() => setError("That email and password don't match an account."))
      .finally(() => setPending(false));
  }

  function sendMagicLink() {
    if (pending) return;
    // The browser only validates the email field on a form submit; this button
    // isn't the submitter, so guard an empty/malformed address ourselves.
    if (!email.includes("@")) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    setPending(true);
    boundary
      .signInWithMagicLink(email)
      .then(() => setLinkSent(true))
      .catch(() => setError("Couldn't send a sign-in link. Try again."))
      .finally(() => setPending(false));
  }

  return (
    <div className="auth-widget">
      <button
        type="button"
        className="auth-widget__google"
        disabled={pending}
        onClick={() => void boundary.signInWithGoogle()}
      >
        Sign in with Google
      </button>

      <div className="auth-widget__divider" aria-hidden="true">
        or
      </div>

      <form className="auth-widget__password" onSubmit={signInWithPassword}>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setLinkSent(false);
            setError(null);
          }}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="auth-widget__password-submit" disabled={pending}>
          Sign in
        </button>
      </form>

      <button
        type="button"
        className="auth-widget__magic"
        disabled={pending}
        onClick={sendMagicLink}
      >
        {linkSent ? "Check your email" : "Email me a sign-in link"}
      </button>

      {error && (
        <p className="auth-widget__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
