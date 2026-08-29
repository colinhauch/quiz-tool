import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

/**
 * A fetch stub covering both views' calls: a question for the quiz, and a
 * one-entry log for the answer view. The shell just needs each view to mount
 * and reach its data — the views' own tests exercise their behavior.
 */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/answers") {
        return Promise.resolve({
          json: async () => [
            {
              cardId: "cc:tokyo-japan:object",
              question: "What country is Tokyo in?",
              input: "Japan",
              correct: true,
              askedAt: "t",
            },
          ],
        });
      }
      return Promise.resolve({
        json: async () => ({
          cardId: "cc:tokyo-japan:object",
          prompt: "What country is Tokyo in?",
          input: "text",
        }),
      });
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the title and starts on the quiz view", async () => {
    stubFetch();
    render(<App />);
    expect(screen.getByRole("heading", { name: /geography quiz/i })).toBeInTheDocument();
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("navigates to the answer log and back to the quiz", async () => {
    stubFetch();
    render(<App />);
    await screen.findByText("What country is Tokyo in?");

    fireEvent.click(screen.getByRole("button", { name: /my answers/i }));
    expect(
      await screen.findByRole("cell", { name: "What country is Tokyo in?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^quiz$/i }));
    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
  });

  it("navigates to the feedback view", async () => {
    stubFetch();
    render(<App />);
    await screen.findByText("What country is Tokyo in?");

    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
    expect(await screen.findByLabelText(/your feedback/i)).toBeInTheDocument();
  });
});
