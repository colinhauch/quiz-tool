import {
  adminEntityDetailSchema,
  adminGraphHealthReportSchema,
  adminHealthSchema,
  adminPackDetailSchema,
  adminPackListSchema,
} from "@geo/contract";
import type { Entity, Pack, Statement } from "@geo/engine";
import type { LoadedPack } from "@geo/server/pack-loader";
import { describe, expect, it } from "vitest";
import { createAdminApp } from "./admin-app.js";

/** The pack every admin fixture graph is assembled from, as the loader registers it. */
const TEST_PACK = { id: "test-pack", labels: { en: "Test Pack" }, version: "0.0.1" };

/**
 * A minimal assembled graph, mirroring `fixturePack()` in the server's
 * `app.test.ts`. Enough for the skeleton; the surface slices extend it.
 */
export function fixturePack(): Pack {
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
    generators: {
      located_in: ({ statement, graph }) => ({
        prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
        input: "text",
      }),
    },
    packs: new Map([[TEST_PACK.id, TEST_PACK]]),
  };
}

/**
 * The raw per-pack sources behind `fixturePack()`, for the routes that need
 * ownership attribution (Packs detail, Entity detail, Graph Health). A route
 * test passes this explicitly so it never touches disk — see `ownership.ts`.
 */
function fixturePackSources(): LoadedPack[] {
  return [
    {
      id: TEST_PACK.id,
      dirName: TEST_PACK.id,
      dir: new URL("file:///packs/test-pack/"),
      manifest: {
        id: TEST_PACK.id,
        version: TEST_PACK.version,
        labels: TEST_PACK.labels,
        relations: { located_in: { labels: { en: "is in country" } } },
      },
      entities: new Map([
        ["Q1490", { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] }],
        ["Q17", { id: "Q17", labels: { en: "Japan" }, types: ["country"] }],
      ]),
      statements: [],
      generators: {},
    } as LoadedPack,
  ];
}

describe("admin app", () => {
  it("serves a read-only health check over the in-process seam", async () => {
    const res = await createAdminApp({ pack: fixturePack() }).request("/health");
    expect(res.status).toBe(200);
    expect(adminHealthSchema.parse(await res.json())).toEqual({ status: "ok", readOnly: true });
  });

  it("lists packs, including any with no statements", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/packs");
    expect(res.status).toBe(200);
    const body = adminPackListSchema.parse(await res.json());
    expect(body).toEqual([
      {
        id: "test-pack",
        label: "Test Pack",
        version: "0.0.1",
        license: undefined,
        credits: undefined,
        statementCount: 1,
        cardCount: 1,
      },
    ]);
  });

  it("serves a pack's detail with its owned entities and relation groups", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/packs/test-pack");
    expect(res.status).toBe(200);
    const body = adminPackDetailSchema.parse(await res.json());
    expect(body.entities.map((e) => e.id).sort()).toEqual(["Q1490", "Q17"]);
    expect(body.relations).toEqual([
      {
        relation: "located_in",
        definedHere: true,
        definedBy: undefined,
        statements: [
          {
            id: "S1",
            relation: "located_in",
            subject: { id: "Q1490", label: "Tokyo" },
            object: { kind: "entity", entity: { id: "Q17", label: "Japan" } },
            packId: "test-pack",
          },
        ],
      },
    ]);
  });

  it("404s a pack detail request for an unknown pack", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/packs/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("serves an entity's rich view with its statements and owner pack", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/entities/Q1490");
    expect(res.status).toBe(200);
    const body = adminEntityDetailSchema.parse(await res.json());
    expect(body.label).toBe("Tokyo");
    expect(body.ownerPackId).toBe("test-pack");
    expect(body.statements).toHaveLength(1);
  });

  it("404s an entity request for an unknown id", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/entities/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("serves the graph health report", async () => {
    const app = createAdminApp({ pack: fixturePack(), packSources: fixturePackSources() });
    const res = await app.request("/health/graph");
    expect(res.status).toBe(200);
    const body = adminGraphHealthReportSchema.parse(await res.json());
    expect(body.checks.map((c) => c.id).sort()).toEqual([
      "duplicate-ownership",
      "missing-visual-aid",
      "orphaned-entities",
      "uncovered-statements",
    ]);
  });
});
