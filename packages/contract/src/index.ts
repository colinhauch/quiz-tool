import { z } from "zod";

/**
 * The typed HTTP seam between the Node server and the browser.
 *
 * This package is dependency-free apart from zod: both `@geo/server` and
 * `@geo/web` import these schemas so the contract has a single source of
 * truth. Nothing Node-native may ever land here, or `web` would pull it in.
 *
 * Route schemas arrive with the slices that add the routes (see #12–#14).
 */

export const healthSchema = z.object({
  status: z.literal("ok"),
});

export type Health = z.infer<typeof healthSchema>;

/**
 * `GET /question` — a rendered question ready to display. It carries a stable
 * `cardId` for the card being asked, the prompt, the input mode, and which pack
 * the question came from. It deliberately does NOT carry the answer: the seam
 * must never reveal it.
 *
 * Provenance crosses the seam resolved rather than raw: the client is handed a
 * label to show, not an id to interpret. The UI used to derive the pack from
 * the `cardId` prefix, which coupled it to the id format and got the answer
 * wrong once two packs shared a prefix (#40).
 */
export const questionResponseSchema = z
  .object({
    cardId: z.string().min(1),
    prompt: z.string().min(1),
    input: z.literal("text"),
    packId: z.string().min(1),
    packLabel: z.string().min(1),
  })
  .strict();

export type QuestionResponse = z.infer<typeof questionResponseSchema>;

/**
 * `POST /answer` request — the card being answered and the learner's raw typed
 * input. The server normalizes and judges; the client sends text verbatim.
 */
export const answerRequestSchema = z
  .object({
    cardId: z.string().min(1),
    input: z.string(),
  })
  .strict();

export type AnswerRequest = z.infer<typeof answerRequestSchema>;

/**
 * `POST /answer` response — whether the input was correct, and the canonical
 * label of the correct answer so the UI can show it either way.
 */
export const answerResponseSchema = z
  .object({
    correct: z.boolean(),
    acceptedAnswer: z.string().min(1),
  })
  .strict();

export type AnswerResponse = z.infer<typeof answerResponseSchema>;

/**
 * `GET /answers` — one recorded answer in the raw log. Mirrors what the store
 * persists — the card reference, the learner's verbatim input (which may be
 * empty — a blank submission is still an answer), the verdict, and when it was
 * recorded — plus the rendered `question` text, which the server re-derives
 * from `cardId` at read time rather than storing. This is the only record that
 * a sitting happened; the review view reads nothing else.
 */
export const answerLogEntrySchema = z
  .object({
    cardId: z.string().min(1),
    question: z.string().min(1),
    input: z.string(),
    correct: z.boolean(),
    askedAt: z.string().min(1),
  })
  .strict();

export type AnswerLogEntry = z.infer<typeof answerLogEntrySchema>;

/** `GET /answers` response — the recorded answers, most recent first. */
export const answerLogSchema = z.array(answerLogEntrySchema);

export type AnswerLog = z.infer<typeof answerLogSchema>;
