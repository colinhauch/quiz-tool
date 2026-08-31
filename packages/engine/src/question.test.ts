import { describe, expect, it } from "vitest";
import { generateQuestion } from "./question.js";
import type { Entity, Generator, Pack, PackInfo, Statement } from "./types.js";

// Every fixture statement comes from one pack. In the real system the loader
// stamps `pack` and registers the manifest; here both are spelled out so a
// generated question can be checked for the provenance it carries.
const TEST_PACK: PackInfo = { id: "test-pack", labels: { en: "Test Pack" }, version: "0.0.1" };
const packs = new Map([[TEST_PACK.id, TEST_PACK]]);
const provenance = { packId: TEST_PACK.id, packLabel: TEST_PACK.labels.en };

const tokyo: Entity = { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] };
const paris: Entity = { id: "Q90", labels: { en: "Paris" }, types: ["city"] };
const japan: Entity = { id: "Q17", labels: { en: "Japan" }, types: ["country"] };
const france: Entity = { id: "Q142", labels: { en: "France" }, types: ["country"] };

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});

const statements: Statement[] = [
  { id: "S1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: TEST_PACK.id },
  { id: "S2", subject: "Q90", relation: "located_in", object: { kind: "entity", id: "Q142" }, pack: TEST_PACK.id },
];

function makePack(): Pack {
  return {
    entities: new Map([tokyo, paris, japan, france].map((e) => [e.id, e])),
    statements,
    generators: { located_in: locatedIn },
    packs,
  };
}

describe("generateQuestion", () => {
  it("renders an object-hidden located_in statement into a prompt", () => {
    const q = generateQuestion(makePack(), statements[0]!, "object");
    expect(q).toEqual({
      cardId: "S1:object",
      prompt: "What country is Tokyo in?",
      input: "text",
      ...provenance,
      answerTypes: ["country"],
    });
  });

  it("carries the hidden object entity's types as answerTypes", () => {
    // Object-hidden located_in: the answer is Japan, a country.
    const q = generateQuestion(makePack(), statements[0]!, "object");
    expect(q.answerTypes).toEqual(["country"]);
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
  pack: TEST_PACK.id,
};

function makeBidiPack(): Pack {
  return {
    entities: new Map([bern, switzerland].map((e) => [e.id, e])),
    statements: [bidiStatement],
    generators: { capital },
    hiddenSlots: { capital: ["object", "subject"] },
    packs,
  };
}

describe("subject-hidden questions", () => {
  it("renders a subject-hidden statement, concealing the subject", () => {
    const q = generateQuestion(makeBidiPack(), bidiStatement, "subject");
    expect(q).toEqual({
      cardId: "S_cap:subject",
      prompt: "Bern is the capital of what country?",
      input: "text",
      ...provenance,
      answerTypes: ["country"],
    });
    // The concealed subject (the answer) never appears in the prompt.
    expect(q.prompt).not.toContain("Switzerland");
  });

  it("scopes answerTypes to the hidden side of a bidirectional card", () => {
    const objectHidden = generateQuestion(makeBidiPack(), bidiStatement, "object");
    const subjectHidden = generateQuestion(makeBidiPack(), bidiStatement, "subject");
    // Object-hidden: answer is Bern, a city. Subject-hidden: answer is a country.
    expect(objectHidden.answerTypes).toEqual(["city"]);
    expect(subjectHidden.answerTypes).toEqual(["country"]);
  });
});
