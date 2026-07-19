import {
  answerRequestSchema,
  answerResponseSchema,
  healthSchema,
  questionResponseSchema,
} from "@geo/contract";
import { checkAnswer, type Pack, selectQuestion } from "@geo/engine";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AnswerStore } from "./storage.js";

export interface AppOptions {
  /** The loaded content pack the engine draws questions from. */
  pack: Pack;
  /** Where answered questions are persisted. */
  store: AnswerStore;
  /** Randomness source for card selection; injectable for deterministic tests. */
  rng?: () => number;
  /** Clock for answer timestamps; injectable for deterministic tests. */
  now?: () => Date;
}

/**
 * Builds the Hono app. Kept separate from the Node server entrypoint so tests
 * can drive it in-process via `app.request()` with no network — the primary
 * integration seam for the walking skeleton. Its dependencies (the pack, the
 * store, the rng/clock) are passed in rather than reached for, so the same
 * builder serves both the real startup wiring and fixtures under test.
 */
export function createApp({ pack, store, rng, now = () => new Date() }: AppOptions) {
  const app = new Hono();

  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));

  // A random rendered question. The response is parsed through the shared
  // schema so the server cannot drift from the contract the browser trusts —
  // and so an accidental answer leak fails here, at the seam.
  app.get("/question", (c) => c.json(questionResponseSchema.parse(selectQuestion(pack, rng))));

  // Judge a typed answer, persist it, and report the result. The engine judges
  // (pure); the store records (IO); the schema guards the seam both ways. This
  // is the one handler taking untrusted client input, so it maps a malformed
  // body or bad schema to 400 and an unknown card to 404, rather than letting
  // an internal throw surface as a 500 with a stack trace.
  app.post("/answer", async (c) => {
    let cardId: string;
    let input: string;
    try {
      ({ cardId, input } = answerRequestSchema.parse(await c.req.json()));
    } catch (err) {
      throw new HTTPException(400, { message: "malformed answer request", cause: err });
    }

    let result: ReturnType<typeof checkAnswer>;
    try {
      result = checkAnswer(pack, cardId, input);
    } catch (err) {
      throw new HTTPException(404, { message: `unknown card: ${cardId}`, cause: err });
    }

    store.record({ cardId, input, correct: result.correct, askedAt: now().toISOString() });
    return c.json(answerResponseSchema.parse(result));
  });

  return app;
}
