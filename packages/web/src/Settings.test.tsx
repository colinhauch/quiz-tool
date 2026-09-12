import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthBoundary, type AuthState, setSignedInSource } from "./auth.js";
import {
  readAutocompletePref,
  readAutoZoomPref,
  readMapProjectionPref,
  resetPreferences,
  writeMapProjectionPref,
} from "./preferences.js";
import { PROJECTIONS } from "./projection.js";
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
  setSignedInSource(() => false);
  vi.restoreAllMocks();
});

describe("Settings page", () => {
  it("displays the signed-in learner's email read-only", () => {
    render(<Settings boundary={fakeBoundary(signedIn("learner@example.com"))} />);

    const account = screen.getByRole("region", { name: /account/i });
    expect(within(account).getByText("learner@example.com")).toBeInTheDocument();
    // No editable control for the email.
    expect(within(account).queryByRole("textbox")).not.toBeInTheDocument();
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

  it("still renders and stays interactive on defaults after a failed preferences read", () => {
    // resetPreferences() (the failed-read fallback) leaves the store at defaults.
    resetPreferences();
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    expect(screen.getByRole("checkbox", { name: /autocomplete/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});

describe("Settings sign out (#234)", () => {
  it("puts the only Sign out control on the account row", () => {
    render(<Settings boundary={fakeBoundary(signedIn("learner@example.com"))} />);

    const account = screen.getByRole("region", { name: /account/i });
    expect(within(account).getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    // The standalone bottom-of-page Sign out section is gone: one control, not two.
    expect(screen.getAllByRole("button", { name: /sign out/i })).toHaveLength(1);
  });

  it("calls the boundary's signOut when Sign out is clicked", () => {
    const boundary = fakeBoundary(signedIn("a@b.co"));
    render(<Settings boundary={boundary} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(boundary.signOut).toHaveBeenCalledOnce();
  });
});

describe("Settings map projection preference (#235)", () => {
  const projectionControl = () => screen.getByRole("combobox", { name: /projection/i });

  it("offers every registered projection by its human label", () => {
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    const options = within(projectionControl()).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(PROJECTIONS.map((p) => p.label));
  });

  it("reflects the stored projection on mount", () => {
    writeMapProjectionPref("equirectangular");
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    expect(projectionControl()).toHaveValue("equirectangular");
  });

  it("writes a change through the account-synced store, surviving a remount", () => {
    const first = render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);
    fireEvent.change(projectionControl(), { target: { value: "equirectangular" } });

    expect(readMapProjectionPref()).toBe("equirectangular");

    first.unmount();
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);
    expect(projectionControl()).toHaveValue("equirectangular");
  });

  it("falls back to Equal Earth for an unknown or legacy stored id", () => {
    writeMapProjectionPref("mystery-mercator");
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    expect(projectionControl()).toHaveValue("equal-earth");
  });
});

describe("Settings feedback section (#236)", () => {
  /** Stubs the feedback POST, recording each body — the shape Feedback.test uses. */
  function stubFeedbackFetch() {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: { body?: string }) => {
        posts.push(JSON.parse(init?.body ?? "{}"));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }),
    );
    return posts;
  }

  it("renders the feedback card last, after Account and Preferences", () => {
    setSignedInSource(() => true);
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    expect(screen.getByLabelText(/your feedback/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Account",
      "Preferences",
      "Feedback",
    ]);
    // A labelled region like its two siblings, so the card reads as a section.
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? "")).toContain(
      "Feedback",
    );
  });

  it("sends feedback end to end from Settings, with the same confirmation", async () => {
    setSignedInSource(() => true);
    const posts = stubFeedbackFetch();
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    fireEvent.change(screen.getByLabelText(/your feedback/i), {
      target: { value: "the map is lovely" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByText(/your feedback was sent/i)).toBeInTheDocument();
    expect(posts).toEqual([{ kind: "general", comment: "the map is lovely" }]);
  });

  it("still refuses whitespace-only feedback from Settings", () => {
    setSignedInSource(() => true);
    const posts = stubFeedbackFetch();
    render(<Settings boundary={fakeBoundary(signedIn("a@b.co"))} />);

    fireEvent.change(screen.getByLabelText(/your feedback/i), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: /send feedback/i })).toBeDisabled();
    expect(posts).toEqual([]);
  });
});
