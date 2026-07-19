import { describe, expect, it } from "vitest";
import { healthSchema, questionResponseSchema } from "./index.js";

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
