import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog.js";
import { loadedCatalog } from "./packs.generated.js";
import worker from "./worker.js";

/**
 * Smoke test for the Cloudflare Worker entry: it must build the app from the
 * bundled pack graph and wire Supabase-backed auth, without a filesystem. We
 * don't re-test route behavior here (app.test.ts owns that via createApp) —
 * only that the entry assembles and guards. A fake env is enough: /health never
 * touches auth, and the 401 path is rejected on the missing token before any
 * key or network is consulted.
 */
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("worker entry", () => {
  it("serves /health from the bundled graph", async () => {
    const res = await worker.fetch(new Request("https://quiz.example/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("guards the data routes: 401 without a bearer token", async () => {
    const res = await worker.fetch(new Request("https://quiz.example/question"), env);
    expect(res.status).toBe(401);
  });

  it("strips the /api prefix so the UI's production paths hit the same routes", async () => {
    // The SPA calls /api/*; in dev the Vite proxy strips it, in prod this Worker
    // does (wrangler.toml routes /api/* here). /api/question must reach the same
    // guarded /question route — a 401 (not a 404) proves the rewrite landed.
    const res = await worker.fetch(new Request("https://quiz.example/api/question"), env);
    expect(res.status).toBe(401);
  });

  // Regression: the Worker had no filesystem to read packs/catalog.json, so it
  // passed no catalog and every hidden pack (core-cities) showed in deployed
  // environments. The catalog is now bundled; the entry parses and applies it.
  it("bundles the visibility catalog so hidden packs stay hidden in production", () => {
    expect(parseCatalog(loadedCatalog).get("core-cities")?.hidden).toBe(true);
  });
});
