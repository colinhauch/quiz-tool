import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Feedback } from "./Feedback.js";

const ROWS = [
  {
    id: 3,
    createdAt: "2026-08-30T00:00:00.000Z",
    userId: "u1",
    userEmail: "a@example.com",
    kind: "question",
    comment: "This question is wrong",
    context: { prompt: "Capital of Japan?", packLabel: "Capital Cities", packId: "capital-cities", acceptedAnswers: ["Tokyo"], input: "Kyoto" },
    status: "unresolved",
  },
  {
    id: 1,
    createdAt: "2026-08-28T00:00:00.000Z",
    userId: "u2",
    userEmail: null,
    kind: "general",
    comment: "Love the app",
    status: "resolved",
  },
];

let requestedPaths: string[];

function mockFetch() {
  requestedPaths = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input);
      requestedPaths.push(path);
      const url = new URL(path, "http://localhost");
      const status = url.searchParams.get("status");
      const kind = url.searchParams.get("kind");
      const rows = ROWS.filter(
        (r) => (status === null || status === "all" || r.status === status) && (kind === null || kind === "all" || r.kind === kind),
      );
      return new Response(JSON.stringify(rows), { status: 200 });
    }),
  );
}

describe("Feedback surface", () => {
  beforeEach(mockFetch);
  afterEach(() => vi.unstubAllGlobals());

  it("lists every report newest-first with its submitter and captured context", async () => {
    render(<Feedback />);

    expect(await screen.findByText("This question is wrong")).toBeInTheDocument();
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("Capital of Japan?")).toBeInTheDocument();
    expect(screen.getByText("Capital Cities")).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();

    const comments = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => (row as HTMLTableRowElement).cells[3]?.textContent);
    expect(comments).toEqual(["This question is wrong", "Love the app"]);
  });

  it("re-requests with the status filter and shows only matching rows", async () => {
    render(<Feedback />);
    await screen.findByText("This question is wrong");

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "resolved" } });

    expect(await screen.findByText("Love the app")).toBeInTheDocument();
    expect(screen.queryByText("This question is wrong")).not.toBeInTheDocument();
    expect(requestedPaths.at(-1)).toContain("status=resolved");
  });

  it("re-requests with the kind filter", async () => {
    render(<Feedback />);
    await screen.findByText("This question is wrong");

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "question" } });

    expect(await screen.findByText("This question is wrong")).toBeInTheDocument();
    expect(screen.queryByText("Love the app")).not.toBeInTheDocument();
    expect(requestedPaths.at(-1)).toContain("kind=question");
  });

  it("says so when the read store is unconfigured, instead of loading forever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Internal Server Error", { status: 500 })));

    render(<Feedback />);

    expect(await screen.findByText(/could not load feedback/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("offers no control that changes a report's status (the admin never writes)", async () => {
    render(<Feedback />);
    await screen.findByText("This question is wrong");

    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });
});
