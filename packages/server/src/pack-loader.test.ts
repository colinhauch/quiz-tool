import { questionResponseSchema } from "@geo/contract";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadCoreCitiesPack, mergePacks, selectPacks } from "./pack-loader.js";
import { createAnswerStore, openDatabase } from "./storage.js";

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});
const capitalOf: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} the capital of?`,
  input: "text",
});

function pack(entities: Entity[], statements: Statement[], generators: Record<string, Generator>): Pack {
  return { entities: new Map(entities.map((e) => [e.id, e])), statements, generators };
}

// A cities pack and a capitals pack that share the country node Q17 (Japan),
// each with its own relation and id prefix — the shape the real merge sees.
const cities = pack(
  [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ],
  [{ id: "cc:tokyo", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } }],
  { located_in: locatedIn },
);
const capitals = pack(
  [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ],
  [{ id: "cap:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
  { capital_of: capitalOf },
);

describe("mergePacks", () => {
  it("unions entities by Q-ID, collapsing a shared node to one", () => {
    const merged = mergePacks([cities, capitals]);
    expect(merged.entities.size).toBe(2);
    expect(merged.entities.get("Q17")?.labels.en).toBe("Japan");
  });

  it("concatenates statements from every pack in order", () => {
    const merged = mergePacks([cities, capitals]);
    expect(merged.statements.map((s) => s.id)).toEqual(["cc:tokyo", "cap:tokyo"]);
  });

  it("combines per-pack generators into one relation→generator table", () => {
    const merged = mergePacks([cities, capitals]);
    expect(Object.keys(merged.generators).sort()).toEqual(["capital_of", "located_in"]);
  });
});

describe("selectPacks", () => {
  const installed = ["core-cities", "capitals"];

  it("defaults to all installed packs when config is undefined", () => {
    expect(selectPacks(undefined, installed)).toEqual(installed);
  });

  it("defaults to all installed packs when config is empty", () => {
    expect(selectPacks("  ", installed)).toEqual(installed);
  });

  it("selects a single named pack", () => {
    expect(selectPacks("core-cities", installed)).toEqual(["core-cities"]);
  });

  it("selects a subset, trimming whitespace", () => {
    expect(selectPacks(" core-cities , capitals ", installed)).toEqual(["core-cities", "capitals"]);
  });
});

describe("two-pack graph over the server seam", () => {
  const memoryStore = () => createAnswerStore(openDatabase(":memory:"));

  it("asks questions from both packs, each card carrying its pack's id prefix", async () => {
    const merged = mergePacks([cities, capitals]);

    // rng=0 lands on the first (cities) statement, rng≈1 on the last (capitals).
    const first = questionResponseSchema.parse(
      await (await createApp({ pack: merged, store: memoryStore(), rng: () => 0 }).request("/question")).json(),
    );
    const last = questionResponseSchema.parse(
      await (
        await createApp({ pack: merged, store: memoryStore(), rng: () => 0.999 }).request("/question")
      ).json(),
    );

    expect(first).toEqual({
      cardId: "cc:tokyo:object",
      prompt: "What country is Tokyo in?",
      input: "text",
    });
    expect(last).toEqual({
      cardId: "cap:tokyo:object",
      prompt: "What country is Tokyo the capital of?",
      input: "text",
    });
  });
});

describe("loadCoreCitiesPack", () => {
  it("still loads the fixture pack unchanged", () => {
    const p = loadCoreCitiesPack();
    expect(p.statements.length).toBeGreaterThan(0);
    expect(p.generators.located_in).toBeTypeOf("function");
  });
});
