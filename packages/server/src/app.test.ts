import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerLogSchema,
  answerResponseSchema,
  entityListSchema,
  packListSchema,
  questionResponseSchema,
} from "@geo/contract";
import { type Entity, enumerateCards, type Generator, type Pack, type Statement } from "@geo/engine";
import { type CryptoKey, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadAllPacks } from "./pack-loader.js";
import {
  type AnswerStore,
  createAnswerStore,
  createSelectionStore,
  openDatabase,
  type SelectionStore,
} from "./storage.js";

/** The pack every fixture graph is assembled from, as the loader would register it. */
const TEST_PACK = { id: "test-pack", labels: { en: "Test Pack" }, version: "0.0.1" };
const packs = new Map([[TEST_PACK.id, TEST_PACK]]);

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
    { id: "S1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: TEST_PACK.id },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { located_in: locatedIn },
    packs,
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
    {
      id: "cap:switzerland-bern",
      subject: "Q39",
      relation: "capital",
      object: { kind: "entity", id: "Q70" },
      pack: TEST_PACK.id,
    },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { capital },
    hiddenSlots: { capital: ["object", "subject"] },
    packs,
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
      packId: TEST_PACK.id,
      packLabel: TEST_PACK.labels.en,
      answerTypes: ["country"],
    });
  });

  it("GET /question never leaks the answer over the seam", async () => {
    const res = await createApp({ pack: fixturePack(), store: memoryStore(), rng: () => 0 }).request(
      "/question",
    );
    expect(JSON.stringify(await res.json())).not.toContain("Japan");
  });
});

describe("GET /entities", () => {
  function app() {
    return createApp({ pack: fixturePack(), store: memoryStore(), rng: () => 0 });
  }

  it("returns every entity of the requested type as { id, label, aliases }", async () => {
    const res = await app().request("/entities?type=city");
    expect(res.status).toBe(200);
    expect(entityListSchema.parse(await res.json())).toEqual([
      { id: "Q1490", label: "Tokyo", aliases: [] },
    ]);
  });

  it("scopes to the requested type", async () => {
    const res = await app().request("/entities?type=country");
    expect(entityListSchema.parse(await res.json())).toEqual([
      { id: "Q17", label: "Japan", aliases: [] },
    ]);
  });

  it("returns an empty list for an unknown type", async () => {
    const res = await app().request("/entities?type=continent");
    expect(res.status).toBe(200);
    expect(entityListSchema.parse(await res.json())).toEqual([]);
  });

  it("flattens an entity's aliases into the list", async () => {
    const pack = fixturePack();
    pack.entities.set("Q1490", {
      id: "Q1490",
      labels: { en: "Tokyo" },
      aliases: { en: ["Tōkyō", "Edo"] },
      types: ["city"],
    });
    const res = await createApp({ pack, store: memoryStore(), rng: () => 0 }).request(
      "/entities?type=city",
    );
    expect(entityListSchema.parse(await res.json())).toEqual([
      { id: "Q1490", label: "Tokyo", aliases: ["Tōkyō", "Edo"] },
    ]);
  });

  it("surfaces an entity's short autocomplete form when it has one", async () => {
    const pack = fixturePack();
    pack.entities.set("Q4917", {
      id: "Q4917",
      labels: { en: "United States dollar" },
      aliases: { en: ["dollar", "dollars", "USD"] },
      autocomplete: "dollar",
      types: ["currency"],
    });
    const res = await createApp({ pack, store: memoryStore(), rng: () => 0 }).request(
      "/entities?type=currency",
    );
    expect(entityListSchema.parse(await res.json())).toEqual([
      { id: "Q4917", label: "United States dollar", aliases: ["dollar", "dollars", "USD"], autocomplete: "dollar" },
    ]);
  });

  it("rejects a request with no type", async () => {
    expect((await app().request("/entities")).status).toBe(400);
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
    expect(await store.all()).toEqual([
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
    expect(await store.all()).toEqual([]);
  });

  it("returns 404 for an unknown card and records nothing", async () => {
    const store = memoryStore();
    const res = await createApp({ pack: fixturePack(), store }).request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "S9:object", input: "x" }),
    });
    expect(res.status).toBe(404);
    expect(await store.all()).toEqual([]);
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
        acceptedAnswer: "Japan",
        askedAt: "2026-07-19T12:05:00.000Z",
      },
      {
        cardId: "S1:object",
        question: "What country is Tokyo in?",
        input: "japan",
        correct: true,
        acceptedAnswer: "Japan",
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

  it("re-derives each answer's accepted answer from its card, regardless of input", async () => {
    const store = memoryStore();
    await answer(store, "china", "2026-07-19T12:05:00.000Z");
    const res = await createApp({ pack: fixturePack(), store }).request("/answers");
    const [entry] = answerLogSchema.parse(await res.json());
    expect(entry?.acceptedAnswer).toBe("Japan");
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
    await store.record({
      cardId: "S9:object",
      input: "x",
      correct: false,
      askedAt: "2026-07-19T12:00:00.000Z",
    });
    const res = await createApp({ pack: fixturePack(), store }).request("/answers");
    const [entry] = answerLogSchema.parse(await res.json());
    expect(entry?.question).toBe("S9:object");
    expect(entry?.acceptedAnswer).toBeUndefined();
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
    const pack = await loadAllPacks();

    // Draw until Tokyo comes up rather than aiming rng at it: the queue shuffles,
    // so no seed reliably lands on one card. A pass is without replacement, so
    // every card arrives within one lap of the queue — which this also proves.
    const app = createApp({ pack, store });
    const cards = enumerateCards(pack);

    let question = questionResponseSchema.parse(await (await app.request("/question")).json());
    for (let draws = 1; question.cardId !== "cc:tokyo-japan:object"; draws++) {
      expect(draws).toBeLessThanOrEqual(cards.length);
      question = questionResponseSchema.parse(await (await app.request("/question")).json());
    }

    const res = await app.request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: question.cardId, input: "Japan" }),
    });
    const result = answerResponseSchema.parse(await res.json());
    expect(result).toEqual({
      correct: true,
      acceptedAnswer: "Japan",
      // The map pins the card's most locatable entity: Tokyo (city) over Japan
      // (country), even though the answer is Japan — the specific place is the
      // memory hook. Tokyo (Q1490) carries a real P625 coordinate (#110).
      revealVisual: {
        renderer: "map",
        entityId: "Q1490",
        lat: 35.68944444444445,
        lon: 139.69166666666666,
        label: "Tokyo",
      },
    });

    const recorded = await store.all();
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
        acceptedAnswer: "Japan",
        askedAt: recorded[0]?.askedAt,
      },
    ]);
    db.close();
  });
});


/**
 * A two-pack graph for the picker: `cities` yields one card, `continents` two,
 * and `core-geo` yields none at all — the entities-only shape that must never
 * appear as a checkbox.
 */
function pickerGraph(): Pack {
  const info = (id: string, label: string) => ({
    id,
    labels: { en: label },
    version: "1.2.3",
    descriptions: { en: `All about ${label}.` },
    license: "CC0-1.0",
    credits: [{ source: "Wikidata", retrieved: "2026-07-26" }],
  });
  const statements: Statement[] = [
    { id: "cc:tokyo", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "cities" },
    { id: "k:jp", subject: "Q1490", relation: "on_continent", object: { kind: "entity", id: "Q17" }, pack: "continents" },
    { id: "k:fr", subject: "Q17", relation: "on_continent", object: { kind: "entity", id: "Q1490" }, pack: "continents" },
  ];
  const entities: Entity[] = [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: { located_in: locatedIn, on_continent: locatedIn },
    packs: new Map(
      [info("cities", "Cities"), info("continents", "Continents"), info("core-geo", "Core Geography")].map((p) => [
        p.id,
        p,
      ]),
    ),
  };
}

function memorySelection(): SelectionStore {
  return createSelectionStore(openDatabase(":memory:"));
}

async function packList(app: ReturnType<typeof createApp>) {
  return packListSchema.parse(await (await app.request("/packs")).json());
}

function putPacks(app: ReturnType<typeof createApp>, packIds: string[]) {
  return app.request("/packs", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packIds }),
  });
}

describe("GET /packs", () => {
  it("lists the selectable packs with what their manifests say about them", async () => {
    const list = await packList(createApp({ pack: pickerGraph(), store: memoryStore() }));
    expect(list.packs.map((p) => p.id)).toEqual(["cities", "continents"]);
    expect(list.packs[0]).toMatchObject({
      id: "cities",
      label: "Cities",
      description: "All about Cities.",
      version: "1.2.3",
      license: "CC0-1.0",
      credits: [{ source: "Wikidata", retrieved: "2026-07-26" }],
      statementCount: 1,
      cardCount: 1,
      included: true,
    });
  });

  // core-geo is entities-only: a checkbox for it would do nothing either way.
  it("omits a pack that yields no questions", async () => {
    const list = await packList(createApp({ pack: pickerGraph(), store: memoryStore() }));
    expect(list.packs.map((p) => p.id)).not.toContain("core-geo");
  });

  it("reports how many questions are queued", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    expect((await packList(app)).queued).toBe(3);
    await app.request("/question");
    expect((await packList(app)).queued).toBe(2);
  });

  // First run selects everything, so adding the picker regresses nothing.
  it("includes every pack on a first run", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore(), selection: memorySelection() });
    expect((await packList(app)).packs.every((p) => p.included)).toBe(true);
  });

  // A pack the catalog hides is loaded into the graph like any other, but never
  // offered as a choice — the retired core-cities is the first real one.
  it("omits a pack the catalog hides", async () => {
    const catalog = new Map([["cities", { hidden: true }]]);
    const list = await packList(createApp({ pack: pickerGraph(), store: memoryStore(), catalog }));
    expect(list.packs.map((p) => p.id)).toEqual(["continents"]);
  });

  it("never draws a card from a hidden pack", async () => {
    const catalog = new Map([["cities", { hidden: true }]]);
    const app = createApp({ pack: pickerGraph(), store: memoryStore(), catalog });
    // continents contributes two cards; a hidden cities card would push this past two.
    expect((await packList(app)).queued).toBe(2);
  });
});

describe("PUT /packs", () => {
  it("stops drawing questions from a deselected pack", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    expect((await putPacks(app, ["continents"])).status).toBe(200);

    // A pass is without replacement, so a few draws cover the whole selection.
    for (let i = 0; i < 4; i++) {
      const q = questionResponseSchema.parse(await (await app.request("/question")).json());
      expect(q.packId).toBe("continents");
    }
  });

  it("reports the new selection back through GET /packs", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    await putPacks(app, ["continents"]);
    const list = await packList(app);
    expect(list.packs.find((p) => p.id === "cities")?.included).toBe(false);
    expect(list.packs.find((p) => p.id === "continents")?.included).toBe(true);
  });

  it("folds a re-included pack back into the queue", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    await putPacks(app, ["continents"]);
    await putPacks(app, ["cities", "continents"]);
    expect((await packList(app)).queued).toBe(3);
  });

  it("persists the selection so a restart keeps it", async () => {
    const selection = createSelectionStore(openDatabase(":memory:"));
    await putPacks(createApp({ pack: pickerGraph(), store: memoryStore(), selection }), ["continents"]);

    // A second app over the same store is what a restart looks like.
    const list = await packList(createApp({ pack: pickerGraph(), store: memoryStore(), selection }));
    expect(list.packs.find((p) => p.id === "cities")?.included).toBe(false);
    expect(list.packs.find((p) => p.id === "continents")?.included).toBe(true);
  });

  // Empty is refused rather than treated as "unfiltered", which would have the
  // UI show every box clear while questions kept arriving.
  it("refuses an empty selection", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    expect((await putPacks(app, [])).status).toBe(400);
  });

  it("refuses a pack that is not selectable", async () => {
    const app = createApp({ pack: pickerGraph(), store: memoryStore() });
    expect((await putPacks(app, ["core-geo"])).status).toBe(400);
    expect((await putPacks(app, ["nonesuch"])).status).toBe(400);
  });

  // The constraint the whole design rests on: deselecting must never make
  // history unreadable. /answer and /answers resolve against the full graph.
  it("leaves the answer log readable after its pack is deselected", async () => {
    const store = memoryStore();
    const app = createApp({ pack: pickerGraph(), store });

    // Answer the cities card, then deselect cities entirely.
    let cardId = "";
    for (let i = 0; i < 3 && !cardId; i++) {
      const q = questionResponseSchema.parse(await (await app.request("/question")).json());
      if (q.packId === "cities") cardId = q.cardId;
    }
    expect(cardId).toBe("cc:tokyo:object");
    const answer = () =>
      app.request("/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, input: "Japan" }),
      });
    await answer();

    await putPacks(app, ["continents"]);

    // Still answerable, and still rendered with its real prompt rather than a
    // fallback to the raw cardId.
    expect((await answer()).status).toBe(200);

    const log = answerLogSchema.parse(await (await app.request("/answers")).json());
    expect(log).toHaveLength(2);
    expect(log[0]?.question).toBe("What country is Tokyo in?");
  });
});

// Multi-user mode: instead of one injected store and one queue, the app verifies
// a Supabase JWT per request, builds the caller's stores from their user-scoped
// client, and keeps that user's queue keyed by their id. Tests inject the
// verification key (a locally generated ES256 keypair) and per-user in-memory
// stores keyed by the verified subject — standing in for the RLS-scoped Supabase
// stores production would build from each caller's client.
describe("multi-user mode", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("ES256"));
  });

  function token(sub: string) {
    return new SignJWT({ sub, role: "authenticated" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  async function bearer(sub: string) {
    return { Authorization: `Bearer ${await token(sub)}` };
  }

  /** Per-user in-memory stores, created on first sight of a subject. */
  function perUserStores() {
    const byUser = new Map<string, { store: AnswerStore; selection: SelectionStore }>();
    return (_client: unknown, userId: string) => {
      let stores = byUser.get(userId);
      if (!stores) {
        const db = openDatabase(":memory:");
        stores = { store: createAnswerStore(db), selection: createSelectionStore(db) };
        byUser.set(userId, stores);
      }
      return stores;
    };
  }

  function multiUserApp() {
    return createApp({
      pack: pickerGraph(),
      rng: () => 0,
      auth: {
        jwks: publicKey,
        supabaseUrl: "https://project.supabase.co",
        supabaseKey: "sb_publishable_test",
      },
      storesForUser: perUserStores(),
    });
  }

  it("leaves /health public but guards the data routes", async () => {
    const app = multiUserApp();
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/question")).status).toBe(401);
    expect((await app.request("/packs")).status).toBe(401);
  });

  it("serves a signed-in learner their questions", async () => {
    const app = multiUserApp();
    const res = await app.request("/question", { headers: await bearer("user-a") });
    expect(res.status).toBe(200);
    expect(questionResponseSchema.parse(await res.json()).cardId).toBeTruthy();
  });

  it("isolates one learner's pack selection from another's", async () => {
    const app = multiUserApp();

    // User A narrows to just cities; user B never touches their selection.
    const putRes = await app.request("/packs", {
      method: "PUT",
      headers: { "content-type": "application/json", ...(await bearer("user-a")) },
      body: JSON.stringify({ packIds: ["cities"] }),
    });
    expect(putRes.status).toBe(200);

    const aList = packListSchema.parse(
      await (await app.request("/packs", { headers: await bearer("user-a") })).json(),
    );
    const bList = packListSchema.parse(
      await (await app.request("/packs", { headers: await bearer("user-b") })).json(),
    );

    const included = (list: typeof aList) =>
      list.packs.filter((p) => p.included).map((p) => p.id).sort();
    expect(included(aList)).toEqual(["cities"]);
    // B is a first run: default is every selectable pack, untouched by A's save.
    expect(included(bList)).toEqual(["cities", "continents"]);
  });

  it("isolates one learner's answer log from another's", async () => {
    const app = multiUserApp();
    const card = questionResponseSchema.parse(
      await (await app.request("/question", { headers: await bearer("user-a") })).json(),
    ).cardId;

    await app.request("/answer", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await bearer("user-a")) },
      body: JSON.stringify({ cardId: card, input: "Japan" }),
    });

    const aLog = answerLogSchema.parse(
      await (await app.request("/answers", { headers: await bearer("user-a") })).json(),
    );
    const bLog = answerLogSchema.parse(
      await (await app.request("/answers", { headers: await bearer("user-b") })).json(),
    );
    expect(aLog).toHaveLength(1);
    expect(bLog).toEqual([]);
  });
});
