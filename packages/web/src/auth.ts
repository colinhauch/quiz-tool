import type { AuthChangeEvent, AuthError, Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

/** Where Supabase's Google OAuth and magic-link redirects land in this SPA. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

export type AuthStatus = "signed-out" | "signed-in";

/** The boundary's observable state: whether a learner is signed in, and their current access token. */
export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", accessToken: null };

function stateFromSession(session: Session | null): AuthState {
  return session?.access_token
    ? { status: "signed-in", accessToken: session.access_token }
    : SIGNED_OUT;
}

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
  const listeners = new Set<(state: AuthState) => void>();

  const setState = (next: AuthState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  client.auth.onAuthStateChange((_event, session) => setState(stateFromSession(session)));

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
      const { error } = await client.auth.signOut();
      if (error) throw error;
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
