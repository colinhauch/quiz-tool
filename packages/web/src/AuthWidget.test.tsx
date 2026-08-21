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
    signOut: vi.fn(async () => {}),
    emit(next) {
      state = next;
      for (const listener of listeners) listener(state);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthWidget", () => {
  it("offers Google and magic-link sign-in when signed out", () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    render(<AuthWidget boundary={boundary} />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("signs in with Google on click", () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    render(<AuthWidget boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(boundary.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("sends a magic link to the entered email", async () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    render(<AuthWidget boundary={boundary} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "learner@example.com" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /email me a link/i }));
    });

    expect(boundary.signInWithMagicLink).toHaveBeenCalledWith("learner@example.com");
  });

  it("shows sign out when signed in, and signs out on click", () => {
    const boundary = makeFakeBoundary({ status: "signed-in", accessToken: "tok-abc" });
    render(<AuthWidget boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(boundary.signOut).toHaveBeenCalledOnce();
  });

  it("reacts to the boundary flipping state after mount", () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    render(<AuthWidget boundary={boundary} />);

    act(() => boundary.emit({ status: "signed-in", accessToken: "tok-abc" }));

    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
