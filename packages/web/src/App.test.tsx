import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { type AuthBoundary, type AuthState, setSignedInSource } from "./auth.js";

/**
 * A fetch stub covering both views' calls: a question for the quiz, and a
 * one-entry log for the answer view. The shell just needs each view to mount
 * and reach its data — the views' own tests exercise their behavior.
 */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/preferences") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ preferences: { autoZoom: true, autocomplete: true } }),
        });
      }
      if (url === "/api/answers") {
        return Promise.resolve({
          json: async () => [
            {
              cardId: "cc:tokyo-japan:object",
              question: "What country is Tokyo in?",
              input: "Japan",
              correct: true,
              askedAt: "t",
            },
          ],
        });
      }
      return Promise.resolve({
        json: async () => ({
          cardId: "cc:tokyo-japan:object",
          prompt: "What country is Tokyo in?",
          input: "text",
        }),
      });
    }),
  );
}

/** A minimal in-memory {@link AuthBoundary} for driving the shell's gate. */
function fakeBoundary(initial: AuthState): AuthBoundary & { set(next: AuthState): void } {
  let state = initial;
  const listeners = new Set<(s: AuthState) => void>();
  const set = (next: AuthState) => {
    state = next;
    for (const l of listeners) l(state);
  };
  return {
    set,
    getState: () => state,
    subscribe(listener) {
      listener(state);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signInWithGoogle: vi.fn(async () => {}),
    signInWithMagicLink: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    handleExpiry: vi.fn(() => set({ status: "signed-out", accessToken: null, email: null, reason: "expired" })),
  };
}

const signedIn: AuthState = { status: "signed-in", accessToken: "tok", email: null, reason: null };
const signedOut: AuthState = { status: "signed-out", accessToken: null, email: null, reason: null };
const expired: AuthState = { status: "signed-out", accessToken: null, email: null, reason: "expired" };

afterEach(() => {
  setSignedInSource(() => false);
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the title and starts on the quiz view when signed in", async () => {
    stubFetch();
    render(<App boundary={fakeBoundary(signedIn)} />);
    // Entry blocks on the preferences read, so the header appears once it settles.
    expect(await screen.findByRole("heading", { name: /geography quiz/i })).toBeInTheDocument();
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("navigates to the answer log and back to the quiz when signed in", async () => {
    stubFetch();
    render(<App boundary={fakeBoundary(signedIn)} />);
    await screen.findByText("What country is Tokyo in?");

    fireEvent.click(screen.getByRole("button", { name: /my answers/i }));
    expect(
      await screen.findByRole("cell", { name: "What country is Tokyo in?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^quiz$/i }));
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("navigates to the feedback view when signed in", async () => {
    stubFetch();
    // The feedback surfaces read the sign-in state themselves rather than
    // trusting this shell's gate, so the seam has to agree with the boundary.
    setSignedInSource(() => true);
    render(<App boundary={fakeBoundary(signedIn)} />);
    await screen.findByText("What country is Tokyo in?");

    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    expect(await screen.findByLabelText(/your feedback/i)).toBeInTheDocument();
  });

  it("navigates to the settings view and tracks the current tab", async () => {
    stubFetch();
    render(<App boundary={fakeBoundary(signedIn)} />);
    await screen.findByText("What country is Tokyo in?");

    const settingsTab = screen.getByRole("button", { name: /^settings$/i });
    fireEvent.click(settingsTab);

    // The Settings page mounts (its Preferences section) and aria-current follows.
    expect(await screen.findByRole("heading", { name: /preferences/i })).toBeInTheDocument();
    expect(settingsTab).toHaveAttribute("aria-current", "true");
  });
});

describe("App preferences bootstrap", () => {
  it("holds entry until the preferences read settles", async () => {
    let releasePrefs: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/preferences") {
          return new Promise((resolve) => {
            releasePrefs = () =>
              resolve({
                ok: true,
                json: async () => ({ preferences: { autoZoom: true, autocomplete: true } }),
              });
          });
        }
        return Promise.resolve({
          json: async () => ({
            cardId: "cc:tokyo-japan:object",
            prompt: "What country is Tokyo in?",
            input: "text",
          }),
        });
      }),
    );

    render(<App boundary={fakeBoundary(signedIn)} />);

    // The quiz is gated behind the in-flight preferences read.
    expect(screen.getByText(/loading your preferences/i)).toBeInTheDocument();
    expect(screen.queryByText("What country is Tokyo in?")).not.toBeInTheDocument();

    await act(async () => {
      releasePrefs?.();
    });

    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("enters with defaults when the preferences read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/preferences") return Promise.reject(new Error("network"));
        return Promise.resolve({
          json: async () => ({
            cardId: "cc:tokyo-japan:object",
            prompt: "What country is Tokyo in?",
            input: "text",
          }),
        });
      }),
    );

    render(<App boundary={fakeBoundary(signedIn)} />);

    // A failed read must not strand the learner: entry proceeds on defaults.
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("makes no preferences request for a signed-out visitor", () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ json: async () => ({}), ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App boundary={fakeBoundary(signedOut)} />);

    expect(fetchMock).not.toHaveBeenCalledWith("/api/preferences", expect.anything());
  });
});

describe("App auth gate", () => {
  it("gates a signed-out learner behind a sign-in prompt instead of the quiz", () => {
    stubFetch();
    render(<App boundary={fakeBoundary(signedOut)} />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    // The quiz nav and question are not reachable while signed out.
    expect(screen.queryByRole("button", { name: /^quiz$/i })).not.toBeInTheDocument();
  });

  it("shows a session-expired message when the reason is expiry", () => {
    stubFetch();
    render(<App boundary={fakeBoundary(expired)} />);

    expect(screen.getByText(/session (has )?expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });

  it("reveals the quiz once the learner signs in", async () => {
    stubFetch();
    const boundary = fakeBoundary(signedOut);
    render(<App boundary={boundary} />);
    expect(screen.queryByText("What country is Tokyo in?")).not.toBeInTheDocument();

    // A sign-in drives the boundary's state stream, which the shell subscribes to.
    act(() => boundary.set(signedIn));

    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });
});
