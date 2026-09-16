import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthState } from "./auth.js";
import { AuthWidget } from "./AuthWidget.js";

/** A fake boundary — mirrors the seam auth.test.ts exercises directly. */
function makeFakeBoundary(initial: AuthState): AuthBoundary & { emit: (state: AuthState) => void } {
  let state = initial;
  const listeners = new Set<(state: AuthState) => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listener(state);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signInWithGoogle: vi.fn(async () => {}),
    signInWithMagicLink: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    handleExpiry: vi.fn(),
    emit(next) {
      state = next;
      for (const listener of listeners) listener(state);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const signedOut = { status: "signed-out", accessToken: null, email: null, reason: null } as const;

describe("AuthWidget", () => {
  it("offers password, magic-link, and Google sign-in together when signed out", () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email me a sign-in link/i })).toBeInTheDocument();
  });

  it("signs in with Google on click", () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(boundary.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("signs in with the entered email and password", async () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });

    expect(boundary.signInWithPassword).toHaveBeenCalledWith("learner@example.com", "hunter2");
  });

  it("surfaces clear copy when the password sign-in is rejected", async () => {
    const boundary = makeFakeBoundary(signedOut);
    boundary.signInWithPassword = vi.fn(async () => {
      throw new Error("Invalid login credentials");
    });
    render(<AuthWidget boundary={boundary} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/don't match an account/i);
  });

  it("sends a magic link to the entered email", async () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "learner@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    });

    expect(boundary.signInWithMagicLink).toHaveBeenCalledWith("learner@example.com");
    expect(screen.getByRole("button", { name: /check your email/i })).toBeInTheDocument();
  });

  it("blocks a magic link with no email and does not call the boundary", async () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    });

    expect(boundary.signInWithMagicLink).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/enter your email/i);
  });

  it("shows sign out when signed in, and signs out on click", () => {
    const boundary = makeFakeBoundary({ status: "signed-in", accessToken: "tok-abc", email: null, reason: null });
    render(<AuthWidget boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(boundary.signOut).toHaveBeenCalledOnce();
  });

  it("reacts to the boundary flipping state after mount", () => {
    const boundary = makeFakeBoundary(signedOut);
    render(<AuthWidget boundary={boundary} />);

    act(() => boundary.emit({ status: "signed-in", accessToken: "tok-abc", email: null, reason: null }));

    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
