import { healthSchema } from "@geo/contract";
import { Hono } from "hono";

/**
 * Builds the Hono app. Kept separate from the Node server entrypoint so tests
 * can drive it in-process via `app.request()` with no network — the primary
 * integration seam for the walking skeleton.
 */
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));

  return app;
}
