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
 * `cardId` for the card being asked, the prompt, and the input mode. It
 * deliberately does NOT carry the answer: the seam must never reveal it.
 */
export const questionResponseSchema = z
  .object({
    cardId: z.string().min(1),
    prompt: z.string().min(1),
    input: z.literal("text"),
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
