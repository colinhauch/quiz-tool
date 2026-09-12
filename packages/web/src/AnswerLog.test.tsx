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
// By pack: 4 Capital Cities (50.0%), 2 Core Cities (25.0%), 2 Flags (25.0%).
const mixedLog: AnswerLogData = [
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "France",
    correct: true,
    acceptedAnswer: "France",
    packId: "capital-cities",
    packLabel: "Capital Cities",
    askedAt: "2026-07-19T12:07:00.000Z",
  },
  {
    cardId: "cc:tokyo-japan:object",
    question: "What country is Tokyo in?",
    input: "Japan",
    correct: true,
    acceptedAnswer: "Japan",
    packId: "capital-cities",
    packLabel: "Capital Cities",
    askedAt: "2026-07-19T12:06:00.000Z",
  },
  {
    cardId: "cc:paris-france:object",
    question: "What country is Paris in?",
    input: "Spain",
    correct: false,
    acceptedAnswer: "France",
    packId: "capital-cities",
    packLabel: "Capital Cities",
    askedAt: "2026-07-19T12:05:00.000Z",
  },
  {
    cardId: "cc:lima-peru:object",
    question: "What country is Lima in?",
    input: "",
    correct: false,
    acceptedAnswer: "Peru",
    packId: "core-cities",
    packLabel: "Core Cities",
    askedAt: "2026-07-19T12:04:00.000Z",
  },
  {
    cardId: "cc:cairo-egypt:object",
    question: "What country is Cairo in?",
    input: "Egypt",
    correct: true,
    acceptedAnswer: "Egypt",
    packId: "core-cities",
    packLabel: "Core Cities",
    askedAt: "2026-07-19T12:03:00.000Z",
  },
  {
    cardId: "cc:oslo-norway:object",
    question: "What country is Oslo in?",
    input: "   ",
    correct: false,
    acceptedAnswer: "Norway",
    packId: "flags",
    packLabel: "Flags",
    askedAt: "2026-07-19T12:02:00.000Z",
  },
  {
    cardId: "cc:ottawa-canada:object",
    question: "What country is Ottawa in?",
    input: "Chile",
    correct: false,
    acceptedAnswer: "Canada",
    packId: "flags",
    packLabel: "Flags",
    askedAt: "2026-07-19T12:01:00.000Z",
  },
  {
    cardId: "cc:bern-switzerland:object",
    question: "What country is Bern in?",
    input: "Switzerland",
    correct: true,
    acceptedAnswer: "Switzerland",
    packId: "capital-cities",
    packLabel: "Capital Cities",
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

/** The drawn bands of the pack breakdown, in document order. */
function bands(): Element[] {
  return Array.from(document.querySelectorAll("[data-pack]"));
}

/** The breakdown's legend entries, flattened to the text a screen reader hears. */
async function packKeys() {
  const breakdown = await screen.findByRole("group", { name: /packs/i });
  return within(breakdown)
    .getAllByRole("listitem")
    .map((item) => (item.textContent ?? "").replace(/\s+/g, " ").trim());
}

/** The mixed log with every answer's pack attribution stripped off. */
const unattributedLog: AnswerLogData = mixedLog.map(
  ({ packId: _packId, packLabel: _packLabel, ...answer }) => answer,
);

describe("AnswerLog summary — pack breakdown", () => {
  it("splits the log by pack, most answers first, with a count and a share each", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    // Core Cities and Flags tie at 2; the label breaks the tie, so the order is
    // deterministic rather than whatever the log happened to arrive in.
    expect(await packKeys()).toEqual([
      "Capital Cities 4 (50.0%)",
      "Core Cities 2 (25.0%)",
      "Flags 2 (25.0%)",
    ]);
  });

  it("labels each pack by its name rather than its id", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const breakdown = await screen.findByRole("group", { name: /packs/i });
    expect(breakdown).toHaveTextContent("Capital Cities");
    expect(within(breakdown).queryByText(/capital-cities/)).not.toBeInTheDocument();
  });

  it("falls back to the pack id when the server had no name for the pack", async () => {
    // The two fields fail independently at the seam, so the client has to cope
    // with an attributed answer whose pack the graph could not name.
    stubFetch(mixedLog.map(({ packLabel: _packLabel, ...answer }) => answer));
    render(<AnswerLog />);

    expect(await packKeys()).toEqual([
      "capital-cities 4 (50.0%)",
      "core-cities 2 (25.0%)",
      "flags 2 (25.0%)",
    ]);
  });

  it("gives answers whose card no longer resolves their own labelled slice", async () => {
    stubFetch([...mixedLog.slice(0, 6), ...unattributedLog.slice(6)]);
    render(<AnswerLog />);

    // The unattributed slice ranks by magnitude like any other — dropping it
    // to the bottom would misreport how much of the log it accounts for — and
    // only loses ties to a named pack, here against nothing.
    expect(await packKeys()).toEqual([
      "Capital Cities 3 (37.5%)",
      "Core Cities 2 (25.0%)",
      "Card no longer in any pack 2 (25.0%)",
      "Flags 1 (12.5%)",
    ]);
  });

  it("accounts for a log nothing in which can be attributed", async () => {
    stubFetch(unattributedLog);
    render(<AnswerLog />);

    expect(await packKeys()).toEqual(["Card no longer in any pack 8 (100.0%)"]);
  });

  it("counts answers from a pack the learner has since deselected", async () => {
    // The Answer Log records what *was* asked and is never filtered when a pack
    // is deselected, so the breakdown cannot ask what is currently included.
    stubFetch(mixedLog);
    render(<AnswerLog />);

    expect(await packKeys()).toContain("Flags 2 (25.0%)");
  });

  it("draws one band per pack that occurred and none for a pack with no answers", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /packs/i });
    expect(bands().map((b) => b.getAttribute("data-pack"))).toEqual([
      "capital-cities",
      "core-cities",
      "flags",
    ]);
  });

  it("draws the unattributable answers as their own band", async () => {
    stubFetch([...mixedLog.slice(0, 7), ...unattributedLog.slice(7)]);
    render(<AnswerLog />);

    await screen.findByRole("group", { name: /packs/i });
    // No pack id can be empty (the contract requires one character), so the
    // empty string is the unambiguous handle for the unattributed band.
    expect(bands().map((b) => b.getAttribute("data-pack"))).toEqual([
      "capital-cities",
      "core-cities",
      "flags",
      "",
    ]);
  });

  it("stays readable at seven packs, one band and one legend entry each", async () => {
    const sevenPacks = ["capital-cities", "continental-countries", "core-cities", "currencies", "flags", "spoken-languages", "core-geo"];
    stubFetch(
      sevenPacks.flatMap((packId, p) =>
        // 1 answer from the first pack, 2 from the second, and so on, so no two
        // shares are equal and rounding has somewhere to go wrong.
        Array.from({ length: p + 1 }, (_, i) => ({
          cardId: `${packId}:card-${i}`,
          question: `Question ${p}-${i}`,
          input: "a guess",
          correct: true,
          packId,
          packLabel: packId,
          askedAt: new Date(Date.UTC(2026, 0, 1, p, i)).toISOString(),
        })),
      ),
    );
    render(<AnswerLog />);

    expect(await packKeys()).toHaveLength(7);
    expect(bands()).toHaveLength(7);
  });

  it("rounds the pack shares so they still account for the whole log", async () => {
    // Three packs a third each: the shares cannot all round to one decimal and
    // still sum, and with seven-plus packs the drift is worse than for outcomes.
    stubFetch([mixedLog[0], mixedLog[3], mixedLog[5]] as AnswerLogData);
    render(<AnswerLog />);

    const breakdown = await screen.findByRole("group", { name: /packs/i });
    const shares = [...(breakdown.textContent ?? "").matchAll(/\((\d+\.\d)%\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it("exposes every breakdown value as text rather than as picture alone", async () => {
    stubFetch(mixedLog);
    render(<AnswerLog />);

    const breakdown = await screen.findByRole("group", { name: /packs/i });
    // The bar is decorative: the legend already announces every value, and
    // saying each one twice helps nobody.
    const bar = breakdown.querySelector(".answer-summary__bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(await packKeys()).toEqual([
      "Capital Cities 4 (50.0%)",
      "Core Cities 2 (25.0%)",
      "Flags 2 (25.0%)",
    ]);
  });

  it("shows no breakdown when the log is empty", async () => {
    stubFetch([]);
    render(<AnswerLog />);

    expect(await screen.findByText(/no answers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /packs/i })).not.toBeInTheDocument();
  });
});
