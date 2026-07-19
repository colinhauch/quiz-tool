import { describe, expect, it } from "vitest";
import {
  answerRequestSchema,
  answerResponseSchema,
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
  const question = { cardId: "S1:object", prompt: "What country is Tokyo in?", input: "text" };

  it("validates a well-formed rendered question", () => {
    expect(questionResponseSchema.parse(question)).toEqual(question);
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
