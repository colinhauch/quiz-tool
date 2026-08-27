import { adminHealthSchema } from "@geo/contract";
import type { Entity, Pack, Statement } from "@geo/engine";
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

describe("admin app", () => {
  it("serves a read-only health check over the in-process seam", async () => {
    const res = await createAdminApp({ pack: fixturePack() }).request("/health");
    expect(res.status).toBe(200);
    expect(adminHealthSchema.parse(await res.json())).toEqual({ status: "ok", readOnly: true });
  });
});
