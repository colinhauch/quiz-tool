import type { AuthChangeEvent, AuthError, Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

/** Where Supabase's Google OAuth and magic-link redirects land in this SPA. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

export type AuthStatus = "signed-out" | "signed-in";

/**
 * Why a signed-out learner is signed out. `"expired"` means a live session was
 * rejected mid-use — an authenticated request came back 401 (see
 * {@link AuthBoundary.handleExpiry}) — so the UI can explain the interruption
 * rather than just showing a plain sign-in prompt. `null` is an ordinary
 * signed-out state, including a background token-refresh failure that surfaces
 * as a Supabase `SIGNED_OUT` (indistinguishable there from a manual sign-out).
 */
export type SignedOutReason = "expired" | null;

/** The boundary's observable state: whether a learner is signed in, and their current access token. */
export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  reason: SignedOutReason;
}

const SIGNED_OUT: AuthState = { status: "signed-out", accessToken: null, reason: null };

/**
 * The slice of `supabase-js`'s auth client this boundary actually calls. Kept
 * narrow — rather than depending on the full client type — so unit tests can
 * inject a fake that never touches the network or real OAuth (see auth.test.ts).
 * A real `supabase-js` client's `.auth` satisfies this structurally.
 */
export interface SupabaseAuthClient {
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
  signInWithOAuth(params: {
    provider: "google";
    options?: { redirectTo?: string };
  }): Promise<{ error: AuthError | null }>;
  signInWithOtp(params: {
    email: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{ error: AuthError | null }>;
  signOut(): Promise<{ error: AuthError | null }>;
}

/** The public interface the rest of the app talks to. Supabase never leaks past it. */
export interface AuthBoundary {
  getState(): AuthState;
  /** Fires immediately with the current state, then again on every change. Returns an unsubscribe function. */
  subscribe(listener: (state: AuthState) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Reports that a supposedly-live session was rejected (a 401 the client
   * didn't foresee). Flips the boundary to signed-out with reason `"expired"`
   * and clears the stale Supabase session so its dead token stops being
   * attached. The API client funnels 401s here (see apiClient.ts).
   */
  handleExpiry(): void;
}

/**
 * Builds an {@link AuthBoundary} around a Supabase auth client. Relies solely
 * on `onAuthStateChange` — Supabase fires it once immediately (an
 * `INITIAL_SESSION` event carrying whatever session it recovered, or null) and
 * again on every sign-in/sign-out/refresh, so there is exactly one source of
 * truth for state and no race with a separate initial fetch.
 */
export function createAuthBoundary(client: { auth: SupabaseAuthClient }): AuthBoundary {
  let state: AuthState = SIGNED_OUT;
  // Whether the current signed-out state is due to an expired/rejected session.
  // Tracked separately from `state` because Supabase's own SIGNED_OUT event
  // (fired when we clear the dead session) must not erase the "expired" reason.
  // A fresh session clears it; a manual sign-out clears it explicitly.
  let expired = false;
  const listeners = new Set<(state: AuthState) => void>();

  const setState = (next: AuthState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const publish = (session: Session | null) => {
    if (session?.access_token) {
      expired = false;
      setState({ status: "signed-in", accessToken: session.access_token, reason: null });
    } else {
      setState({ status: "signed-out", accessToken: null, reason: expired ? "expired" : null });
    }
  };

  client.auth.onAuthStateChange((_event, session) => publish(session));

  const redirectTo = () => `${window.location.origin}${AUTH_CALLBACK_PATH}`;

  return {
    getState: () => state,
    subscribe(listener) {
      listener(state);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo() },
      });
      if (error) throw error;
    },
    async signInWithMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
    },
    async signOut() {
      expired = false;
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    handleExpiry() {
      // Idempotent: concurrent authenticated requests can all 401 at once when a
      // session dies. Fire the flip and the session clear exactly once.
      if (expired) return;
      expired = true;
      // Reflect the interruption immediately, before Supabase's own event lands.
      setState({ status: "signed-out", accessToken: null, reason: "expired" });
      // Clear the stale session so its dead token stops being attached; the
      // resulting SIGNED_OUT event re-publishes, preserving `expired`.
      void client.auth.signOut();
    },
  };
}

function resolveSupabaseConfig(): { url: string; key: string } {
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return { url, key };
  if (env.MODE === "test") {
    // Unit tests exercise createAuthBoundary directly with a fake client (see
    // auth.test.ts) and never reach this path for real assertions; this
    // placeholder only has to satisfy supabase-js's constructor for any
    // component under test that falls back to the real singleton below.
    return { url: "http://localhost:54321", key: "test-placeholder-key" };
  }
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — set them in packages/web/.env.development or .env.production",
  );
}

/**
 * Where the feedback surfaces read whether a learner is signed in. Feedback is
 * attributable, so each surface asks this itself rather than trusting that the
 * app-wide gate kept signed-out visitors away — the gate is about to loosen for
 * anonymous play, and the answer must stay no for feedback. The setter exists so
 * component tests can drive both answers without a real session (the same seam
 * shape as apiClient's `setAccessTokenSource`).
 */
let signedInSource: () => boolean = () => getAuthBoundary().getState().status === "signed-in";

/** Overrides the sign-in reading. Production reads the auth boundary; tests inject a fake. */
export function setSignedInSource(source: () => boolean): void {
  signedInSource = source;
}

/** Whether a learner is signed in right now. */
export function readSignedIn(): boolean {
  return signedInSource();
}

let singleton: AuthBoundary | undefined;

/** The app-wide boundary, built once around the real `supabase-js` client. */
export function getAuthBoundary(): AuthBoundary {
  if (!singleton) {
    const { url, key } = resolveSupabaseConfig();
    const client = createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    singleton = createAuthBoundary(client);
  }
  return singleton;
}
