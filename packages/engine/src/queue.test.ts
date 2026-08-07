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

function statement(id: string, pack: string, relation: string): Statement {
  return { id, subject: "Q1490", relation, object: { kind: "entity", id: "Q17" }, pack };
}

const info = (id: string): PackInfo => ({ id, labels: { en: id }, version: "0.0.1" });

function graph(): Pack {
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements: [
      statement("c:1", "cities", "located_in"),
      statement("c:2", "cities", "located_in"),
      statement("c:3", "cities", "located_in"),
      statement("k:1", "continents", "on_continent"),
      statement("k:2", "continents", "on_continent"),
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
