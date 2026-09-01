import { useEffect } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";

/**
 * Rendered while the app is mounted at `/auth/callback` — where Google OAuth
 * and magic-link redirects land. `supabase-js` (via `detectSessionInUrl`)
 * exchanges whatever it finds in the URL and reports the result as an
 * `onAuthStateChange` event, which the boundary already turns into a
 * signed-in state; `onDone` just clears `/auth/callback` from the address bar.
 * A timeout covers the case where sign-in never resolves (denied consent,
 * expired link) so the learner isn't stuck.
 */
export function AuthCallback({
  boundary = getAuthBoundary(),
  onDone,
}: {
  boundary?: AuthBoundary;
  onDone: () => void;
}) {
  useEffect(() => {
    const unsubscribe = boundary.subscribe((state) => {
      if (state.status === "signed-in") onDone();
    });
    const timer = setTimeout(onDone, 5000);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [boundary, onDone]);

  return <p className="quiz-message">Signing you in…</p>;
}
