import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Users } from "./Users.js";

const USERS = [
  {
    id: "u1",
    email: "a@example.com",
    createdAt: "2026-08-01T00:00:00.000Z",
    lastSignInAt: "2026-08-20T00:00:00.000Z",
    answerCount: 12,
    lastAnsweredAt: "2026-08-20T00:00:00.000Z",
  },
  // Registered, but never played in the selected environment (#173).
  { id: "u2", email: null, createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null, answerCount: 0, lastAnsweredAt: null },
];

const POPULATION = {
  totalUsers: 2,
  totalAnswers: 5,
  accuracyDistribution: [{ label: "75-100%", userCount: 2 }],
  activityByDay: [{ date: "2026-08-20", activeUsers: 2, answerCount: 5 }],
};

const USER_DETAIL = {
  user: USERS[0],
  abilities: [{ packId: "test-pack", packLabel: "Test Pack", ability: 1550 }],
  aggregate: { totalAnswers: 3, accuracy: 2 / 3, packsTouched: ["test-pack"], lastActiveAt: "2026-08-20T00:00:00.000Z" },
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
// these fixtures stay keyed by the bare route, which is what's actually
// under test here — not the environment plumbing (covered separately by
// `apiClient.test.ts` and the BFF route tests).
function withoutEnv(path: string): string {
  return path.replace(/([?&])env=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

function mockFetchSequence() {
  const responses = new Map<string, unknown>([
    ["/api/users", USERS],
    ["/api/population", POPULATION],
    ["/api/users/u1", USER_DETAIL],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = withoutEnv(String(input));
      const body = responses.get(path);
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe("Users surface", () => {
  beforeEach(() => {
    mockFetchSequence();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every user and shows the population summary", async () => {
    render(<Users />);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
    expect(screen.getByText("Total users: 2")).toBeInTheDocument();
    expect(screen.getByText("75-100%")).toBeInTheDocument();
  });

  it("opens a user's detail and can navigate back", async () => {
    render(<Users />);
    fireEvent.click(await screen.findByText("a@example.com"));

    expect(await screen.findByText("Total answers: 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All users" }));
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
  });

  it("shows each user's activity in the selected environment", async () => {
    render(<Users />);
    expect(await screen.findByText("12")).toBeInTheDocument();
  });

  it("marks a user with no activity in this environment, rather than dropping them from the roster", async () => {
    render(<Users />);
    // The roster is the shared auth pool, so u2 must still be listed — the
    // finding is precisely that they registered and never played here.
    expect(await screen.findByText(/no activity/i)).toBeInTheDocument();
  });

  it("says the roster is shared while the figures beside it are not", async () => {
    render(<Users />);
    expect(await screen.findByText(/shared across every environment/i)).toBeInTheDocument();
  });
});
