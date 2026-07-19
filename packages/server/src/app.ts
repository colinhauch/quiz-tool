import { healthSchema, questionResponseSchema } from "@geo/contract";
import { type Pack, selectQuestion } from "@geo/engine";
import { Hono } from "hono";

export interface AppOptions {
  /** The loaded content pack the engine draws questions from. */
  pack: Pack;
  /** Randomness source for card selection; injectable for deterministic tests. */
  rng?: () => number;
}

/**
 * Builds the Hono app. Kept separate from the Node server entrypoint so tests
 * can drive it in-process via `app.request()` with no network — the primary
 * integration seam for the walking skeleton. Its dependencies (the pack, the
 * rng) are passed in rather than reached for, so the same builder serves both
 * the real startup wiring and a hand-made fixture under test.
 */
export function createApp({ pack, rng }: AppOptions) {
  const app = new Hono();

  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));

  // A random rendered question. The response is parsed through the shared
  // schema so the server cannot drift from the contract the browser trusts —
  // and so an accidental answer leak fails here, at the seam.
  app.get("/question", (c) => c.json(questionResponseSchema.parse(selectQuestion(pack, rng))));

  return app;
}
