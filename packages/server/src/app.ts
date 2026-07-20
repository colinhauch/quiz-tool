import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  healthSchema,
  questionResponseSchema,
} from "@geo/contract";
import { checkAnswer, findCard, generateQuestion, type Pack, selectQuestion } from "@geo/engine";
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

  // The raw answer log for review, most recent first. The store keeps the log
  // in insertion order (it is an append log); reversing here is the view's
  // choice, not the store's. Each record's question text is re-derived from its
  // cardId — the prompt is a deterministic function of the card, so it isn't
  // stored — and falls back to the raw cardId if the card no longer resolves
  // (e.g. the pack changed). Parsed through the schema so the seam stays honest.
  app.get("/answers", (c) =>
    c.json(
      answerLogSchema.parse(
        [...store.all()]
          .reverse()
          .map((record) => ({ ...record, question: questionText(pack, record.cardId) })),
      ),
    ),
  );

  return app;
}

/**
 * The rendered prompt for a recorded card, re-derived from its id. Generation
 * is deterministic, so a stored answer can be shown its original question
 * without persisting the text. A stale id (its card gone from the pack) falls
 * back to the id itself rather than failing the whole log.
 */
function questionText(pack: Pack, cardId: string): string {
  try {
    const { statement, hiddenSlot } = findCard(pack, cardId);
    return generateQuestion(pack, statement, hiddenSlot).prompt;
  } catch {
    return cardId;
  }
}
