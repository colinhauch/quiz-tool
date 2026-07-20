import type { AnswerResponse, QuestionResponse } from "@geo/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Quiz } from "./Quiz.js";

const tokyo: QuestionResponse = {
  cardId: "cc:tokyo-japan:object",
  prompt: "What country is Tokyo in?",
  input: "text",
};
const paris: QuestionResponse = {
  cardId: "cc:paris-france:object",
  prompt: "What country is Paris in?",
  input: "text",
};

/**
 * A fetch stub that serves a queue of questions on GET /api/question and a
 * fixed result on POST /api/answer. Returns the last question when the queue
 * runs dry, so repeated "Next" clicks stay defined.
 */
function stubFetch(questions: QuestionResponse[], result: AnswerResponse) {
  const queue = [...questions];
  const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
    if (url === "/api/answer" && init?.method === "POST") {
      return Promise.resolve({ json: async () => result });
    }
    const next = queue.shift() ?? questions[questions.length - 1];
    return Promise.resolve({ json: async () => next });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Quiz", () => {
  it("renders the fetched prompt", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
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
});
