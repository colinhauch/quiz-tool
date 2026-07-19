import { questionResponseSchema } from "@geo/contract";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadCoreCitiesPack } from "./pack-loader.js";

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});

function fixturePack(): Pack {
  const entities: Entity[] = [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ];
  const statements: Statement[] = [
    { id: "S1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } },
  ];
  return { entities: new Map(entities.map((e) => [e.id, e])), statements, generators: { located_in: locatedIn } };
}

describe("server app", () => {
  it("serves a health check over the in-process seam", async () => {
    const res = await createApp({ pack: fixturePack() }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /question returns a rendered question that validates against the contract", async () => {
    const res = await createApp({ pack: fixturePack(), rng: () => 0 }).request("/question");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(questionResponseSchema.parse(body)).toEqual({
      cardId: "S1:object",
      prompt: "What country is Tokyo in?",
      input: "text",
    });
  });

  it("GET /question never leaks the answer over the seam", async () => {
    const res = await createApp({ pack: fixturePack(), rng: () => 0 }).request("/question");
    expect(JSON.stringify(await res.json())).not.toContain("Japan");
  });
});

describe("server app over the real fixture pack", () => {
  it("loads core-cities from disk and serves a valid question end to end", async () => {
    const app = createApp({ pack: loadCoreCitiesPack(), rng: () => 0 });
    const res = await app.request("/question");
    expect(res.status).toBe(200);
    const question = questionResponseSchema.parse(await res.json());
    // First card by the fixture's file order is Tokyo → Japan.
    expect(question.prompt).toBe("What country is Tokyo in?");
    expect(question.input).toBe("text");
  });
});
