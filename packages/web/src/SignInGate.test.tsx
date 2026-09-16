import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthState } from "./auth.js";
import { SignInGate } from "./SignInGate.js";

/** A signed-out fake boundary — the gate only ever renders for signed-out learners. */
function makeFakeBoundary(): AuthBoundary {
  const state: AuthState = { status: "signed-out", accessToken: null, email: null, reason: null };
  return {
    getState: () => state,
    subscribe(listener) {
      listener(state);
      return () => {};
    },
    signInWithGoogle: vi.fn(async () => {}),
    signInWithMagicLink: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    handleExpiry: vi.fn(),
  };
}

describe("SignInGate", () => {
  it("renders all three ways in, value-prop copy, and legal links", () => {
    render(<SignInGate reason={null} boundary={makeFakeBoundary()} />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email me a sign-in link/i })).toBeInTheDocument();
    expect(screen.getByText(/track\s+every answer/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });

  it("shows a first-visit prompt when not expired", () => {
    render(<SignInGate reason={null} boundary={makeFakeBoundary()} />);

    expect(screen.getByText(/start answering questions/i)).toBeInTheDocument();
  });

  it("preserves the expired-session messaging", () => {
    render(<SignInGate reason="expired" boundary={makeFakeBoundary()} />);

    expect(screen.getByRole("status")).toHaveTextContent(/session has expired/i);
  });
});
