import { describe, expect, it } from "vitest";
import { applySelection, buildQueue, drawNext } from "./queue.js";
import type { Entity, Generator, Pack, PackInfo, Statement } from "./types.js";

/**
 * Two packs over shared entities, so a queue can be filtered down to one of
 * them. `cities` yields 3 cards, `continents` 2 — deliberately different sizes,
 * because a fold-in that quietly drops one side is invisible at equal counts.
 */
const entities: Entity[] = [
  { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
  { id: "Q90", labels: { en: "Paris" }, types: ["city"] },
  { id: "Q60", labels: { en: "New York" }, types: ["city"] },
  { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  { id: "Q48", labels: { en: "Asia" }, types: ["continent"] },
];

const noop: Generator = ({ statement }) => ({ prompt: `${statement.id}?`, input: "text" });

// Distinct subjects, so each statement is a genuinely different question: the
// queue de-dups object-hidden cards that share a (subject, relation), and the
// base fixture must not trip that — every card here is meant to survive.
function statement(id: string, pack: string, relation: string, subject = "Q1490"): Statement {
  return { id, subject, relation, object: { kind: "entity", id: "Q17" }, pack };
}

const info = (id: string): PackInfo => ({ id, labels: { en: id }, version: "0.0.1" });

function graph(): Pack {
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements: [
      statement("c:1", "cities", "located_in", "Q1490"),
      statement("c:2", "cities", "located_in", "Q90"),
      statement("c:3", "cities", "located_in", "Q60"),
      statement("k:1", "continents", "on_continent", "Q1490"),
      statement("k:2", "continents", "on_continent", "Q90"),
    ],
    generators: { located_in: noop, on_continent: noop },
    packs: new Map([info("cities"), info("continents")].map((p) => [p.id, p])),
  };
}

/** A deterministic rng cycling through fixed values, so orderings are reproducible. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const packsOf = (queue: { upcoming: readonly { statement: Statement }[] }) =>
  queue.upcoming.map((card) => card.statement.pack);
const idsOf = (queue: { upcoming: readonly { statement: Statement }[] }) =>
  queue.upcoming.map((card) => card.statement.id);

describe("buildQueue", () => {
  it("queues every drawable card from the included packs, and nothing else", () => {
    const queue = buildQueue(graph(), ["cities"], () => 0);
    expect(idsOf(queue).sort()).toEqual(["c:1", "c:2", "c:3"]);
    expect(queue.included).toEqual(["cities"]);
  });

  it("queues both packs when both are included", () => {
    expect(buildQueue(graph(), ["cities", "continents"], () => 0).upcoming).toHaveLength(5);
  });

  it("omits statements whose relation has no generator", () => {
    const g = graph();
    g.statements.push(statement("x:1", "cities", "ungenerated"));
    expect(buildQueue(g, ["cities"], () => 0).upcoming).toHaveLength(3);
  });

  // The backstop behind the contract's min(1) — the app must never sit in a
  // state where the learner is being quizzed on nothing.
  it("refuses a selection that yields no cards", () => {
    expect(() => buildQueue(graph(), [], () => 0)).toThrow(/no quizzable cards/);
    expect(() => buildQueue(graph(), ["core-geo"], () => 0)).toThrow(/no quizzable cards/);
  });
});

describe("buildQueue, object-hidden de-duplication", () => {
  // A country with several official languages is modeled as one statement each
  // (spec #97). Object-hidden, they render the identical prompt, so a pass must
  // ask the question once — not once per language. Any-of grading accepts any
  // true answer, so the dropped statements need not be asked as duplicates.
  function multiValued(): Pack {
    return {
      entities: new Map(entities.map((e) => [e.id, e])),
      statements: [
        // One subject (Q1490), one relation, three objects → three statements.
        { id: "l:1", subject: "Q1490", relation: "official_language", object: { kind: "entity", id: "Q17" }, pack: "langs" },
        { id: "l:2", subject: "Q1490", relation: "official_language", object: { kind: "entity", id: "Q48" }, pack: "langs" },
        { id: "l:3", subject: "Q1490", relation: "official_language", object: { kind: "entity", id: "Q60" }, pack: "langs" },
        // A different subject, same relation, stays its own card.
        { id: "l:4", subject: "Q90", relation: "official_language", object: { kind: "entity", id: "Q17" }, pack: "langs" },
      ],
      generators: { official_language: noop },
      packs: new Map([info("langs")].map((p) => [p.id, p])),
    };
  }

  it("asks a multi-valued (subject, relation) once per pass", () => {
    const queue = buildQueue(multiValued(), ["langs"], () => 0);
    expect(queue.upcoming).toHaveLength(2);
    expect(queue.upcoming.map((c) => c.statement.subject).sort()).toEqual(["Q1490", "Q90"]);
  });

  it("keeps every card of a single-valued relation (capital, continent)", () => {
    // The base fixture has distinct subjects, so nothing collapses.
    expect(buildQueue(graph(), ["cities", "continents"], () => 0).upcoming).toHaveLength(5);
  });

  it("does not de-dup subject-hidden cards sharing a (subject, relation)", () => {
    const g = multiValued();
    g.hiddenSlots = { official_language: ["subject"] };
    // Four subject-hidden cards, none collapsed — de-dup is object-hidden only.
    expect(buildQueue(g, ["langs"], () => 0).upcoming).toHaveLength(4);
  });
});

describe("drawNext", () => {
  it("hands out a card and removes it from the queue", () => {
    const queue = buildQueue(graph(), ["cities"], () => 0);
    const drawn = drawNext(graph(), queue, () => 0);
    expect(drawn.queue.upcoming).toHaveLength(2);
    expect(idsOf(drawn.queue)).not.toContain(drawn.card.statement.id);
  });

  // Without replacement is the property the queue buys over the old uniform
  // draw: a full pass shows every card exactly once.
  it("gives every card exactly once before repeating any", () => {
    const g = graph();
    let queue = buildQueue(g, ["cities", "continents"], seeded([0.1, 0.7, 0.3, 0.9, 0.5]));
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const drawn = drawNext(g, queue, () => 0.5);
      seen.push(drawn.card.statement.id);
      queue = drawn.queue;
    }
    expect([...seen].sort()).toEqual(["c:1", "c:2", "c:3", "k:1", "k:2"]);
    expect(queue.upcoming).toHaveLength(0);
  });

  it("reshuffles into a fresh pass instead of running dry", () => {
    const g = graph();
    const drawn = drawNext(g, { upcoming: [], included: ["cities"] }, () => 0);
    expect(drawn.card.statement.pack).toBe("cities");
    // One card handed out, the other two still ahead.
    expect(drawn.queue.upcoming).toHaveLength(2);
  });
});

describe("applySelection", () => {
  it("drops cards from a pack that was deselected", () => {
    const g = graph();
    const queue = applySelection(g, buildQueue(g, ["cities", "continents"], () => 0), ["cities"], () => 0);
    expect(packsOf(queue)).toEqual(["cities", "cities", "cities"]);
    expect(queue.included).toEqual(["cities"]);
  });

  it("folds a newly included pack in among the cards already queued", () => {
    const g = graph();
    const before = buildQueue(g, ["cities"], () => 0);
    const after = applySelection(g, before, ["cities", "continents"], seeded([0.9, 0.1, 0.5]));

    expect(after.upcoming).toHaveLength(5);
    expect(packsOf(after).filter((p) => p === "continents")).toHaveLength(2);
  });

  // The learner's place in the pass has to survive a selection change, which is
  // the whole reason this is not just buildQueue again.
  it("keeps the relative order of cards that were already queued", () => {
    const g = graph();
    const before = buildQueue(g, ["cities"], seeded([0.4, 0.8, 0.2]));
    const order = idsOf(before);

    const after = applySelection(g, before, ["cities", "continents"], seeded([0.9, 0.1, 0.5, 0.3]));
    expect(idsOf(after).filter((id) => id.startsWith("c:"))).toEqual(order);
  });

  it("does not resurrect cards already drawn from a still-included pack", () => {
    const g = graph();
    const drawn = drawNext(g, buildQueue(g, ["cities"], () => 0), () => 0);
    const after = applySelection(g, drawn.queue, ["cities", "continents"], () => 0.5);
    expect(idsOf(after)).not.toContain(drawn.card.statement.id);
  });

  it("starts a fresh pass when the new selection shares nothing with the queue", () => {
    const g = graph();
    const drained = { upcoming: [], included: ["cities"] };
    expect(applySelection(g, drained, ["continents"], () => 0).upcoming).toHaveLength(2);
  });
});
