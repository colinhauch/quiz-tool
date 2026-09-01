import type { AnswerResponse, EntitySummary, QuestionResponse, VisualAid } from "@geo/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSignedInSource } from "./auth.js";
import { DEFAULT_QUESTION_COMMENT } from "./QuestionFeedback.js";
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
  // acceptedAnswers defaults to [acceptedAnswer] so single-answer tests stay terse;
  // the transcontinental test passes the full list explicitly.
  result: Omit<AnswerResponse, "acceptedAnswers"> & { acceptedAnswers?: string[] },
  entities: EntitySummary[] = countries,
) {
  const answerResult: AnswerResponse = {
    ...result,
    acceptedAnswers: result.acceptedAnswers ?? [result.acceptedAnswer],
  };
  const queue = [...questions];
  const fetchMock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    if (url === "/api/answer" && init?.method === "POST") {
      return Promise.resolve({ json: async () => answerResult });
    }
    // The per-question feedback control posts here; `ok` is what submitFeedback checks.
    if (url === "/api/feedback" && init?.method === "POST") {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
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

/** The bodies the component POSTed to /api/feedback, in order. */
function feedbackPosts(fetchMock: ReturnType<typeof stubFetch>): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/feedback")
    .map(([, init]) => JSON.parse((init as { body: string }).body));
}

/** Forces `useWideLayout`'s breakpoint query on/off (jsdom has no matchMedia
 *  by default, so the hook falls back to narrow when unstubbed). */
function stubWideLayout(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: wide,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

beforeEach(() => {
  // The quiz card's feedback control checks for itself that someone is signed in.
  setSignedInSource(() => true);
});

afterEach(() => {
  setSignedInSource(() => false);
  clearSuggestionCache();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Incorrect. The answer is Japan.");
  });

  it("lists every accepted answer for a transcontinental card", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Asia", acceptedAnswers: ["Asia", "Europe"] });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Asia" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Correct! The answer is Asia or Europe.");
  });

  it("fetches a fresh question after answering", async () => {
    stubFetch([tokyo, paris], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: "Japan" }));

    expect(box.value).toBe("Japan");
    // Filling is not answering: no verdict yet, and no POST /answer fired.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/answer", expect.anything());
    // The list closes once a suggestion is taken.
    expect(screen.queryByRole("option", { name: "Japan" })).not.toBeInTheDocument();
  });

  it("fills a suggestion's short autocomplete form, not its verbose label", async () => {
    const currencyQ: QuestionResponse = {
      cardId: "cur:united-states:us-dollar:object",
      prompt: "What currency does the United States use?",
      input: "text",
      packId: "currencies",
      packLabel: "Currencies",
      answerTypes: ["currency"],
    };
    const usd: EntitySummary = {
      id: "Q4917",
      label: "United States dollar",
      aliases: ["dollar", "dollars", "USD"],
      autocomplete: "dollar",
    };
    stubFetch([currencyQ], { correct: true, acceptedAnswer: "United States dollar" }, [usd]);
    render(<Quiz />);

    const box = (await screen.findByLabelText(/your answer/i)) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "doll" } });
    // The row shows the short form, not "United States dollar".
    const option = await screen.findByRole("button", { name: "dollar" });
    fireEvent.click(option);
    expect(box.value).toBe("dollar");
  });

  it("selects a keyboard-focused suggestion on Enter, then focus lands on Submit", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    const box = (await screen.findByLabelText(/your answer/i)) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "jap" } });
    // Tab-navigating to the option focuses its button; Enter on a focused button
    // fires a click (never mousedown), which must select it.
    const option = await screen.findByRole("button", { name: "Japan" });
    fireEvent.click(option); // Enter on a focused <button> dispatches click

    expect(box.value).toBe("Japan");
    // A keyboard learner's next Enter should submit, so focus moves to Submit.
    expect(screen.getByRole("button", { name: /^submit$/i })).toHaveFocus();
  });

  it("still submits a free-text answer that is not in the suggestion list", async () => {
    const fetchMock = stubFetch([tokyo], { correct: false, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Nippon" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Incorrect. The answer is Japan.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/answer",
      expect.objectContaining({ body: JSON.stringify({ cardId: tokyo.cardId, input: "Nippon" }) }),
    );
  });

  it("shows the reveal map when the answer carries a revealVisual", async () => {
    stubFetch([tokyo], {
      correct: true,
      acceptedAnswer: "Japan",
      revealVisual: { kind: "map", entityId: "Q1490", lat: 35.6895, lon: 139.6917, label: "Tokyo" },
    });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await screen.findByRole("status");
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("shows no map when the answer carries no revealVisual", async () => {
    stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await screen.findByRole("status");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // #111: layout/presence-state coverage for the visual-aid slots. v1 never
  // produces a promptVisual — these stubs exist only to prove the layout
  // (container collapses when empty, both slots can render together) holds
  // up for future card kinds. Never ship a stub descriptor like this outside
  // a test.
  const stubMap = (label: string): VisualAid => ({
    kind: "map",
    entityId: "Q999",
    lat: 1,
    lon: 2,
    label,
  });

  describe("visual-aid presence states", () => {
    it("reserves no space for either slot when neither the prompt nor the answer carries a visual", async () => {
      stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
      const { container } = render(<Quiz />);

      fireEvent.change(await screen.findByLabelText(/your answer/i), {
        target: { value: "Japan" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      await screen.findByRole("status");

      expect(container.querySelectorAll(".visual-aid")).toHaveLength(0);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows only the reveal map when just the answer carries a visual (the v1 case)", async () => {
      stubFetch([tokyo], {
        correct: true,
        acceptedAnswer: "Japan",
        revealVisual: stubMap("Tokyo"),
      });
      const { container } = render(<Quiz />);

      fireEvent.change(await screen.findByLabelText(/your answer/i), {
        target: { value: "Japan" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      await screen.findByRole("status");

      expect(container.querySelectorAll(".visual-aid")).toHaveLength(1);
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });

    it("shows only the prompt map while asking when just the question carries a visual", async () => {
      const withPromptVisual: QuestionResponse = { ...tokyo, promptVisual: stubMap("Japan") };
      stubFetch([withPromptVisual], { correct: true, acceptedAnswer: "Japan" });
      const { container } = render(<Quiz />);

      await screen.findByText("What country is Tokyo in?");

      expect(container.querySelectorAll(".visual-aid")).toHaveLength(1);
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });

    it("shows both the prompt and reveal maps once answered when both carry a visual", async () => {
      const withPromptVisual: QuestionResponse = { ...tokyo, promptVisual: stubMap("Japan") };
      stubFetch([withPromptVisual], {
        correct: true,
        acceptedAnswer: "Japan",
        revealVisual: stubMap("Tokyo"),
      });
      const { container } = render(<Quiz />);

      fireEvent.change(await screen.findByLabelText(/your answer/i), {
        target: { value: "Japan" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      await screen.findByRole("status");

      expect(container.querySelectorAll(".visual-aid")).toHaveLength(2);
      expect(screen.getAllByRole("img")).toHaveLength(2);
    });
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
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

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

  it("offers the per-question feedback control before answering, with a pre-answer snapshot", async () => {
    const fetchMock = stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.click(await screen.findByRole("button", { name: /submit feedback about this question/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(feedbackPosts(fetchMock)).toHaveLength(1));
    expect(feedbackPosts(fetchMock)[0]).toEqual({
      kind: "question",
      card_id: tokyo.cardId,
      comment: DEFAULT_QUESTION_COMMENT,
      // No input or acceptedAnswers: the question has not been answered yet.
      context: {
        prompt: tokyo.prompt,
        packId: tokyo.packId,
        packLabel: tokyo.packLabel,
        answered: false,
      },
    });
  });

  it("offers the control after answering too, with what the learner typed and the accepted answers", async () => {
    const fetchMock = stubFetch([tokyo], { correct: false, acceptedAnswer: "Japan" });
    render(<Quiz />);

    fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Chian" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
    await screen.findByText(/the answer is japan/i);

    fireEvent.click(screen.getByRole("button", { name: /submit feedback about this question/i }));
    fireEvent.change(screen.getByLabelText(/feedback about this question/i), {
      target: { value: "Chian should count as a typo." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(feedbackPosts(fetchMock)).toHaveLength(1));
    expect(feedbackPosts(fetchMock)[0]).toEqual({
      kind: "question",
      card_id: tokyo.cardId,
      comment: "Chian should count as a typo.",
      context: {
        prompt: tokyo.prompt,
        packId: tokyo.packId,
        packLabel: tokyo.packLabel,
        answered: true,
        input: "Chian",
        acceptedAnswers: ["Japan"],
      },
    });
  });

  // #187: above the desktop breakpoint the card becomes question panel +
  // media panel, with a permanent map slot. Below it — the default in these
  // tests, per stubWideLayout's absence — nothing here changes; that's the
  // suite above.
  describe("wide layout (#187)", () => {
    beforeEach(() => stubWideLayout(true));

    it("reserves the image slot empty and the map slot as a world view while asking, when the question carries neither", async () => {
      stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
      const { container } = render(<Quiz />);

      await screen.findByText("What country is Tokyo in?");

      expect(container.querySelector(".mpanel__image")).toBeInTheDocument();
      expect(container.querySelector(".mpanel__image .visual-aid")).not.toBeInTheDocument();
      // The map is permanent: it renders even though this question has none.
      const map = container.querySelector(".mpanel__map svg");
      expect(map).toBeInTheDocument();
      expect(map).toHaveAttribute("aria-label", "World map");
    });

    it("shows the question image big in the image slot when the question carries one", async () => {
      const flagQuestion: QuestionResponse = {
        ...tokyo,
        promptVisual: { kind: "image", src: "/flags/jp.svg", alt: "Flag of a country" },
      };
      stubFetch([flagQuestion], { correct: true, acceptedAnswer: "Japan" });
      const { container } = render(<Quiz />);

      await screen.findByText("What country is Tokyo in?");

      const img = container.querySelector(".mpanel__image img");
      expect(img).toHaveAttribute("src", "/flags/jp.svg");
    });

    it("keeps the map at world scale (no pin) while asking, then pins and zooms once answered", async () => {
      stubFetch([tokyo], {
        correct: true,
        acceptedAnswer: "Japan",
        revealVisual: {
          kind: "map",
          entityId: "Q1490",
          lat: 35.6895,
          lon: 139.6917,
          label: "Tokyo",
        },
      });
      const { container } = render(<Quiz />);

      await screen.findByText("What country is Tokyo in?");
      expect(container.querySelector(".mpanel__map circle")).not.toBeInTheDocument();

      fireEvent.change(await screen.findByLabelText(/your answer/i), { target: { value: "Japan" } });
      fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
      await screen.findByRole("status");

      expect(container.querySelector(".mpanel__map circle")).toBeInTheDocument();
      expect(container.querySelector(".mpanel__map svg")).toHaveAttribute(
        "aria-label",
        "Map showing the location of Tokyo",
      );
    });

    it("anchors the same button below the fixed slot across asking and answered, relabelled but not moved", async () => {
      stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
      render(<Quiz />);

      const submitButton = await screen.findByRole("button", { name: /^submit$/i });
      fireEvent.change(screen.getByLabelText(/your answer/i), { target: { value: "Japan" } });
      fireEvent.click(submitButton);

      const nextButton = await screen.findByRole("button", { name: /next question/i });
      // Same DOM node relabelled, not a different button appended elsewhere.
      expect(nextButton).toBe(submitButton);
    });

    it("focuses the anchored button after picking a suggestion", async () => {
      stubFetch([tokyo], { correct: true, acceptedAnswer: "Japan" });
      render(<Quiz />);

      const box = (await screen.findByLabelText(/your answer/i)) as HTMLInputElement;
      fireEvent.change(box, { target: { value: "jap" } });
      await screen.findByRole("option", { name: "Japan" });
      fireEvent.click(screen.getByRole("button", { name: "Japan" }));

      expect(box.value).toBe("Japan");
      expect(screen.getByRole("button", { name: /^submit$/i })).toHaveFocus();
    });

    it("does not move the question panel when switching between flag, map, and neither", async () => {
      const flagQuestion: QuestionResponse = {
        ...tokyo,
        promptVisual: { kind: "image", src: "/flags/jp.svg", alt: "Flag of a country" },
      };
      const mapAnswer = {
        correct: true,
        acceptedAnswer: "Japan",
        revealVisual: { kind: "map" as const, entityId: "Q1490", lat: 1, lon: 2, label: "Tokyo" },
      };
      stubFetch([flagQuestion, paris, tokyo], mapAnswer);
      const { container } = render(<Quiz />);

      for (const expectedPrompt of [
        "What country is Tokyo in?", // flagQuestion
        "What country is Paris in?", // no visuals
        "What country is Tokyo in?", // tokyo again
      ]) {
        await screen.findByText(expectedPrompt);
        // The two reserved slots are always present, whatever this question has.
        expect(container.querySelector(".mpanel__image")).toBeInTheDocument();
        expect(container.querySelector(".mpanel__map svg")).toBeInTheDocument();
        expect(container.querySelector(".qpanel")).toBeInTheDocument();

        const submitBtn = screen.getByRole("button", { name: /^submit$/i });
        fireEvent.click(submitBtn);
        await screen.findByRole("button", { name: /next question/i });
        fireEvent.click(screen.getByRole("button", { name: /next question/i }));
      }
      // Let the last "Next" click's question load settle before the test ends.
      await screen.findByRole("button", { name: /^submit$/i });
    });
  });
});
