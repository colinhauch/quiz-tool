import type { AnswerLog as AnswerLogData } from "@geo/contract";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerLog } from "./AnswerLog.js";

const log: AnswerLogData = [
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "China",
    correct: false,
    acceptedAnswer: "France",
    askedAt: "2026-07-19T12:05:00.000Z",
  },
  {
    cardId: "cc:tokyo-japan:object",
    question: "What country is Tokyo in?",
    input: "Japan",
    correct: true,
    acceptedAnswer: "Japan",
    askedAt: "2026-07-19T12:00:00.000Z",
  },
];

/** Rows of the raw answer table, which the summary's totals table sits above. */
async function answerRows() {
  const table = await screen.findByRole("table", { name: /your answers/i });
  return within(table).getAllByRole("row");
}

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

    const rows = await answerRows();
    // One header row + one row per answer.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("What country is Paris in?");
    expect(rows[1]).toHaveTextContent("Incorrect");
    expect(rows[2]).toHaveTextContent("What country is Tokyo in?");
    expect(rows[2]).toHaveTextContent("Correct");
  });

  it("shows the correct answer beside a wrong submission", async () => {
    stubFetch(log);
    render(<AnswerLog />);
    const rows = await answerRows();
    // Paris row: wrong input "China", correct answer "France".
    expect(rows[1]).toHaveTextContent("France");
  });

  it("dashes the correct answer when the card no longer resolves", async () => {
    stubFetch([
      {
        cardId: "cc:gone:object",
        question: "cc:gone:object",
        input: "x",
        correct: false,
        askedAt: "t",
      },
    ]);
    render(<AnswerLog />);
    const rows = await answerRows();
    // Both the input and the (absent) correct answer render as a dash.
    const correctAnswerCell = rows[1]?.querySelectorAll("td")[2];
    expect(correctAnswerCell).toHaveTextContent("—");
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
    const rows = await answerRows();
    expect(rows[1]).toHaveTextContent("—");
  });
});

// A log with hand-counted outcomes, most recent first as the server returns it.
// 8 answers: 4 correct, 2 incorrect-with-input, 2 skips (one whitespace-only).
// 7 distinct cards (Paris appears twice). Earliest answer is 15 July 2026.
// So: absolute accuracy 4/8 = 50.0%, attempted accuracy 4/6 = 66.7%.
const mixedLog: AnswerLogData = [
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "France",
    correct: true,
    acceptedAnswer: "France",
    askedAt: "2026-07-19T12:07:00.000Z",
  },
  {
    cardId: "cc:tokyo-japan:object",
    question: "What country is Tokyo in?",
    input: "Japan",
    correct: true,
    acceptedAnswer: "Japan",
    askedAt: "2026-07-19T12:06:00.000Z",
  },
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "Spain",
    correct: false,
    acceptedAnswer: "France",
    askedAt: "2026-07-19T12:05:00.000Z",
  },
  {
    cardId: "cc:lima-peru:object",
    question: "What country is Lima in?",
    input: "",
    correct: false,
    acceptedAnswer: "Peru",
    askedAt: "2026-07-19T12:04:00.000Z",
  },
  {
    cardId: "cc:cairo-egypt:object",
    question: "What country is Cairo in?",
    input: "Egypt",
    correct: true,
    acceptedAnswer: "Egypt",
    askedAt: "2026-07-19T12:03:00.000Z",
  },
  {
    cardId: "cc:oslo-norway:object",
    question: "What country is Oslo in?",
    input: "   ",
    correct: false,
    acceptedAnswer: "Norway",
    askedAt: "2026-07-19T12:02:00.000Z",
  },
  {
    cardId: "cc:ottawa-canada:object",
    question: "What country is Ottawa in?",
    input: "Chile",
    correct: false,
    acceptedAnswer: "Canada",
    askedAt: "2026-07-19T12:01:00.000Z",
  },
  {
    cardId: "cc:bern-switzerland:object",
    question: "What country is Bern in?",
    input: "Switzerland",
    correct: true,
    acceptedAnswer: "Switzerland",
    askedAt: "2026-07-15T09:00:00.000Z",
  },
];

describe("AnswerLog summary — outcome pie", () => {
  it("splits the whole log three ways, with a count and a share for each outcome", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    expect(chart).toHaveTextContent(/Correct\s*4\s*\(50\.0%\)/);
    expect(chart).toHaveTextContent(/Incorrect\s*2\s*\(25\.0%\)/);
    expect(chart).toHaveTextContent(/Skip\s*2\s*\(25\.0%\)/);
  });
});

describe("AnswerLog summary — absolute accuracy", () => {
  it("reports the pie's correct share against every answer, skips included", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    expect(chart).toHaveTextContent("50.0%");
    expect(chart).toHaveTextContent(/correct of all 8 answers/i);
  });

  it("never labels an accuracy figure without its denominator", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /outcomes/i });
    // "Accuracy" resolves to two different numbers here (ADR-0004), so the bare
    // word must never stand next to a percentage anywhere in the summary.
    for (const node of screen.getAllByText(/accuracy/i)) {
      expect(node.textContent ?? "").toMatch(/absolute|attempted/i);
    }
  });
});

describe("AnswerLog summary — totals", () => {
  it("reports attempts, attempted accuracy, distinct cards and the first answer date", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const totals = await screen.findByRole("table", { name: /totals/i });
    // 8 answers less 2 skips.
    expect(totals).toHaveTextContent(/Questions attempted\s*6/);
    // 4 correct of those 6 attempted — not 4 of 8, which the pie carries.
    expect(totals).toHaveTextContent(/Attempted accuracy\s*66\.7%/);
    expect(totals).toHaveTextContent(/correct of 6 attempted/i);
    // Paris was answered twice, so 8 answers over 7 distinct cards.
    expect(totals).toHaveTextContent(/Distinct cards seen\s*7/);
    expect(totals).toHaveTextContent(/First answer\s*July 15, 2026/);
  });
});

/** The drawn wedges of the outcome pie, in document order. */
function wedges(): Element[] {
  return Array.from(document.querySelectorAll("[data-outcome]"));
}

describe("AnswerLog summary — the pie", () => {
  it("draws one wedge per outcome that occurred", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /outcomes/i });
    expect(wedges().map((w) => w.getAttribute("data-outcome"))).toEqual([
      "correct",
      "incorrect",
      "skip",
    ]);
  });

  it("omits an outcome nobody hit rather than drawing a zero-width sliver", async () => {
    stubFetch(mixedLog.filter((a) => a.input.trim() !== ""));
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /outcomes/i });
    expect(wedges().map((w) => w.getAttribute("data-outcome"))).toEqual(["correct", "incorrect"]);
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
  });

  it("draws a whole circle when every answer shares one outcome", async () => {
    stubFetch([mixedLog[1] as (typeof mixedLog)[number]]);
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /outcomes/i });
    const drawn = wedges();
    expect(drawn).toHaveLength(1);
    // Not the path geometry, but the element kind: a 360° arc collapses to a
    // point, so the whole-pie case has to be a circle to be drawn at all.
    expect(drawn[0]?.tagName.toLowerCase()).toBe("circle");
  });
});

describe("AnswerLog summary — edge cases", () => {
  it("counts an answer graded correct with empty input as correct, not as a skip", async () => {
    // No blank answer has ever been graded correct in real data, which is
    // exactly why this must not be baked in as an invariant.
    stubFetch([
      {
        cardId: "cc:tokyo-japan:object",
        question: "What country is Tokyo in?",
        input: "",
        correct: true,
        acceptedAnswer: "Japan",
        askedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    expect(chart).toHaveTextContent(/Correct\s*1\s*\(100\.0%\)/);
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();

    const totals = await screen.findByRole("table", { name: /totals/i });
    expect(totals).toHaveTextContent(/Questions attempted\s*1/);
    expect(totals).toHaveTextContent(/Attempted accuracy\s*100\.0%/);
  });

  it("gives attempted accuracy an explicit no-value when every answer is a skip", async () => {
    stubFetch(
      ["2026-07-19T12:01:00.000Z", "2026-07-19T12:00:00.000Z"].map((askedAt) => ({
        cardId: `cc:lima-peru:object@${askedAt}`,
        question: "What country is Lima in?",
        input: "  ",
        correct: false,
        acceptedAnswer: "Peru",
        askedAt,
      })),
    );
    render(<AnswerLog />);

    const totals = await screen.findByRole("table", { name: /totals/i });
    const accuracyRow = within(totals).getByRole("row", { name: /attempted accuracy/i });
    expect(accuracyRow).toHaveTextContent("—");
    expect(accuracyRow).not.toHaveTextContent("NaN");
    expect(accuracyRow).not.toHaveTextContent("0%");
    expect(within(totals).getByRole("row", { name: /questions attempted/i })).toHaveTextContent(
      /Questions attempted\s*0/,
    );
  });

  it("rounds the outcome shares so they still account for the whole log", async () => {
    // A third each: the shares cannot all round to one decimal and still sum.
    stubFetch([mixedLog[0], mixedLog[2], mixedLog[3]] as AnswerLogData);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    const shares = [...(chart.textContent ?? "").matchAll(/\((\d+\.\d)%\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it("shows no summary when the log is empty", async () => {
    stubFetch([]);
    render(<AnswerLog />);

    expect(await screen.findByText(/no answers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /outcomes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /totals/i })).not.toBeInTheDocument();
  });

  it("shows no summary when the log fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<AnswerLog />);

    expect(await screen.findByText(/couldn’t load your answers/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /outcomes/i })).not.toBeInTheDocument();
  });
});

describe("AnswerLog summary — placement and accessibility", () => {
  it("renders the summary above the raw table, which is left intact", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    const table = screen.getByRole("table", { name: /your answers/i });
    expect(chart.compareDocumentPosition(table)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The table still holds every answer: one header row plus eight.
    expect(await answerRows()).toHaveLength(9);
  });

  it("exposes every chart value as text rather than as picture alone", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    const keys = within(chart)
      .getAllByRole("listitem")
      .map((item) => (item.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(keys).toEqual(["Correct 4 (50.0%)", "Incorrect 2 (25.0%)", "Skip 2 (25.0%)"]);
  });
});

describe("AnswerLog summary — against the live-data figures from #233", () => {
  it("reproduces the 42.6% / 65.1% split the spec measured", async () => {
    // The proportions recorded on issue #233 from real `dev` data: 476 answers,
    // 203 correct, 109 incorrect with input, 164 blank. The percentages below
    // are the spec's own numbers, not ones recomputed here.
    const answer = (i: number, correct: boolean, input: string) => ({
      cardId: `cc:card-${i}:object`,
      question: `Question ${i}`,
      input,
      correct,
      askedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    });
    const live: AnswerLogData = [
      ...Array.from({ length: 203 }, (_, i) => answer(i, true, "a guess")),
      ...Array.from({ length: 109 }, (_, i) => answer(203 + i, false, "a guess")),
      ...Array.from({ length: 164 }, (_, i) => answer(312 + i, false, "")),
    ];
    stubFetch(live);
    render(<AnswerLog />);

    const chart = await screen.findByRole("group", { name: /outcomes/i });
    expect(chart).toHaveTextContent(/Correct\s*203\s*\(42\.6%\)/);
    expect(chart).toHaveTextContent(/Incorrect\s*109\s*\(22\.9%\)/);
    expect(chart).toHaveTextContent(/Skip\s*164\s*\(34\.5%\)/);
    expect(chart).toHaveTextContent(/correct of all 476 answers/i);

    const totals = await screen.findByRole("table", { name: /totals/i });
    expect(totals).toHaveTextContent(/Questions attempted\s*312/);
    expect(totals).toHaveTextContent(/Attempted accuracy\s*65\.1%/);
  });
});
