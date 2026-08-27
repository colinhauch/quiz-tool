import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Users } from "./Users.js";

const USERS = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: "2026-08-20T00:00:00.000Z" },
  { id: "u2", email: null, createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

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

function mockFetchSequence() {
  const responses = new Map<string, unknown>([
    ["/api/users", USERS],
    ["/api/users/u1", USER_DETAIL],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input);
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

  it("lists every user through the cross-user seam", async () => {
    render(<Users />);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
  });

  it("opens a user's detail and can navigate back", async () => {
    render(<Users />);
    fireEvent.click(await screen.findByText("a@example.com"));

    expect(await screen.findByText("Total answers: 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All users" }));
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
  });
});
