import { type FormEvent, useEffect, useState } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";

/**
 * The app's one sign-in / sign-out surface. Talks only to the {@link AuthBoundary}
 * — never to `supabase-js` directly — so it renders the same way for a fake
 * boundary in tests as for the real singleton in the app (default prop).
 */
export function AuthWidget({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [state, setState] = useState(() => boundary.getState());
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);

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

  function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    void boundary.signInWithMagicLink(email).then(() => setLinkSent(true));
  }

  return (
    <div className="auth-widget">
      <button
        type="button"
        className="auth-widget__google"
        onClick={() => void boundary.signInWithGoogle()}
      >
        Sign in with Google
      </button>
      <form className="auth-widget__magic" onSubmit={sendMagicLink}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email for a magic sign-in link"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setLinkSent(false);
          }}
        />
        <button type="submit">{linkSent ? "Check your email" : "Email me a link"}</button>
      </form>
    </div>
  );
}
