import { describe, expect, it } from "vitest";
import { makeCardId } from "./card.js";
import { type Ratings, SEED_RATING, emptyRatings } from "./rating.js";
import {
  DEFAULT_TIERS,
  applySelection,
  buildScheduler,
  drawNext,
  eligibleCards,
  type Scheduler,
  type Tier,
} from "./scheduler.js";
import type { Entity, Generator, Pack, PackInfo, Statement } from "./types.js";

/**
 * Ratings are fed as difficulty per card against a constant seed ability, so a
 * card's tier is a pure function of the difficulty we assign it: far below the
 * ability → easy, far above → hard, equal → medium. That lets a test place cards
 * in exact tiers without touching the ability table.
 */
const EASY_D = 1000; // P ≈ 0.95 vs seed 1500 → easy
const HARD_D = 2000; // P ≈ 0.05 vs seed 1500 → hard
const MEDIUM_D = SEED_RATING; // P = 0.5 → medium

const noop: Generator = ({ statement }) => ({ prompt: `${statement.id}?`, input: "text" });
const info = (id: string): PackInfo => ({ id, labels: { en: id }, version: "0.0.1" });

function statement(id: string, pack: string, subject: string): Statement {
  return { id, subject, relation: "located_in", object: { kind: "entity", id: "Q17" }, pack };
}

/** A pool of `n` distinct object-hidden cards in one pack, ids `p:0 … p:n-1`. */
function pool(pack: string, n: number): Statement[] {
  return Array.from({ length: n }, (_, i) => statement(`${pack}:${i}`, pack, `S${pack}${i}`));
}

function graphOf(statements: Statement[], packIds: string[]): Pack {
  const entities: Entity[] = [
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
    ...statements.map((s) => ({ id: s.subject, labels: { en: s.subject }, types: ["city"] })),
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { located_in: noop },
    packs: new Map(packIds.map((id) => [id, info(id)])),
  };
}

/** A Ratings with the given card difficulties; ability left at seed for everyone. */
function ratingsWith(difficulty: Record<string, number>): Ratings {
  return { ...emptyRatings(), difficulty: new Map(Object.entries(difficulty)) };
}

/** Difficulty map placing card `p:i` into a tier by index range — helper for pools. */
function tieredDifficulty(pack: string, easy: number, medium: number, hard: number): Record<string, number> {
  const d: Record<string, number> = {};
  let i = 0;
  for (let k = 0; k < easy; k++) d[makeCardId(`${pack}:${i++}`, "object")] = EASY_D;
  for (let k = 0; k < medium; k++) d[makeCardId(`${pack}:${i++}`, "object")] = MEDIUM_D;
  for (let k = 0; k < hard; k++) d[makeCardId(`${pack}:${i++}`, "object")] = HARD_D;
  return d;
}

/** A deterministic rng cycling through fixed values, so orderings are reproducible. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const tierByProbability = (cardId: string, d: Record<string, number>): string => {
  const diff = d[cardId] ?? SEED_RATING;
  return diff <= EASY_D ? "easy" : diff >= HARD_D ? "hard" : "medium";
};

describe("eligibleCards", () => {
  // These behaviours were covered by queue.test.ts before the queue was retired;
  // they now live in eligibleCards/dedupeObjectHidden, ported verbatim from the
  // queue, so they keep their coverage here (#120 review).

  it("omits statements whose relation has no generator", () => {
    // graphOf only registers a `located_in` generator, so an `ungenerated`
    // statement is enumerated but not eligible to be drawn.
    const stmts: Statement[] = [
      { id: "a:1", subject: "S1", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "geo" },
      { id: "a:2", subject: "S2", relation: "ungenerated", object: { kind: "entity", id: "Q17" }, pack: "geo" },
    ];
    const g = graphOf(stmts, ["geo"]);
    expect(eligibleCards(g, ["geo"]).map((c) => c.statement.id)).toEqual(["a:1"]);
  });

  it("collapses a multi-valued (subject, relation) object-hidden card to one", () => {
    // One subject with two objects renders the identical object-hidden prompt
    // ("what is S located in?"), so a cycle asks it once; a different subject
    // stays its own card.
    const stmts: Statement[] = [
      { id: "l:1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "geo" },
      { id: "l:2", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q48" }, pack: "geo" },
      { id: "l:3", subject: "Q90", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "geo" },
    ];
    const g = graphOf(stmts, ["geo"]);
    expect(eligibleCards(g, ["geo"]).map((c) => c.statement.subject).sort()).toEqual(["Q1490", "Q90"]);
  });

  it("does not de-dup subject-hidden cards sharing a (subject, relation)", () => {
    // De-dup is object-hidden only: two subject-hidden cards under one subject
    // ask different prompts (each names its own object), so both survive.
    const stmts: Statement[] = [
      { id: "l:1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "geo" },
      { id: "l:2", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q48" }, pack: "geo" },
    ];
    const g: Pack = { ...graphOf(stmts, ["geo"]), hiddenSlots: { located_in: ["subject"] } };
    expect(eligibleCards(g, ["geo"])).toHaveLength(2);
  });
});

describe("buildScheduler", () => {
  it("refuses tiers that don't partition [0, 1]", () => {
    const g = graphOf(pool("geo", 3), ["geo"]);
    const gappy: Tier[] = [
      { name: "low", min: 0, max: 0.4, marbles: 1 },
      { name: "high", min: 0.6, max: 1.01, marbles: 1 }, // gap 0.4–0.6: a card at P=0.5 bins nowhere
    ];
    expect(() => buildScheduler(g, emptyRatings(), "u", ["geo"], () => 0, gappy)).toThrow(/contiguous|cover/);
  });

  it("bins the whole eligible pool by P(success)", () => {
    const stmts = pool("geo", 6);
    const g = graphOf(stmts, ["geo"]);
    const d = tieredDifficulty("geo", 2, 3, 1);
    const s = buildScheduler(g, ratingsWith(d), "u", ["geo"], () => 0);
    expect(s.bags.easy).toHaveLength(2);
    expect(s.bags.medium).toHaveLength(3);
    expect(s.bags.hard).toHaveLength(1);
  });

  it("puts a brand-new (unrated) card in the medium tier", () => {
    const g = graphOf(pool("geo", 3), ["geo"]);
    // No ratings at all: every card reads back at the seed → P = 0.5 → medium.
    const s = buildScheduler(g, emptyRatings(), "u", ["geo"], () => 0);
    expect(s.bags.medium).toHaveLength(3);
    expect(s.bags.easy).toHaveLength(0);
    expect(s.bags.hard).toHaveLength(0);
  });

  it("fills the top bag to the tier ratio", () => {
    const g = graphOf(pool("geo", 6), ["geo"]);
    const s = buildScheduler(g, ratingsWith(tieredDifficulty("geo", 2, 3, 1)), "u", ["geo"], () => 0);
    const counts = s.topBag.reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});
    expect(counts).toEqual({ hard: 1, medium: 3, easy: 2 });
  });

  it("refuses a selection that yields no eligible cards", () => {
    const g = graphOf(pool("geo", 3), ["geo"]);
    expect(() => buildScheduler(g, emptyRatings(), "u", [], () => 0)).toThrow(/no eligible cards/);
    expect(() => buildScheduler(g, emptyRatings(), "u", ["other"], () => 0)).toThrow(/no eligible cards/);
  });
});

describe("drawNext", () => {
  it("honours the tier ratio exactly over a full cycle, with no within-cycle repeats", () => {
    // Enough distinct cards per tier that one cycle never empties a bag, so each
    // drawn card's tier equals the marble that drew it.
    const stmts = pool("geo", 12);
    const g = graphOf(stmts, ["geo"]);
    const d = tieredDifficulty("geo", 4, 5, 3); // easy 4, medium 5, hard 3
    const ratings = ratingsWith(d);
    const rng = seeded([0.1, 0.42, 0.73, 0.9, 0.27, 0.55, 0.83, 0.05, 0.61, 0.36, 0.7, 0.2]);

    let s: Scheduler = buildScheduler(g, ratings, "u", ["geo"], rng);
    const drawnTiers: string[] = [];
    const drawnCards: string[] = [];
    const cycle = DEFAULT_TIERS.reduce((n, t) => n + t.marbles, 0); // 6
    for (let i = 0; i < cycle; i++) {
      const out = drawNext(g, ratings, "u", s, rng);
      const cardId = makeCardId(out.card.statement.id, out.card.hiddenSlot);
      drawnCards.push(cardId);
      drawnTiers.push(tierByProbability(cardId, d));
      s = out.scheduler;
    }
    const tierCounts = drawnTiers.reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});
    expect(tierCounts).toEqual({ hard: 1, medium: 3, easy: 2 });
    expect(new Set(drawnCards).size).toBe(cycle); // no card repeated within the cycle
  });

  it("is deterministic under a seeded rng", () => {
    const g = graphOf(pool("geo", 6), ["geo"]);
    const d = tieredDifficulty("geo", 2, 3, 1);
    const ratings = ratingsWith(d);
    const draw = () => {
      const rng = seeded([0.13, 0.62, 0.44, 0.9, 0.05, 0.71, 0.38]);
      let s = buildScheduler(g, ratings, "u", ["geo"], rng);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const out = drawNext(g, ratings, "u", s, rng);
        ids.push(makeCardId(out.card.statement.id, out.card.hiddenSlot));
        s = out.scheduler;
      }
      return ids;
    };
    expect(draw()).toEqual(draw());
  });

  it("re-bins only the emptied inner bag, leaving the others untouched", () => {
    // One easy card, plenty of medium/hard. Drawing easy twice empties the easy
    // bag; the second easy draw must re-bin easy (finding the same lone card
    // again — re-draws allowed) without disturbing medium/hard contents.
    const g = graphOf(pool("geo", 6), ["geo"]);
    const d = tieredDifficulty("geo", 1, 3, 2);
    const ratings = ratingsWith(d);
    // rng chosen so the first two marbles are both easy is impossible (ratio has
    // one easy marble/cycle); instead assert the mechanism directly on state.
    let s = buildScheduler(g, ratings, "u", ["geo"], () => 0);
    const mediumBefore = [...(s.bags.medium ?? [])];
    // Force an easy draw by handing a scheduler whose top bag is a lone "easy".
    s = { ...s, topBag: ["easy"] };
    const first = drawNext(g, ratings, "u", s, () => 0);
    expect(first.scheduler.bags.easy).toHaveLength(0); // easy drained
    // Draw easy again: re-bin refills easy from the pool (the same card returns).
    const second = drawNext(g, ratings, "u", { ...first.scheduler, topBag: ["easy"] }, () => 0);
    expect(makeCardId(second.card.statement.id, second.card.hiddenSlot)).toBe(makeCardId("geo:0", "object"));
    // Medium bag never touched by the easy draws.
    expect(second.scheduler.bags.medium).toEqual(mediumBefore);
  });

  it("falls back without stalling when a drawn tier has no eligible cards", () => {
    // No hard cards at all. Every hard marble must re-bin (empty), then redraw
    // another marble, and still hand out a real card.
    const g = graphOf(pool("geo", 5), ["geo"]);
    const d = tieredDifficulty("geo", 2, 3, 0); // zero hard
    const ratings = ratingsWith(d);
    let s = buildScheduler(g, ratings, "u", ["geo"], () => 0);
    // A top bag of only hard marbles: no hard cards exist, so it must fall
    // through to a fresh cycle and draw a real (easy/medium) card.
    s = { ...s, topBag: ["hard"] };
    const out = drawNext(g, ratings, "u", s, () => 0);
    expect(out.card).toBeDefined();
    expect(["easy", "medium"]).toContain(tierByProbability(makeCardId(out.card.statement.id, out.card.hiddenSlot), d));
  });

  it("shifts the tier a card sits in when its rating changes", () => {
    const g = graphOf(pool("geo", 1), ["geo"]);
    const cardId = makeCardId("geo:0", "object");
    // Rated hard → binned hard; re-rated easy → binned easy.
    expect(buildScheduler(g, ratingsWith({ [cardId]: HARD_D }), "u", ["geo"], () => 0).bags.hard).toHaveLength(1);
    expect(buildScheduler(g, ratingsWith({ [cardId]: EASY_D }), "u", ["geo"], () => 0).bags.easy).toHaveLength(1);
  });
});

describe("applySelection", () => {
  it("stops a deselected pack's cards immediately", () => {
    const g = graphOf([...pool("cities", 3), ...pool("langs", 3)], ["cities", "langs"]);
    const ratings = emptyRatings(); // all medium
    const s = buildScheduler(g, ratings, "u", ["cities", "langs"], () => 0);
    const after = applySelection(g, s, ["cities"]);
    const remaining = Object.values(after.bags).flat();
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every((id) => id.startsWith("cities:"))).toBe(true);
    expect(remaining.some((id) => id.startsWith("langs:"))).toBe(false);
    expect(after.included).toEqual(["cities"]);
  });

  it("draws a newly included pack's cards on the next re-bin", () => {
    const g = graphOf([...pool("cities", 2), ...pool("langs", 2)], ["cities", "langs"]);
    const ratings = emptyRatings();
    // Start on cities only, then include langs.
    let s = buildScheduler(g, ratings, "u", ["cities"], () => 0);
    s = applySelection(g, s, ["cities", "langs"]);
    // Drain until the medium bag re-bins; langs cards must appear.
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const out = drawNext(g, ratings, "u", s, () => 0.5);
      seen.add(out.card.statement.pack);
      s = out.scheduler;
    }
    expect(seen.has("langs")).toBe(true);
  });
});
