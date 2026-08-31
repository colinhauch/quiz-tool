import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createAuthBoundary, type SupabaseAuthClient } from "./auth.js";

function fakeSession(accessToken: string): Session {
  return { access_token: accessToken } as Session;
}

/**
 * A fake `supabase-js` auth client: no network, no real OAuth. `emit` drives it
 * the way Supabase itself drives `onAuthStateChange` — this is the seam the
 * boundary is designed around (see auth.ts).
 */
function makeFakeClient() {
  let onChange: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const auth: SupabaseAuthClient = {
    onAuthStateChange: vi.fn((callback) => {
      onChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return {
    auth,
    emit: (event: AuthChangeEvent, session: Session | null) => onChange?.(event, session),
  };
}

describe("createAuthBoundary", () => {
  it("starts signed out", () => {
    const boundary = createAuthBoundary(makeFakeClient());
    expect(boundary.getState()).toEqual({
      status: "signed-out",
      accessToken: null,
      reason: null,
    });
  });

  it("flips to signed-in and exposes the access token once a session appears", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);

    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    expect(boundary.getState()).toEqual({
      status: "signed-in",
      accessToken: "tok-abc",
      reason: null,
    });
  });

  it("notifies subscribers immediately, then on every change", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    const seen: string[] = [];
    boundary.subscribe((state) => seen.push(state.status));

    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    expect(seen).toEqual(["signed-out", "signed-in"]);
  });

  it("stops notifying an unsubscribed listener", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    const seen: string[] = [];
    const unsubscribe = boundary.subscribe((state) => seen.push(state.status));
    unsubscribe();

    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    expect(seen).toEqual(["signed-out"]);
  });

  it("signs out and clears the session", async () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    await boundary.signOut();
    client.emit("SIGNED_OUT", null);

    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(boundary.getState()).toEqual({
      status: "signed-out",
      accessToken: null,
      reason: null,
    });
  });

  it("handleExpiry flips to signed-out with an 'expired' reason and clears the stale session", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    boundary.handleExpiry();

    expect(boundary.getState()).toEqual({
      status: "signed-out",
      accessToken: null,
      reason: "expired",
    });
    // The dead session is cleared so the expired token stops being attached.
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("keeps the 'expired' reason when Supabase then emits its own SIGNED_OUT", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    boundary.handleExpiry();
    client.emit("SIGNED_OUT", null); // Supabase's follow-up event from the clear

    expect(boundary.getState().reason).toBe("expired");
  });

  it("clears a prior 'expired' reason once the learner signs back in", () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    boundary.handleExpiry();

    client.emit("SIGNED_IN", fakeSession("tok-new"));

    expect(boundary.getState()).toEqual({
      status: "signed-in",
      accessToken: "tok-new",
      reason: null,
    });
  });

  it("a manual sign-out is not reported as expired", async () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);
    client.emit("SIGNED_IN", fakeSession("tok-abc"));

    await boundary.signOut();
    client.emit("SIGNED_OUT", null);

    expect(boundary.getState().reason).toBeNull();
  });

  it("signs in with Google via the callback redirect", async () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);

    await boundary.signInWithGoogle();

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.stringContaining("/auth/callback") },
    });
  });

  it("signs in with a magic link sent to the given email", async () => {
    const client = makeFakeClient();
    const boundary = createAuthBoundary(client);

    await boundary.signInWithMagicLink("learner@example.com");

    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "learner@example.com",
      options: { emailRedirectTo: expect.stringContaining("/auth/callback") },
    });
  });
});
