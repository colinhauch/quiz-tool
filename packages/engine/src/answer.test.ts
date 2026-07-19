import { describe, expect, it } from "vitest";
import { checkAnswer, matchesEntity, normalizeAnswer } from "./answer.js";
import type { Entity, Pack, Statement } from "./types.js";

const japan: Entity = { id: "Q17", labels: { en: "Japan" }, types: ["country"] };
const usa: Entity = {
  id: "Q30",
  labels: { en: "United States" },
  aliases: { en: ["USA", "US", "United States of America"] },
  types: ["country"],
};
const saoPaulo: Entity = {
  id: "Q1963",
  labels: { en: "São Paulo" },
  aliases: { en: ["Sao Paulo"] },
  types: ["city"],
};

describe("normalizeAnswer", () => {
  it("lowercases", () => {
    expect(normalizeAnswer("Japan")).toBe("japan");
  });

  it("trims and collapses internal whitespace", () => {
    expect(normalizeAnswer("  United   States ")).toBe("united states");
  });

  it("folds diacritics", () => {
    expect(normalizeAnswer("São Paulo")).toBe("sao paulo");
  });

  it("treats composed and decomposed forms as equal (NFC)", () => {
    const composed = "São Paulo"; // ã as one code point
    const decomposed = "São Paulo"; // a + combining tilde
    expect(normalizeAnswer(composed)).toBe(normalizeAnswer(decomposed));
  });
});

describe("matchesEntity", () => {
  it.each([
    ["Japan", japan, true],
    ["japan", japan, true],
    ["  JAPAN  ", japan, true],
    ["Japland", japan, false], // no edit-distance tolerance
    ["USA", usa, true],
    ["us", usa, true],
    ["United States of America", usa, true],
    ["United  States", usa, true],
    ["Canada", usa, false],
    ["Sao Paulo", saoPaulo, true],
    ["são paulo", saoPaulo, true],
  ])("matches %j against %s → %s", (input, entity, expected) => {
    expect(matchesEntity(input, entity)).toBe(expected);
  });
});

const statements: Statement[] = [
  { id: "cc:tokyo-japan", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } },
  { id: "cc:nyc-usa", subject: "Q60", relation: "located_in", object: { kind: "entity", id: "Q30" } },
];

function makePack(): Pack {
  return {
    entities: new Map([japan, usa, saoPaulo].map((e) => [e.id, e])),
    statements,
    generators: {},
  };
}

describe("checkAnswer", () => {
  it("accepts a correct answer and reports the canonical label", () => {
    expect(checkAnswer(makePack(), "cc:tokyo-japan:object", "japan")).toEqual({
      correct: true,
      acceptedAnswer: "Japan",
    });
  });

  it("accepts a correct answer given by alias", () => {
    expect(checkAnswer(makePack(), "cc:nyc-usa:object", "USA")).toEqual({
      correct: true,
      acceptedAnswer: "United States",
    });
  });

  it("rejects a wrong answer but still reveals the accepted label", () => {
    expect(checkAnswer(makePack(), "cc:tokyo-japan:object", "China")).toEqual({
      correct: false,
      acceptedAnswer: "Japan",
    });
  });

  it("throws on an unknown card", () => {
    expect(() => checkAnswer(makePack(), "cc:nope:object", "x")).toThrow(/unknown card/);
  });
});
