import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerLogSchema, answerResponseSchema, questionResponseSchema } from "@geo/contract";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadCoreCitiesPack } from "./pack-loader.js";
import { type AnswerStore, createAnswerStore, openDatabase } from "./storage.js";

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
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { located_in: locatedIn },
  };
}

// A `capital` relation quizzed both ways, so the answer log has a subject-hidden
// card to re-derive a prompt for.
const capital: Generator = ({ statement, hiddenSlot, graph }) => {
  const country = graph.getEntity(statement.subject).labels.en;
  const city = graph.getEntity((statement.object as { id: string }).id).labels.en;
  return hiddenSlot === "subject"
    ? { prompt: `${city} is the capital of what country?`, input: "text" }
    : { prompt: `What is the capital of ${country}?`, input: "text" };
};

function bidiPack(): Pack {
  const entities: Entity[] = [
    { id: "Q39", labels: { en: "Switzerland" }, types: ["country"] },
    { id: "Q70", labels: { en: "Bern" }, types: ["city"] },
  ];
  const statements: Statement[] = [
    { id: "cap:switzerland-bern", subject: "Q39", relation: "capital", object: { kind: "entity", id: "Q70" } },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { capital },
    hiddenSlots: { capital: ["object", "subject"] },
  };
}

function memoryStore(): AnswerStore {
  return createAnswerStore(openDatabase(":memory:"));
}

describe("server app", () => {
  it("serves a health check over the in-process seam", async () => {
    const res = await createApp({ pack: fixturePack(), store: memoryStore() }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /question returns a rendered question that validates against the contract", async () => {
    const res = await createApp({ pack: fixturePack(), store: memoryStore(), rng: () => 0 }).request(
      "/question",
    );
    expect(res.status).toBe(200);
    expect(questionResponseSchema.parse(await res.json())).toEqual({
      cardId: "S1:object",
      prompt: "What country is Tokyo in?",
      input: "text",
    });
  });

  it("GET /question never leaks the answer over the seam", async () => {
    const res = await createApp({ pack: fixturePack(), store: memoryStore(), rng: () => 0 }).request(
      "/question",
    );
    expect(JSON.stringify(await res.json())).not.toContain("Japan");
  });
});

describe("POST /answer", () => {
  async function answer(store: AnswerStore, input: string) {
    return createApp({ pack: fixturePack(), store, now: () => new Date("2026-07-19T12:00:00.000Z") }).request(
      "/answer",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: "S1:object", input }),
      },
    );
  }

  it("reports a correct answer and validates against the contract", async () => {
    const res = await answer(memoryStore(), "japan");
    expect(res.status).toBe(200);
    expect(answerResponseSchema.parse(await res.json())).toEqual({
      correct: true,
      acceptedAnswer: "Japan",
    });
  });

  it("reports a wrong answer but still reveals the accepted label", async () => {
    const res = await answer(memoryStore(), "China");
    expect(answerResponseSchema.parse(await res.json())).toEqual({
      correct: false,
      acceptedAnswer: "Japan",
    });
  });

  it("persists the answer it recorded", async () => {
    const store = memoryStore();
    await answer(store, "japan");
    expect(store.all()).toEqual([
      {
        cardId: "S1:object",
        input: "japan",
        correct: true,
        askedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);
  });

  it("returns 400 on a malformed request body and records nothing", async () => {
    const store = memoryStore();
    const res = await createApp({ pack: fixturePack(), store }).request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "S1:object" }), // missing input
    });
    expect(res.status).toBe(400);
    expect(store.all()).toEqual([]);
  });

  it("returns 404 for an unknown card and records nothing", async () => {
    const store = memoryStore();
    const res = await createApp({ pack: fixturePack(), store }).request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "S9:object", input: "x" }),
    });
    expect(res.status).toBe(404);
    expect(store.all()).toEqual([]);
  });
});

describe("GET /answers", () => {
  async function answer(store: AnswerStore, input: string, at: string) {
    return createApp({ pack: fixturePack(), store, now: () => new Date(at) }).request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "S1:object", input }),
    });
  }

  it("returns an empty log before anything is answered, typed via the contract", async () => {
    const res = await createApp({ pack: fixturePack(), store: memoryStore() }).request("/answers");
    expect(res.status).toBe(200);
    expect(answerLogSchema.parse(await res.json())).toEqual([]);
  });

  it("returns recorded answers most recent first", async () => {
    const store = memoryStore();
    await answer(store, "japan", "2026-07-19T12:00:00.000Z");
    await answer(store, "china", "2026-07-19T12:05:00.000Z");

    const res = await createApp({ pack: fixturePack(), store }).request("/answers");
    expect(answerLogSchema.parse(await res.json())).toEqual([
      {
        cardId: "S1:object",
        question: "What country is Tokyo in?",
        input: "china",
        correct: false,
        askedAt: "2026-07-19T12:05:00.000Z",
      },
      {
        cardId: "S1:object",
        question: "What country is Tokyo in?",
        input: "japan",
        correct: true,
        askedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);
  });

  it("re-derives each answer's question text from its card", async () => {
    const store = memoryStore();
    await answer(store, "japan", "2026-07-19T12:00:00.000Z");
    const res = await createApp({ pack: fixturePack(), store }).request("/answers");
    const [entry] = answerLogSchema.parse(await res.json());
    expect(entry?.question).toBe("What country is Tokyo in?");
  });

  it("re-derives a subject-hidden card's question text from its card", async () => {
    const store = memoryStore();
    await createApp({ pack: bidiPack(), store, now: () => new Date("2026-07-19T12:00:00.000Z") }).request(
      "/answer",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: "cap:switzerland-bern:subject", input: "Switzerland" }),
      },
    );
    const res = await createApp({ pack: bidiPack(), store }).request("/answers");
    const [entry] = answerLogSchema.parse(await res.json());
    expect(entry?.question).toBe("Bern is the capital of what country?");
    expect(entry?.correct).toBe(true);
  });

  it("falls back to the raw cardId when the card no longer resolves", async () => {
    const store = memoryStore();
    store.record({
      cardId: "S9:object",
      input: "x",
      correct: false,
      askedAt: "2026-07-19T12:00:00.000Z",
    });
    const res = await createApp({ pack: fixturePack(), store }).request("/answers");
    const [entry] = answerLogSchema.parse(await res.json());
    expect(entry?.question).toBe("S9:object");
  });
});

describe("full loop over the real fixture pack and a temp-file database", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("GET /question → POST /answer returns a result and lands in the database", async () => {
    dir = mkdtempSync(join(tmpdir(), "geo-loop-"));
    const db = openDatabase(join(dir, "answers.sqlite"));
    const store = createAnswerStore(db);
    const app = createApp({ pack: loadCoreCitiesPack(), store, rng: () => 0 });

    const question = questionResponseSchema.parse(await (await app.request("/question")).json());
    expect(question.prompt).toBe("What country is Tokyo in?");

    const res = await app.request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: question.cardId, input: "Japan" }),
    });
    const result = answerResponseSchema.parse(await res.json());
    expect(result).toEqual({ correct: true, acceptedAnswer: "Japan" });

    const recorded = store.all();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.cardId).toBe(question.cardId);
    expect(recorded[0]?.correct).toBe(true);

    const log = answerLogSchema.parse(await (await app.request("/answers")).json());
    expect(log).toEqual([
      {
        cardId: question.cardId,
        question: question.prompt,
        input: "Japan",
        correct: true,
        askedAt: recorded[0]?.askedAt,
      },
    ]);
    db.close();
  });
});
