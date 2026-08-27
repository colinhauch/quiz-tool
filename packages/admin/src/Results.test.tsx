import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Results } from "./Results.js";

const ALL_ROWS = [
  {
    cardId: "S1:object",
    input: "Japan",
    correct: true,
    askedAt: "2026-08-20T00:00:00.000Z",
    statementId: "S1",
    relation: "located_in",
    packId: "test-pack",
    subjectEntityId: "Q1490",
    userId: "u1",
    userEmail: "a@example.com",
  },
  {
    cardId: "S2:object",
    input: "wrong",
    correct: false,
    askedAt: "2026-08-21T00:00:00.000Z",
    statementId: "S2",
    relation: "capital_of",
    packId: "other-pack",
    userId: "u2",
    userEmail: "b@example.com",
  },
];

const FILTERED_ROWS = [ALL_ROWS[0]];

function mockFetchSequence() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input);
      if (path === "/api/results") return new Response(JSON.stringify({ rows: ALL_ROWS, total: 2, accuracy: 0.5 }), { status: 200 });
      if (path === "/api/results?userId=u1")
        return new Response(JSON.stringify({ rows: FILTERED_ROWS, total: 1, accuracy: 1 }), { status: 200 });
      return new Response(null, { status: 404 });
    }),
  );
}

describe("Results surface", () => {
  beforeEach(() => {
    mockFetchSequence();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every answer across users, unfiltered on first load", async () => {
    render(<Results />);
    expect(await screen.findByText("2 answers · 50.0% accuracy")).toBeInTheDocument();
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
  });

  it("applying a userId filter narrows the results and re-fetches", async () => {
    render(<Results />);
    await screen.findByText("2 answers · 50.0% accuracy");

    const userIdInput = screen.getByLabelText("User ID");
    fireEvent.change(userIdInput, { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => expect(screen.getByText("1 answers · 100.0% accuracy")).toBeInTheDocument());
    expect(screen.queryByText("b@example.com")).not.toBeInTheDocument();
  });
});
