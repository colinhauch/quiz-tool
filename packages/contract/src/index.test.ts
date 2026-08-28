import { describe, expect, it } from "vitest";
import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  healthSchema,
  questionResponseSchema,
  visualAidSchema,
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
    answerTypes: ["country"],
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

  it("requires answerTypes and rejects empty type strings", () => {
    const { answerTypes: _t, ...withoutTypes } = question;
    expect(questionResponseSchema.safeParse(withoutTypes).success).toBe(false);
    expect(questionResponseSchema.safeParse({ ...question, answerTypes: [""] }).success).toBe(false);
    // An empty list is valid — an entity could in principle carry no types.
    expect(questionResponseSchema.safeParse({ ...question, answerTypes: [] }).success).toBe(true);
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
    const res = { correct: true, acceptedAnswer: "Japan", acceptedAnswers: ["Japan"] };
    expect(answerResponseSchema.parse(res)).toEqual(res);
  });

  it("validates a transcontinental response listing several accepted answers", () => {
    const res = { correct: true, acceptedAnswer: "Asia", acceptedAnswers: ["Asia", "Europe"] };
    expect(answerResponseSchema.parse(res)).toEqual(res);
  });

  it("rejects an empty acceptedAnswers list", () => {
    expect(
      answerResponseSchema.safeParse({ correct: true, acceptedAnswer: "Japan", acceptedAnswers: [] }).success,
    ).toBe(false);
  });

  it("rejects a non-boolean correct", () => {
    expect(
      answerResponseSchema.safeParse({ correct: "yes", acceptedAnswer: "Japan", acceptedAnswers: ["Japan"] })
        .success,
    ).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      answerResponseSchema.safeParse({
        correct: true,
        acceptedAnswer: "Japan",
        acceptedAnswers: ["Japan"],
        debug: 1,
      }).success,
    ).toBe(false);
  });

  it("validates a response carrying a map revealVisual", () => {
    const res = {
      correct: true,
      acceptedAnswer: "Tokyo",
      acceptedAnswers: ["Tokyo"],
      revealVisual: { kind: "map", entityId: "Q1490", lat: 35.6897, lon: 139.6922, label: "Tokyo" },
    };
    expect(answerResponseSchema.parse(res)).toEqual(res);
  });

  it("rejects a malformed revealVisual", () => {
    const res = {
      correct: true,
      acceptedAnswer: "Tokyo",
      acceptedAnswers: ["Tokyo"],
      revealVisual: { kind: "map", entityId: "Q1490", lat: "north", lon: 139.6922, label: "Tokyo" },
    };
    expect(answerResponseSchema.safeParse(res).success).toBe(false);
  });
});

describe("visualAidSchema", () => {
  const map = { kind: "map", entityId: "Q1490", lat: 35.6897, lon: 139.6922, label: "Tokyo" };

  it("validates a well-formed map descriptor", () => {
    expect(visualAidSchema.parse(map)).toEqual(map);
  });

  it("rejects an unknown visual-aid kind", () => {
    expect(visualAidSchema.safeParse({ ...map, kind: "flag" }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    const { label: _label, ...withoutLabel } = map;
    expect(visualAidSchema.safeParse(withoutLabel).success).toBe(false);
  });
});

describe("questionResponseSchema, promptVisual", () => {
  const question = {
    cardId: "S1:object",
    prompt: "What country is Tokyo in?",
    input: "text" as const,
    packId: "core-cities",
    packLabel: "Cities & Countries",
    answerTypes: ["country"],
  };

  it("validates without a promptVisual", () => {
    expect(questionResponseSchema.parse(question)).toEqual(question);
  });

  it("validates with a well-formed promptVisual", () => {
    const withVisual = {
      ...question,
      promptVisual: { kind: "map", entityId: "Q1490", lat: 35.6897, lon: 139.6922, label: "Tokyo" },
    };
    expect(questionResponseSchema.parse(withVisual)).toEqual(withVisual);
  });

  it("rejects a malformed promptVisual", () => {
    const withBadVisual = { ...question, promptVisual: { kind: "map" } };
    expect(questionResponseSchema.safeParse(withBadVisual).success).toBe(false);
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
