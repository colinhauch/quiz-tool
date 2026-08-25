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
const washington: Entity = { id: "Q61", labels: { en: "Washington, D.C." }, types: ["city"] };
const ndjamena: Entity = { id: "Q3719", labels: { en: "N'Djamena" }, types: ["city"] };
const portAuPrince: Entity = { id: "Q3748", labels: { en: "Port-au-Prince" }, types: ["city"] };

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

  it("drops periods and commas", () => {
    expect(normalizeAnswer("Washington, D.C.")).toBe("washington dc");
  });

  it("drops apostrophes (straight and curly)", () => {
    expect(normalizeAnswer("St. John's")).toBe("st johns");
    expect(normalizeAnswer("N’Djamena")).toBe("ndjamena");
  });

  it("folds hyphens to spaces", () => {
    expect(normalizeAnswer("Port-au-Prince")).toBe("port au prince");
  });

  it("does not collapse two genuinely different answers", () => {
    // Both carry periods; folding must not merge them.
    expect(normalizeAnswer("St. John's")).not.toBe(normalizeAnswer("St. Louis"));
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
    ["washington dc", washington, true],
    ["Washington D.C.", washington, true],
    ["Boston", washington, false],
    ["ndjamena", ndjamena, true],
    ["N'Djamena", ndjamena, true],
    ["port au prince", portAuPrince, true],
    ["Port-au-Prince", portAuPrince, true],
  ])("matches %j against %s → %s", (input, entity, expected) => {
    expect(matchesEntity(input, entity)).toBe(expected);
  });
});

const statements: Statement[] = [
  { id: "cc:tokyo-japan", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "test-pack" },
  { id: "cc:nyc-usa", subject: "Q60", relation: "located_in", object: { kind: "entity", id: "Q30" }, pack: "test-pack" },
];

/** Grading never reads provenance, but a graph is not well-formed without it. */
const packs = new Map([["test-pack", { id: "test-pack", labels: { en: "Test Pack" }, version: "0.0.1" }]]);

function makePack(): Pack {
  return {
    entities: new Map([japan, usa, saoPaulo].map((e) => [e.id, e])),
    statements,
    generators: {},
    packs,
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

describe("checkAnswer, revealVisual", () => {
  const tokyo: Entity = {
    id: "Q1490",
    labels: { en: "Tokyo" },
    types: ["city"],
    coordinate: { lat: 35.6897, lon: 139.6922 },
  };
  const japanWithCoordinate: Entity = {
    ...japan,
    coordinate: { lat: 36, lon: 138 },
  };
  const andorra: Entity = {
    id: "Q228",
    labels: { en: "Andorra" },
    types: ["country"],
    coordinate: { lat: 42.5, lon: 1.5 },
  };
  const europe: Entity = {
    id: "Q46",
    labels: { en: "Europe" },
    types: ["continent"],
    coordinate: { lat: 48.69, lon: 9.14 },
  };
  const tokyoMap = { renderer: "map", entityId: "Q1490", lat: 35.6897, lon: 139.6922, label: "Tokyo" };

  // A city→country statement, quizzable both ways.
  function makeCityCountryPack(subject: Entity, object: Entity): Pack {
    return {
      entities: new Map([subject, object].map((e) => [e.id, e])),
      statements: [
        { id: "cc:tokyo-japan", subject: subject.id, relation: "located_in", object: { kind: "entity", id: object.id }, pack: "test-pack" },
      ],
      generators: {},
      hiddenSlots: { located_in: ["subject", "object"] },
      packs,
    };
  }

  it("maps the most point-like entity: the city, not the answer country (object-hidden)", () => {
    // "What country is Tokyo in?" → answer Japan, but the map pins Tokyo.
    const result = checkAnswer(makeCityCountryPack(tokyo, japanWithCoordinate), "cc:tokyo-japan:object", "Japan");
    expect(result.acceptedAnswer).toBe("Japan");
    expect(result.revealVisual).toEqual(tokyoMap);
  });

  it("maps the city even when the country is the answer (capital, subject-hidden)", () => {
    // "Moscow is the capital of what country?" → answer Russia, but the map pins
    // Moscow (city), not Russia's centroid.
    const russia: Entity = { id: "Q159", labels: { en: "Russia" }, types: ["country"], coordinate: { lat: 60, lon: 100 } };
    const moscow: Entity = { id: "Q649", labels: { en: "Moscow" }, types: ["city"], coordinate: { lat: 55.75, lon: 37.62 } };
    const pack: Pack = {
      entities: new Map([russia, moscow].map((e) => [e.id, e])),
      statements: [
        { id: "cap:russia", subject: "Q159", relation: "capital", object: { kind: "entity", id: "Q649" }, pack: "test-pack" },
      ],
      generators: {},
      hiddenSlots: { capital: ["object", "subject"] },
      packs,
    };
    const result = checkAnswer(pack, "cap:russia:subject", "Russia");
    expect(result.acceptedAnswer).toBe("Russia");
    expect(result.revealVisual).toEqual({ renderer: "map", entityId: "Q649", lat: 55.75, lon: 37.62, label: "Moscow" });
  });

  it("maps the country, not the continent, for a continent card", () => {
    // "What continent is Andorra in?" → answer Europe, but the map pins Andorra.
    const pack: Pack = {
      entities: new Map([andorra, europe].map((e) => [e.id, e])),
      statements: [
        { id: "cont:andorra", subject: "Q228", relation: "located_in_continent", object: { kind: "entity", id: "Q46" }, pack: "test-pack" },
      ],
      generators: {},
      packs,
    };
    const result = checkAnswer(pack, "cont:andorra:object", "Asia");
    expect(result).toMatchObject({ correct: false, acceptedAnswer: "Europe" });
    expect(result.revealVisual).toEqual({ renderer: "map", entityId: "Q228", lat: 42.5, lon: 1.5, label: "Andorra" });
  });

  it("falls back to the country when the object has no coordinate (e.g. a currency)", () => {
    const euro: Entity = { id: "Q4916", labels: { en: "Euro" }, types: ["currency"] };
    const pack: Pack = {
      entities: new Map([andorra, euro].map((e) => [e.id, e])),
      statements: [
        { id: "cur:andorra", subject: "Q228", relation: "uses_currency", object: { kind: "entity", id: "Q4916" }, pack: "test-pack" },
      ],
      generators: {},
      packs,
    };
    const result = checkAnswer(pack, "cur:andorra:object", "Euro");
    expect(result.revealVisual).toEqual({ renderer: "map", entityId: "Q228", lat: 42.5, lon: 1.5, label: "Andorra" });
  });

  it("omits revealVisual when neither end has a coordinate", () => {
    const tokyoNoCoord: Entity = { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] };
    const result = checkAnswer(makeCityCountryPack(tokyoNoCoord, japan), "cc:tokyo-japan:object", "Japan");
    expect(result).not.toHaveProperty("revealVisual");
  });
});

// A `capital` statement quizzable both ways; the pack declares both slots so
// the subject-hidden card resolves.
const switzerland: Entity = { id: "Q39", labels: { en: "Switzerland" }, types: ["country"] };
const bern: Entity = { id: "Q70", labels: { en: "Bern" }, types: ["city"] };

const capitalStatements: Statement[] = [
  {
    id: "cap:switzerland-bern",
    subject: "Q39",
    relation: "capital",
    object: { kind: "entity", id: "Q70" },
    pack: "test-pack",
  },
];

function makeCapitalPack(): Pack {
  return {
    entities: new Map([switzerland, bern].map((e) => [e.id, e])),
    statements: capitalStatements,
    generators: {},
    hiddenSlots: { capital: ["object", "subject"] },
    packs,
  };
}

// A multi-valued object-hidden relation: Switzerland has several official
// languages, each modeled as its own statement (see spec #97 / ticket #98).
// Grading a card built from any one of them must accept *any* true language.
const german: Entity = { id: "Q188", labels: { en: "German" }, types: ["language"] };
const french: Entity = {
  id: "Q150",
  labels: { en: "French" },
  aliases: { en: ["Français"] },
  types: ["language"],
};
const italian: Entity = { id: "Q652", labels: { en: "Italian" }, types: ["language"] };
const spanish: Entity = { id: "Q1321", labels: { en: "Spanish" }, types: ["language"] };

const languageStatements: Statement[] = [
  { id: "lang:switzerland-german", subject: "Q39", relation: "official_language", object: { kind: "entity", id: "Q188" }, pack: "test-pack" },
  { id: "lang:switzerland-french", subject: "Q39", relation: "official_language", object: { kind: "entity", id: "Q150" }, pack: "test-pack" },
  { id: "lang:switzerland-italian", subject: "Q39", relation: "official_language", object: { kind: "entity", id: "Q652" }, pack: "test-pack" },
];

function makeLanguagePack(): Pack {
  return {
    entities: new Map([switzerland, german, french, italian, spanish].map((e) => [e.id, e])),
    statements: languageStatements,
    generators: {},
    packs,
  };
}

describe("checkAnswer, object-hidden multi-valued (any-of)", () => {
  it("accepts the card's own object", () => {
    expect(checkAnswer(makeLanguagePack(), "lang:switzerland-german:object", "German")).toEqual({
      correct: true,
      acceptedAnswer: "German",
    });
  });

  it("accepts a sibling object — a different true answer for the same (subject, relation)", () => {
    // Card was built from the German statement; the learner answers French.
    expect(checkAnswer(makeLanguagePack(), "lang:switzerland-german:object", "French")).toEqual({
      correct: true,
      acceptedAnswer: "French",
    });
  });

  it("accepts a sibling object given by alias", () => {
    expect(checkAnswer(makeLanguagePack(), "lang:switzerland-italian:object", "Français")).toEqual({
      correct: true,
      acceptedAnswer: "French",
    });
  });

  it("rejects a language that is not official, revealing the card's own object", () => {
    expect(checkAnswer(makeLanguagePack(), "lang:switzerland-french:object", "Spanish")).toEqual({
      correct: false,
      acceptedAnswer: "French",
    });
  });
});

describe("checkAnswer, subject-hidden", () => {
  it("grades against the statement's subject entity", () => {
    expect(checkAnswer(makeCapitalPack(), "cap:switzerland-bern:subject", "Switzerland")).toEqual({
      correct: true,
      acceptedAnswer: "Switzerland",
    });
  });

  it("rejects a wrong subject answer but reveals the accepted label", () => {
    expect(checkAnswer(makeCapitalPack(), "cap:switzerland-bern:subject", "France")).toEqual({
      correct: false,
      acceptedAnswer: "Switzerland",
    });
  });

  it("still grades the object-hidden card of the same statement against the object", () => {
    expect(checkAnswer(makeCapitalPack(), "cap:switzerland-bern:object", "Bern")).toEqual({
      correct: true,
      acceptedAnswer: "Bern",
    });
  });
});
