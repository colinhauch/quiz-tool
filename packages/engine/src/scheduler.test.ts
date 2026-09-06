import { describe, expect, it } from "vitest";
import { type Card, makeCardId } from "./card.js";
import { type Ratings, SEED_RATING, emptyRatings } from "./rating.js";
import {
  applySelection,
  buildScheduler,
  drawNext,
  eligibleCards,
  markAnswered,
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

const cardId = (card: Card): string => makeCardId(card.statement.id, card.hiddenSlot);

const tierByProbability = (id: string, d: Record<string, number>): string => {
  const diff = d[id] ?? SEED_RATING;
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
    expect(() => buildScheduler(g, ["geo"], () => 0, gappy)).toThrow(/contiguous|cover/);
  });

  it("refuses a selection that yields no eligible cards", () => {
    const g = graphOf(pool("geo", 3), ["geo"]);
    expect(() => buildScheduler(g, [], () => 0)).toThrow(/no eligible cards/);
    expect(() => buildScheduler(g, ["other"], () => 0)).toThrow(/no eligible cards/);
  });

  it("carries the selection and never binds ratings into fresh state", () => {
    // A fresh build no longer needs ratings — difficulty is filtered live at draw
    // time — so the only thing it records is the selection and the empty draw.
    const g = graphOf(pool("geo", 3), ["geo"]);
    const s = buildScheduler(g, ["geo"], () => 0);
    expect(s.included).toEqual(["geo"]);
    expect(s.drawn).toEqual([]);
    expect(s.current).toBeNull();
  });
});

describe("drawNext", () => {
  it("honours the tier ratio exactly over a full difficulty cycle, no within-cycle repeats", () => {
    // Enough distinct cards per tier that one cycle never empties a slice, so
    // each drawn card's tier equals the marble that drew it.
    const stmts = pool("geo", 12);
    const g = graphOf(stmts, ["geo"]);
    const d = tieredDifficulty("geo", 4, 5, 3); // easy 4, medium 5, hard 3
    const ratings = ratingsWith(d);
    const rng = seeded([0.1, 0.42, 0.73, 0.9, 0.27, 0.55, 0.83, 0.05, 0.61, 0.36, 0.7, 0.2]);

    let s: Scheduler = buildScheduler(g, ["geo"], rng);
    const drawnTiers: string[] = [];
    const drawnCards: string[] = [];
    const cycle = 6; // DEFAULT_TIERS marbles: hard 1 + medium 3 + easy 2
    for (let i = 0; i < cycle; i++) {
      const out = drawNext(g, ratings, "u", s, rng);
      const id = cardId(out.card);
      drawnCards.push(id);
      drawnTiers.push(tierByProbability(id, d));
      s = out.scheduler;
    }
    const tierCounts = drawnTiers.reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});
    expect(tierCounts).toEqual({ hard: 1, medium: 3, easy: 2 });
    expect(new Set(drawnCards).size).toBe(cycle); // no card repeated within the cycle
  });

  it("is deterministic under a seeded rng", () => {
    const g = graphOf(pool("geo", 12), ["geo"]);
    const d = tieredDifficulty("geo", 4, 5, 3);
    const ratings = ratingsWith(d);
    const draw = () => {
      const rng = seeded([0.13, 0.62, 0.44, 0.9, 0.05, 0.71, 0.38, 0.22, 0.5, 0.81, 0.03, 0.66]);
      let s = buildScheduler(g, ["geo"], rng);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const out = drawNext(g, ratings, "u", s, rng);
        ids.push(cardId(out.card));
        s = out.scheduler;
      }
      return ids;
    };
    expect(draw()).toEqual(draw());
  });

  it("honours the pack ratio over a pack cycle, spreading across selected packs", () => {
    // Two packs, one marble each (default ratio), each with a full tier spread so
    // no slice is ever empty. Over four draws (two pack cycles) each pack appears
    // exactly twice — the draw does not get stuck on one pack.
    const g = graphOf([...pool("a", 9), ...pool("b", 9)], ["a", "b"]);
    const ratings = ratingsWith({ ...tieredDifficulty("a", 3, 3, 3), ...tieredDifficulty("b", 3, 3, 3) });
    const rng = seeded([0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.15, 0.85, 0.35]);
    let s = buildScheduler(g, ["a", "b"], rng);
    const packs: string[] = [];
    for (let i = 0; i < 4; i++) {
      const out = drawNext(g, ratings, "u", s, rng);
      packs.push(out.card.statement.pack);
      s = out.scheduler;
    }
    const counts = packs.reduce<Record<string, number>>((m, p) => ((m[p] = (m[p] ?? 0) + 1), m), {});
    expect(counts).toEqual({ a: 2, b: 2 });
  });

  it("sets current to the drawn card and excludes every prior draw within a pass", () => {
    const g = graphOf(pool("geo", 6), ["geo"]); // all medium
    const rng = seeded([0.11, 0.37, 0.59, 0.83, 0.05, 0.71, 0.29, 0.47]);
    let s = buildScheduler(g, ["geo"], rng);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const out = drawNext(g, emptyRatings(), "u", s, rng);
      const id = cardId(out.card);
      expect(out.scheduler.current).toBe(id); // current holds the just-drawn card
      seen.push(id);
      s = out.scheduler;
    }
    expect(new Set(seen).size).toBe(6); // a whole pass before any repeat
  });

  it("markAnswered clears current and keeps the card in drawn", () => {
    const g = graphOf(pool("geo", 3), ["geo"]);
    const out = drawNext(g, emptyRatings(), "u", buildScheduler(g, ["geo"], () => 0), () => 0);
    const id = cardId(out.card);
    const after = markAnswered(out.scheduler, id);
    expect(after.current).toBeNull();
    expect(after.drawn).toContain(id);
  });

  it("slice refill re-admits a drawn card and re-bins it by live difficulty", () => {
    // Draw geo:0 as a medium card, then re-rate it hard. Drawing the hard slice
    // (now holding only geo:0, which is excluded) must refill that slice and hand
    // geo:0 back — proof the exclusion clears per slice AND the card re-bins live.
    const g = graphOf(pool("geo", 3), ["geo"]);
    const c0 = makeCardId("geo:0", "object");
    const s0 = { ...buildScheduler(g, ["geo"], () => 0), difficultyBag: ["medium"] };
    const first = drawNext(g, emptyRatings(), "u", s0, () => 0);
    expect(cardId(first.card)).toBe(c0);
    expect(first.scheduler.drawn).toContain(c0);

    const hardRatings = ratingsWith({ [c0]: HARD_D });
    const second = drawNext(g, hardRatings, "u", { ...first.scheduler, difficultyBag: ["hard"] }, () => 0);
    expect(cardId(second.card)).toBe(c0); // re-admitted in the hard band it now belongs to
  });

  it("does not stall when a difficulty marble points at a tier with no cards", () => {
    // [risk: draw-loop budget] — all-medium pool, but a lone hard marble. The
    // empty hard slice must fall through to a real (medium) card, never spin.
    const g = graphOf(pool("geo", 5), ["geo"]);
    const s = { ...buildScheduler(g, ["geo"], () => 0), difficultyBag: ["hard"] };
    const out = drawNext(g, emptyRatings(), "u", s, () => 0);
    expect(out.card).toBeDefined();
    expect(tierByProbability(cardId(out.card), {})).toBe("medium");
  });

  it("throws when the pool is genuinely empty", () => {
    // [risk: draw-loop budget] — the other end of the bound: an empty selection
    // yields nothing, and the bounded loop must conclude empty rather than spin.
    const g = graphOf(pool("geo", 3), ["geo"]);
    const empty: Scheduler = { ...buildScheduler(g, ["geo"], () => 0), included: [], packBag: [], packRatio: {} };
    expect(() => drawNext(g, emptyRatings(), "u", empty, () => 0)).toThrow(/no eligible cards/);
  });
});

describe("applySelection", () => {
  it("stops a deselected pack immediately and keeps the other flowing", () => {
    const g = graphOf([...pool("cities", 3), ...pool("langs", 3)], ["cities", "langs"]);
    let s = applySelection(g, buildScheduler(g, ["cities", "langs"], () => 0), ["cities"]);
    expect(s.included).toEqual(["cities"]);
    for (let i = 0; i < 6; i++) {
      const out = drawNext(g, emptyRatings(), "u", { ...s, difficultyBag: ["medium"] }, () => 0);
      expect(out.card.statement.pack).toBe("cities");
      s = out.scheduler;
    }
  });

  it("drops a deselected pack's cards (and a stale current) from drawn", () => {
    const g = graphOf([...pool("cities", 2), ...pool("langs", 2)], ["cities", "langs"]);
    // Draw a langs card so it lands in drawn and as current.
    const drawnLangs = drawNext(
      g,
      emptyRatings(),
      "u",
      { ...buildScheduler(g, ["cities", "langs"], () => 0), difficultyBag: ["medium"], packBag: ["langs"] },
      () => 0,
    );
    expect(drawnLangs.card.statement.pack).toBe("langs");
    const after = applySelection(g, drawnLangs.scheduler, ["cities"]);
    expect(after.drawn.some((id) => id.startsWith("langs:"))).toBe(false);
    expect(after.current).toBeNull();
  });

  it("makes a re-selected pack drawable on the very next draw", () => {
    const g = graphOf([...pool("cities", 3), ...pool("langs", 3)], ["cities", "langs"]);
    let s = applySelection(g, buildScheduler(g, ["cities", "langs"], () => 0), ["cities"]); // drop langs
    s = applySelection(g, s, ["cities", "langs"]); // add it back
    const out = drawNext(g, emptyRatings(), "u", { ...s, difficultyBag: ["medium"] }, () => 0);
    expect(out.card.statement.pack).toBe("langs"); // the appended marble draws first
  });

  // The committed repro of "all packs selected but only flag questions"
  // (sdlc/features/persist-bag-state/intent.md). A large pack was included when
  // the scheduler was built, then more packs are selected. With the old
  // materialized bags the new pack stayed invisible for ~50 draws; the filtered
  // draw appends the new pack's marble so it surfaces at once.
  it("surfaces a newly included pack within a few cycles at real pool sizes", () => {
    const g = graphOf([...pool("flags", 50), ...pool("cities", 5)], ["flags", "cities"]);
    const ratings = emptyRatings(); // all medium
    let s = buildScheduler(g, ["flags"], () => 0.5);
    s = applySelection(g, s, ["flags", "cities"]); // learner selects all packs
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const out = drawNext(g, ratings, "u", s, () => 0.5);
      seen.add(out.card.statement.pack);
      s = out.scheduler;
    }
    expect(seen.has("cities")).toBe(true);
  });
});
