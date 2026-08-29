import { describe, expect, it } from "vitest";
import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  feedbackRequestSchema,
  healthSchema,
  questionResponseSchema,
} from "./index.js";

describe("contract", () => {
  it("validates a well-formed health payload", () => {
    expect(healthSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("rejects a malformed health payload", () => {
    expect(healthSchema.safeParse({ status: "down" }).success).toBe(false);
  });
});

describe("questionResponseSchema", () => {
  const question = {
    cardId: "S1:object",
    prompt: "What country is Tokyo in?",
    input: "text",
    packId: "core-cities",
    packLabel: "Cities & Countries",
  };

  it("validates a well-formed rendered question", () => {
    expect(questionResponseSchema.parse(question)).toEqual(question);
  });

  // Provenance is not optional on the seam: a question with no pack behind it
  // would render a blank eyebrow rather than fail, which is how the mislabelling
  // in #40 stayed invisible.
  it("rejects a question missing its pack", () => {
    const { packId: _packId, ...withoutPack } = question;
    expect(questionResponseSchema.safeParse(withoutPack).success).toBe(false);
    expect(questionResponseSchema.safeParse({ ...question, packLabel: "" }).success).toBe(false);
  });

  it("rejects an empty prompt", () => {
    expect(questionResponseSchema.safeParse({ ...question, prompt: "" }).success).toBe(false);
  });

  it("rejects a non-text input mode", () => {
    expect(questionResponseSchema.safeParse({ ...question, input: "multiple_choice" }).success).toBe(
      false,
    );
  });

  it("rejects a leaked answer field", () => {
    expect(questionResponseSchema.safeParse({ ...question, answer: "Japan" }).success).toBe(false);
  });
});

describe("answerRequestSchema", () => {
  it("validates a well-formed request", () => {
    const req = { cardId: "cc:tokyo-japan:object", input: "Japan" };
    expect(answerRequestSchema.parse(req)).toEqual(req);
  });

  it("accepts empty input (a blank submission is still an answer)", () => {
    expect(answerRequestSchema.safeParse({ cardId: "c", input: "" }).success).toBe(true);
  });

  it("rejects a missing cardId", () => {
    expect(answerRequestSchema.safeParse({ input: "Japan" }).success).toBe(false);
  });
});

describe("answerResponseSchema", () => {
  it("validates a well-formed response", () => {
    const res = { correct: true, acceptedAnswer: "Japan" };
    expect(answerResponseSchema.parse(res)).toEqual(res);
  });

  it("rejects a non-boolean correct", () => {
    expect(answerResponseSchema.safeParse({ correct: "yes", acceptedAnswer: "Japan" }).success).toBe(
      false,
    );
  });

  it("rejects extra fields", () => {
    expect(
      answerResponseSchema.safeParse({ correct: true, acceptedAnswer: "Japan", debug: 1 }).success,
    ).toBe(false);
  });
});

describe("answerLogSchema", () => {
  const entry = {
    cardId: "cc:tokyo-japan:object",
    question: "What country is Tokyo in?",
    input: "Japan",
    correct: true,
    askedAt: "2026-07-19T12:00:00.000Z",
  };

  it("validates a log of recorded answers", () => {
    expect(answerLogSchema.parse([entry])).toEqual([entry]);
  });

  it("accepts an empty log", () => {
    expect(answerLogSchema.parse([])).toEqual([]);
  });

  it("accepts an empty input (a blank submission is still an answer)", () => {
    expect(answerLogSchema.safeParse([{ ...entry, input: "" }]).success).toBe(true);
  });

  it("rejects an entry with a missing timestamp", () => {
    const { askedAt: _askedAt, ...rest } = entry;
    expect(answerLogSchema.safeParse([rest]).success).toBe(false);
  });

  it("rejects an entry with extra fields", () => {
    expect(answerLogSchema.safeParse([{ ...entry, debug: 1 }]).success).toBe(false);
  });
});

describe("feedbackRequestSchema", () => {
  it("validates a general submission (comment only)", () => {
    const req = { kind: "general", comment: "The map is gorgeous." };
    expect(feedbackRequestSchema.parse(req)).toEqual(req);
  });

  it("validates a question submission with card_id and a context snapshot", () => {
    const req = {
      kind: "question",
      card_id: "cc:tokyo-japan:object",
      comment: "This question is wrong",
      context: {
        prompt: "What country is Tokyo in?",
        packLabel: "Cities & Countries",
        packId: "core-cities",
        acceptedAnswers: ["Japan"],
        input: "China",
      },
    };
    expect(feedbackRequestSchema.parse(req)).toEqual(req);
  });

  // A flag raised before answering has neither input nor accepted answers yet.
  it("accepts a partial context", () => {
    expect(
      feedbackRequestSchema.safeParse({
        kind: "question",
        card_id: "c",
        comment: "broken prompt",
        context: { prompt: "What country is Tokyo in?", packId: "core-cities" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(feedbackRequestSchema.safeParse({ kind: "praise", comment: "hi" }).success).toBe(false);
  });

  // General feedback must carry text; a question flag's empty box is filled with
  // a default sentence client-side, so the seam never sees an empty comment.
  it("rejects an empty comment", () => {
    expect(feedbackRequestSchema.safeParse({ kind: "general", comment: "" }).success).toBe(false);
  });

  it("rejects extra top-level fields", () => {
    expect(
      feedbackRequestSchema.safeParse({ kind: "general", comment: "hi", status: "resolved" }).success,
    ).toBe(false);
  });

  it("rejects an unknown context field", () => {
    expect(
      feedbackRequestSchema.safeParse({
        kind: "question",
        comment: "hi",
        context: { prompt: "p", userId: "leak" },
      }).success,
    ).toBe(false);
  });
});
