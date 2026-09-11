import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthBoundary, AuthState } from "./auth.js";
import {
  readAutocompletePref,
  readAutoZoomPref,
  resetPreferences,
} from "./preferences.js";
import { Settings } from "./Settings.js";

/** A minimal in-memory {@link AuthBoundary} for driving the Settings page. */
function fakeBoundary(state: AuthState): AuthBoundary {
  return {
    getState: () => state,
    subscribe(listener) {
      listener(state);
      return () => {};
    },
    signInWithGoogle: vi.fn(async () => {}),
    signInWithMagicLink: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    handleExpiry: vi.fn(),
  };
}

const signedIn = (email: string | null): AuthState => ({
  status: "signed-in",
  accessToken: "tok",
  email,
  reason: null,
});

afterEach(() => {
  resetPreferences();
  vi.restoreAllMocks();
});

describe("Settings page", () => {
  it("displays the signed-in learner's email read-only", () => {
    render(<Settings boundary={fakeBoundary(signedIn("learner@example.com"))} />);

    expect(screen.getByText("learner@example.com")).toBeInTheDocument();
    // No editable control for the email.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("seeds each toggle from the store and reflects a flip in the read helper", () => {
    // Both prefs default to true; the toggles should start checked.
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    const autocomplete = screen.getByRole("checkbox", { name: /autocomplete/i });
    const autoZoom = screen.getByRole("checkbox", { name: /auto-zoom/i });
    expect(autocomplete).toBeChecked();
    expect(autoZoom).toBeChecked();

    fireEvent.click(autocomplete);
    expect(autocomplete).not.toBeChecked();
    expect(readAutocompletePref()).toBe(false);

    fireEvent.click(autoZoom);
    expect(autoZoom).not.toBeChecked();
    expect(readAutoZoomPref()).toBe(false);
  });

  it("persists a toggle flip across remounts", () => {
    const first = render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /autocomplete/i }));
    first.unmount();

    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);
    expect(screen.getByRole("checkbox", { name: /autocomplete/i })).not.toBeChecked();
  });

  it("calls the boundary's signOut when Sign out is clicked", () => {
    const boundary = fakeBoundary(signedIn("a@b.co"));
    render(<Settings boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(boundary.signOut).toHaveBeenCalledOnce();
  });

  it("still renders and stays interactive on defaults after a failed preferences read", () => {
    // resetPreferences() (the failed-read fallback) leaves the store at defaults.
    resetPreferences();
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    expect(screen.getByRole("checkbox", { name: /autocomplete/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
