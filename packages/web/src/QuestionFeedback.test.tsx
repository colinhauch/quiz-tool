import type { FeedbackContext } from "@geo/contract";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSignedInSource } from "./auth.js";
import { DEFAULT_QUESTION_COMMENT, QuestionFeedback } from "./QuestionFeedback.js";

/** Records every POSTed body so a submission can be asserted on (see Feedback.test.tsx). */
function stubFetch(ok = true) {
  const posts: unknown[] = [];
  const fetchMock = vi.fn((_url: string, init?: { method?: string; body?: string }) => {
    posts.push(JSON.parse(init?.body ?? "{}"));
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return posts;
}

const asking: FeedbackContext = {
  prompt: "What country is Tokyo in?",
  packId: "core-cities",
  packLabel: "Cities & Countries",
  answered: false,
};
const answered: FeedbackContext = {
  ...asking,
  answered: true,
  input: "Chian",
  acceptedAnswers: ["Japan"],
};

const open = () => fireEvent.click(screen.getByRole("button", { name: /submit feedback about this question/i }));
const send = () => fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

beforeEach(() => {
  setSignedInSource(() => true);
});

afterEach(() => {
  setSignedInSource(() => false);
  vi.restoreAllMocks();
});

describe("QuestionFeedback", () => {
  it("opens an inline box whose placeholder holds the default sentence", () => {
    stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    expect(screen.queryByLabelText(/feedback about this question/i)).toBeNull();

    open();
    expect(screen.getByLabelText(/feedback about this question/i)).toHaveAttribute(
      "placeholder",
      DEFAULT_QUESTION_COMMENT,
    );
  });

  it("submits the default sentence when the box is left empty", async () => {
    const posts = stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    send();

    expect(await screen.findByRole("status")).toHaveTextContent(/thanks/i);
    expect(posts).toEqual([
      {
        kind: "question",
        card_id: "cc:tokyo-japan:object",
        comment: DEFAULT_QUESTION_COMMENT,
        context: asking,
      },
    ]);
  });

  it("submits the learner's text when they type one, trimmed", async () => {
    const posts = stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    fireEvent.change(screen.getByLabelText(/feedback about this question/i), {
      target: { value: "  The prompt is ambiguous.  " },
    });
    send();

    await screen.findByRole("status");
    expect(posts).toEqual([
      {
        kind: "question",
        card_id: "cc:tokyo-japan:object",
        comment: "The prompt is ambiguous.",
        context: asking,
      },
    ]);
  });

  it("carries the post-answer context when the question has been answered", async () => {
    const posts = stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={answered} />);
    open();
    send();

    await screen.findByRole("status");
    expect(posts).toEqual([
      expect.objectContaining({ context: answered }),
    ]);
  });

  it("closes the box on success so the learner can keep answering", async () => {
    stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    fireEvent.change(screen.getByLabelText(/feedback about this question/i), {
      target: { value: "typed" },
    });
    send();

    await screen.findByRole("status");
    expect(screen.queryByLabelText(/feedback about this question/i)).toBeNull();

    // Reopening starts from a clean box, not the last submission's text.
    open();
    expect(screen.getByLabelText(/feedback about this question/i)).toHaveValue("");
  });

  it("reports a failed submission instead of confirming it", async () => {
    stubFetch(false);
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    send();

    expect(await screen.findByRole("status")).toHaveTextContent(/couldn’t send/i);
    // The box stays open so the learner does not lose what they wrote.
    expect(screen.getByLabelText(/feedback about this question/i)).not.toBeNull();
  });

  it("refuses a signed-out submission locally instead of posting it", async () => {
    const posts = stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} isSignedIn={false} />);
    open();
    send();

    expect(await screen.findByRole("status")).toHaveTextContent(/sign in to send feedback/i);
    expect(posts).toEqual([]);
  });

  // The gate on the app as a whole is about to loosen for anonymous play, so
  // this surface has to read the sign-in state itself rather than assume it.
  it("reads the sign-in state from the auth boundary when no prop is given", async () => {
    setSignedInSource(() => false);
    const posts = stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    send();

    expect(await screen.findByRole("status")).toHaveTextContent(/sign in to send feedback/i);
    expect(posts).toEqual([]);
  });

  it("abandons the draft when the learner cancels", () => {
    stubFetch();
    render(<QuestionFeedback cardId="cc:tokyo-japan:object" context={asking} />);
    open();
    fireEvent.change(screen.getByLabelText(/feedback about this question/i), {
      target: { value: "never mind" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText(/feedback about this question/i)).toBeNull();
    open();
    expect(screen.getByLabelText(/feedback about this question/i)).toHaveValue("");
  });
});
