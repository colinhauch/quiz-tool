import type { AnswerLog as AnswerLogData } from "@geo/contract";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerLog } from "./AnswerLog.js";

const log: AnswerLogData = [
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "China",
    correct: false,
    askedAt: "2026-07-19T12:05:00.000Z",
  },
  {
    cardId: "cc:tokyo-japan:object",
    question: "What country is Tokyo in?",
    input: "Japan",
    correct: true,
    askedAt: "2026-07-19T12:00:00.000Z",
  },
];

function stubFetch(answers: AnswerLogData) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ json: async () => answers })),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnswerLog", () => {
  it("lists recorded answers in the order the server returned them", async () => {
    stubFetch(log);
    render(<AnswerLog />);

    const rows = await screen.findAllByRole("row");
    // One header row + one row per answer.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("What country is Paris in?");
    expect(rows[1]).toHaveTextContent("Incorrect");
    expect(rows[2]).toHaveTextContent("What country is Tokyo in?");
    expect(rows[2]).toHaveTextContent("Correct");
  });

  it("shows the question text, not the raw card id", async () => {
    stubFetch(log);
    render(<AnswerLog />);
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
    expect(screen.queryByText("cc:tokyo-japan:object")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when nothing has been answered", async () => {
    stubFetch([]);
    render(<AnswerLog />);
    expect(await screen.findByText(/no answers yet/i)).toBeInTheDocument();
  });

  it("shows an error message when the log fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<AnswerLog />);
    expect(await screen.findByText(/couldn’t load your answers/i)).toBeInTheDocument();
  });

  it("renders a blank submission as a dash rather than empty", async () => {
    stubFetch([
      {
        cardId: "cc:tokyo-japan:object",
        question: "What country is Tokyo in?",
        input: "",
        correct: false,
        askedAt: "t",
      },
    ]);
    render(<AnswerLog />);
    const rows = await screen.findAllByRole("row");
    expect(rows[1]).toHaveTextContent("—");
  });
});
