import { describe, expect, it } from "vitest";
import { generateQuestion, selectQuestion } from "./question.js";
import type { Entity, Generator, Pack, Statement } from "./types.js";

const tokyo: Entity = { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] };
const paris: Entity = { id: "Q90", labels: { en: "Paris" }, types: ["city"] };
const japan: Entity = { id: "Q17", labels: { en: "Japan" }, types: ["country"] };
const france: Entity = { id: "Q142", labels: { en: "France" }, types: ["country"] };

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});

const statements: Statement[] = [
  { id: "S1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } },
  { id: "S2", subject: "Q90", relation: "located_in", object: { kind: "entity", id: "Q142" } },
];

function makePack(): Pack {
  return {
    entities: new Map([tokyo, paris, japan, france].map((e) => [e.id, e])),
    statements,
    generators: { located_in: locatedIn },
  };
}

describe("generateQuestion", () => {
  it("renders an object-hidden located_in statement into a prompt", () => {
    const q = generateQuestion(makePack(), statements[0]!, "object");
    expect(q).toEqual({ cardId: "S1:object", prompt: "What country is Tokyo in?", input: "text" });
  });

  it("never leaks the answer into the rendered question", () => {
    const q = generateQuestion(makePack(), statements[0]!, "object");
    expect(JSON.stringify(q)).not.toContain("Japan");
    expect(q).not.toHaveProperty("answer");
  });

  it("throws when no generator is registered for the relation", () => {
    const pack = makePack();
    const orphan: Statement = { ...statements[0]!, relation: "borders" };
    expect(() => generateQuestion(pack, orphan, "object")).toThrow(/no generator/);
  });
});

describe("selectQuestion", () => {
  it("picks a card deterministically from an injected rng", () => {
    // rng at the top of the range selects the last candidate.
    const q = selectQuestion(makePack(), () => 0.99);
    expect(q).toEqual({ cardId: "S2:object", prompt: "What country is Paris in?", input: "text" });
  });

  it("picks the first candidate when rng is 0", () => {
    const q = selectQuestion(makePack(), () => 0);
    expect(q.cardId).toBe("S1:object");
  });

  it("only considers statements whose relation has a generator", () => {
    const pack = makePack();
    pack.statements.push({
      id: "S3",
      subject: "Q17",
      relation: "capital",
      object: { kind: "entity", id: "Q1490" },
    });
    // Even at the top of the range, the ungeneratable `capital` card is skipped.
    expect(selectQuestion(pack, () => 0.99).cardId).toBe("S2:object");
  });

  it("throws when the pack has no quizzable statements", () => {
    const pack: Pack = { ...makePack(), generators: {} };
    expect(() => selectQuestion(pack)).toThrow(/no quizzable/);
  });
});

// A `capital` relation quizzable both ways: hide the object ("What is the
// capital of France?") or the subject ("Bern is the capital of what country?").
const bern: Entity = { id: "Q70", labels: { en: "Bern" }, types: ["city"] };
const switzerland: Entity = { id: "Q39", labels: { en: "Switzerland" }, types: ["country"] };

const capital: Generator = ({ statement, hiddenSlot, graph }) => {
  const country = graph.getEntity(statement.subject).labels.en;
  const city = graph.getEntity((statement.object as { id: string }).id).labels.en;
  return hiddenSlot === "subject"
    ? { prompt: `${city} is the capital of what country?`, input: "text" }
    : { prompt: `What is the capital of ${country}?`, input: "text" };
};

const bidiStatement: Statement = {
  id: "S_cap",
  subject: "Q39",
  relation: "capital",
  object: { kind: "entity", id: "Q70" },
};

function makeBidiPack(): Pack {
  return {
    entities: new Map([bern, switzerland].map((e) => [e.id, e])),
    statements: [bidiStatement],
    generators: { capital },
    hiddenSlots: { capital: ["object", "subject"] },
  };
}

describe("subject-hidden questions", () => {
  it("renders a subject-hidden statement, concealing the subject", () => {
    const q = generateQuestion(makeBidiPack(), bidiStatement, "subject");
    expect(q).toEqual({
      cardId: "S_cap:subject",
      prompt: "Bern is the capital of what country?",
      input: "text",
    });
    // The concealed subject (the answer) never appears in the prompt.
    expect(q.prompt).not.toContain("Switzerland");
  });

  it("selectQuestion can pick the subject-hidden slot of a bidirectional relation", () => {
    // Two cards from one statement: [S_cap:object, S_cap:subject]. rng near the
    // top of the range selects the second (subject) card.
    const q = selectQuestion(makeBidiPack(), () => 0.99);
    expect(q.cardId).toBe("S_cap:subject");
  });

  it("selectQuestion still picks the object-hidden slot at the low end", () => {
    const q = selectQuestion(makeBidiPack(), () => 0);
    expect(q.cardId).toBe("S_cap:object");
  });
});
