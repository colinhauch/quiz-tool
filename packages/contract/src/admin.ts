import { z } from "zod";

/**
 * The typed HTTP seam for the admin visualizer (`@geo/admin`), kept apart from
 * the player-facing schemas in `index.ts` so the two surfaces cannot silently
 * borrow each other's shapes. Like the rest of this package it is dependency-free
 * apart from zod: both the admin SPA and the admin BFF import these, so the admin
 * HTTP seam has one source of truth and cannot drift.
 *
 * Route schemas arrive with the slices that add the routes (#136–#144). This
 * file starts with the one route the skeleton (#135) needs to prove the seam
 * end-to-end.
 */

/**
 * `GET /health` — the admin BFF's liveness probe. It carries `readOnly: true`
 * as a machine-checkable statement of the whole app's stance in this iteration:
 * the BFF exposes reads only, and the SPA renders a read-only affordance. The
 * flag lives at the seam rather than only in UI copy so a future write route
 * cannot be added without this contract (and its test) forcing the question.
 */
export const adminHealthSchema = z
  .object({
    status: z.literal("ok"),
    readOnly: z.literal(true),
  })
  .strict();

export type AdminHealth = z.infer<typeof adminHealthSchema>;
