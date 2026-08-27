import type { Entity, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { previewGenerator } from "./generatorPreviewProjection.js";

function fixture(): Pack {
  const entities: Entity[] = [
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
  ];
  const statements: Statement[] = [
    // Bidirectional: capital-cities quizzes both hidden slots.
    { id: "cap:japan", subject: "Q17", relation: "capital", object: { kind: "entity", id: "Q1490" }, pack: "capital-cities" },
    // No generator for this relation — non-quizzable.
    { id: "unq:japan", subject: "Q17", relation: "unquizzed", object: { kind: "entity", id: "Q1490" }, pack: "unquizzed-pack" },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: {
      capital: ({ statement, hiddenSlot, graph }) =>
        hiddenSlot === "object"
          ? { prompt: `What is the capital of ${graph.getEntity(statement.subject).labels.en}?`, input: "text" }
          : { prompt: `${graph.getEntity(statement.object.kind === "entity" ? statement.object.id : "").labels.en} is the capital of what country?`, input: "text" },
    },
    hiddenSlots: { capital: ["object", "subject"] },
    packs: new Map([
      ["capital-cities", { id: "capital-cities", labels: { en: "Capital Cities" }, version: "0.0.1" }],
      ["unquizzed-pack", { id: "unquizzed-pack", labels: { en: "Unquizzed" }, version: "0.0.1" }],
    ]),
  };
}

describe("previewGenerator", () => {
  it("previews both forward and reverse cards for a bidirectional relation", () => {
    const preview = previewGenerator(fixture(), "cap:japan");
    expect(preview).toBeDefined();
    expect(preview!.packId).toBe("capital-cities");
    expect(preview!.provenance).toBe("Capital Cities");
    expect(preview!.cards).toHaveLength(2);

    const objectCard = preview!.cards.find((c) => c.hiddenSlot === "object")!;
    expect(objectCard.quizzable).toBe(true);
    expect(objectCard.prompt).toBe("What is the capital of Japan?");
    expect(objectCard.questionKind).toBe("text");
    expect(objectCard.correctAnswer).toBe("Tokyo");

    const subjectCard = preview!.cards.find((c) => c.hiddenSlot === "subject")!;
    expect(subjectCard.quizzable).toBe(true);
    expect(subjectCard.correctAnswer).toBe("Japan");
  });

  it("shows a statement whose relation has no generator as non-quizzable, not an error", () => {
    const preview = previewGenerator(fixture(), "unq:japan");
    expect(preview!.cards).toHaveLength(1);
    expect(preview!.cards[0]).toMatchObject({ hiddenSlot: "object", quizzable: false });
    expect(preview!.cards[0]!.prompt).toBeUndefined();
    expect(preview!.cards[0]!.reason).toMatch(/no generator/);
  });

  it("returns undefined for an unknown statement id", () => {
    expect(previewGenerator(fixture(), "does-not-exist")).toBeUndefined();
  });
});
