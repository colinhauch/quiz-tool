import type { QuestionResponse } from "@geo/contract";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const question: QuestionResponse = {
  cardId: "cc:tokyo-japan:object",
  prompt: "What country is Tokyo in?",
  input: "text",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the app shell", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => question }));
    render(<App />);
    expect(screen.getByRole("heading", { name: /geography quiz/i })).toBeInTheDocument();
    // Let the in-flight fetch settle so its state update stays inside act().
    await screen.findByText(question.prompt);
  });

  it("fetches a question and displays its prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => question });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("What country is Tokyo in?")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/question");
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<App />);

    expect(await screen.findByText(/couldn’t load a question/i)).toBeInTheDocument();
  });

  it("shows a loading state until the question arrives", async () => {
    let resolve: ((q: QuestionResponse) => void) | undefined;
    const pending = new Promise<QuestionResponse>((r) => {
      resolve = r;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => pending }));

    render(<App />);
    expect(screen.getByText(/loading a question/i)).toBeInTheDocument();

    resolve?.(question);
    await waitFor(() =>
      expect(screen.getByText("What country is Tokyo in?")).toBeInTheDocument(),
    );
  });
});
