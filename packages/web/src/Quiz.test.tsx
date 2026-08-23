import type { AnswerResponse, EntitySummary, QuestionResponse } from "@geo/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Quiz } from "./Quiz.js";
import { clearSuggestionCache } from "./suggestions.js";

const tokyo: QuestionResponse = {
  cardId: "cc:tokyo-japan:object",
  prompt: "What country is Tokyo in?",
  input: "text",
  packId: "core-cities",
  packLabel: "Cities & Countries",
  answerTypes: ["country"],
};
const paris: QuestionResponse = {
  cardId: "cc:paris-france:object",
  prompt: "What country is Paris in?",
  input: "text",
  packId: "continental-countries",
  packLabel: "Continents & Countries",
  answerTypes: ["country"],
};

const countries: EntitySummary[] = [
  { id: "Q17", label: "Japan", aliases: [] },
  { id: "Q148", label: "China", aliases: [] },
  { id: "Q142", label: "France", aliases: [] },
];

/**
 * A fetch stub that serves a queue of questions on GET /api/question, the
 * suggestion entities on GET /api/entities, and a fixed result on POST
 * /api/answer. Returns the last question when the queue runs dry, so repeated
 * "Next" clicks stay defined.
 */
function stubFetch(
  questions: QuestionResponse[],
  result: AnswerResponse,
  entities: EntitySummary[] = countries,
) {
  const queue = [...questions];
  const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
    if (url === "/api/answer" && init?.method === "POST") {
      return Promise.resolve({ json: async () => result });
    }
    if (url.startsWith("/api/entities")) {
      return Promise.resolve({ json: async () => entities });
    }
    const next = queue.shift() ?? questions[questions.length - 1];
    return Promise.resolve({ json: async () => next });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  clearSuggestionCache();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Quiz", () => {
  it("renders the fetched prompt", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  // #40: the eyebrow reads the label the server resolved. It used to be derived
  // from the cardId prefix here, which both packs below share — `paris` is the
  // case that was mislabelled.
  it("shows the pack label the server sent, not one derived from the cardId", async () => {
    stubFetch([paris], { correct: true, acceptedAnswer: "France" });
    render(<Quiz />);
    expect(await screen.findByText("Continents & Countries")).toBeInTheDocument();
    expect(screen.queryByText("Cities & Countries")).not.toBeInTheDocument();
  });

  it("shows an error message when the question fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<Quiz />);
    expect(await screen.findByText(/couldn’t reach the quiz/i)).toBeInTheDocument();
  });

  it("submits a typed answer and shows correct feedback", async () => {
    const fetchMock = stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Correct! The answer is Japan.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/answer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cardId: tokyo.cardId, input: "Japan" }),
      }),
    );
  });

  it("shows incorrect feedback with the accepted answer", async () => {
    stubFetch([tokyo], { correct: false, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "China" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Incorrect. The answer is Japan.");
  });

  it("fetches a fresh question after answering", async () => {
    stubFetch([tokyo, paris], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next question/i }));

    expect(await screen.findByText("What country is Paris in?")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("suggests entities of the answer's type as the learner types", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "jap" } });

    const option = await screen.findByRole("option", { name: "Japan" });
    expect(option).toBeInTheDocument();
    // Scoped to what was typed — a non-matching country is not offered.
    expect(screen.queryByRole("option", { name: "France" })).not.toBeInTheDocument();
  });

  it("fills the box with the canonical label on selection, without submitting", async () => {
    const fetchMock = stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    const box = (await screen.findByLabelText(/your answer/i)) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "jap" } });
    await screen.findByRole("option", { name: "Japan" });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Japan" }));

    expect(box.value).toBe("Japan");
    // Filling is not answering: no verdict yet, and no POST /answer fired.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/answer", expect.anything());
    // The list closes once a suggestion is taken.
    expect(screen.queryByRole("option", { name: "Japan" })).not.toBeInTheDocument();
  });

  it("still submits a free-text answer that is not in the suggestion list", async () => {
    const fetchMock = stubFetch([tokyo], { correct: false, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Nippon" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Incorrect. The answer is Japan.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/answer",
      expect.objectContaining({ body: JSON.stringify({ cardId: tokyo.cardId, input: "Nippon" }) }),
    );
  });

  it("defaults the autocomplete toggle on", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);
    expect(await screen.findByRole("checkbox", { name: /autocomplete/i })).toBeChecked();
  });

  it("shows no suggestions and fetches no entities when the toggle is off", async () => {
    const fetchMock = stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /autocomplete/i }));
    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "jap" } });

    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "Japan" })).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/entities"),
      expect.anything(),
    );
  });

  it("still answers normally with the toggle off", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /autocomplete/i }));
    fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Correct! The answer is Japan.");
  });

  it("persists the toggle choice across remounts", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    const first = render(<Quiz />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /autocomplete/i }));
    first.unmount();

    render(<Quiz />);
    expect(await screen.findByRole("checkbox", { name: /autocomplete/i })).not.toBeChecked();
  });
});
