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
