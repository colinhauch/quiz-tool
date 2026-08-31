import { describe, expect, it } from "vitest";
import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  feedbackRequestSchema,
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

  it("validates a map descriptor carrying regional geometry + extent (#155)", () => {
    const enriched = {
      ...map,
      localGeoJSON: {
        type: "MultiPolygon",
        coordinates: [[[[139, 35], [140, 35], [140, 36], [139, 35]]]],
      },
      regionExtent: { minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 },
    };
    expect(visualAidSchema.parse(enriched)).toEqual(enriched);
  });

  it("rejects a localGeoJSON with the wrong geometry tag", () => {
    const bad = { ...map, localGeoJSON: { type: "Polygon", coordinates: [] } };
    expect(visualAidSchema.safeParse(bad).success).toBe(false);
  });

  const image = { kind: "image", src: "/flags/jp.svg", alt: "Flag of a country" };

  it("validates a well-formed image descriptor (#180)", () => {
    expect(visualAidSchema.parse(image)).toEqual(image);
  });

  it("rejects an image descriptor with an empty src or alt", () => {
    expect(visualAidSchema.safeParse({ ...image, src: "" }).success).toBe(false);
    expect(visualAidSchema.safeParse({ ...image, alt: "" }).success).toBe(false);
  });

  it("rejects an image descriptor with an unknown extra field", () => {
    expect(visualAidSchema.safeParse({ ...image, entityId: "Q17" }).success).toBe(false);
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

  // `answered: false` is what makes a missing input readable as "flagged before
  // answering" rather than "the client dropped it".
  it("carries whether the card had been answered when the flag was raised", () => {
    const req = {
      kind: "question",
      card_id: "c",
      comment: "broken prompt",
      context: { prompt: "What country is Tokyo in?", packId: "core-cities", answered: false },
    };
    expect(feedbackRequestSchema.parse(req)).toEqual(req);
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
