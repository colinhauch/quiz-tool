import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserDetail } from "./UserDetail.js";
import { consumePacksFocus } from "./navigation.js";

const USER_DETAIL = {
  user: { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  abilities: [{ packId: "test-pack", packLabel: "Test Pack", ability: 1550 }],
  aggregate: { totalAnswers: 1, accuracy: 1, packsTouched: ["test-pack"], lastActiveAt: "2026-08-20T00:00:00.000Z" },
  recentAnswers: [
    {
      cardId: "S1:object",
      input: "Japan",
      correct: true,
      askedAt: "2026-08-20T00:00:00.000Z",
      statementId: "S1",
      relation: "located_in",
      packId: "test-pack",
      subjectEntityId: "Q1490",
    },
  ],
  trajectory: [{ askedAt: "2026-08-20T00:00:00.000Z", packId: "test-pack", ability: 1550 }],
};

// apiClient (#172) appends `?env=` to every request; matching drops it so
// this fixture stays keyed by the bare route, which is what's actually under
// test here — not the environment plumbing (covered separately by
// `apiClient.test.ts` and the BFF route tests).
function withoutEnv(path: string): string {
  return path.replace(/([?&])env=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (withoutEnv(String(input)) === "/api/users/u1") return new Response(JSON.stringify(USER_DETAIL), { status: 200 });
      return new Response(null, { status: 404 });
    }),
  );
}

describe("UserDetail", () => {
  beforeEach(() => {
    mockFetch();
    consumePacksFocus(); // drain any pending focus from another test
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows unknown-user placeholder for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    render(<UserDetail userId="does-not-exist" />);
    expect(await screen.findByText(/Unknown user/)).toBeInTheDocument();
  });

  it("renders ability, aggregate, and the recent Answer Log", async () => {
    render(<UserDetail userId="u1" />);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("Total answers: 1")).toBeInTheDocument();
    expect(screen.getByText("Test Pack")).toBeInTheDocument();
    expect(screen.getByText("S1:object")).toBeInTheDocument();
  });

  it("jumping to the Card sets the cross-surface focus to that statement", async () => {
    render(<UserDetail userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Card" }));
    expect(consumePacksFocus()).toEqual({ kind: "statement", packId: "test-pack", statementId: "S1" });
  });

  it("jumping to the Entity sets the cross-surface focus to that entity", async () => {
    render(<UserDetail userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Entity" }));
    expect(consumePacksFocus()).toEqual({ kind: "entity", entityId: "Q1490" });
  });
});
