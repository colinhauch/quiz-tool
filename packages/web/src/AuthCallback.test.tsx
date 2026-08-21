import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthCallback } from "./AuthCallback.js";
import type { AuthBoundary, AuthState } from "./auth.js";

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

describe("AuthCallback", () => {
  it("shows a signing-in message while waiting", () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    render(<AuthCallback boundary={boundary} onDone={() => {}} />);

    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });

  it("calls onDone once the boundary reaches signed-in", () => {
    const boundary = makeFakeBoundary({ status: "signed-out", accessToken: null });
    const onDone = vi.fn();
    render(<AuthCallback boundary={boundary} onDone={onDone} />);

    act(() => boundary.emit({ status: "signed-in", accessToken: "tok-abc" }));

    expect(onDone).toHaveBeenCalledOnce();
  });
});
