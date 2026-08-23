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
    // The kind(s) of entity the answer names, so the client can scope answer
    // suggestions to the right type. The answer's type, never the answer.
    answerTypes: z.array(z.string().min(1)),
  })
  .strict();

export type QuestionResponse = z.infer<typeof questionResponseSchema>;

/**
 * One entity as the answer-suggestion source sees it: its id, its canonical
 * English label, and every display alias flattened into one list. `label` is
 * what a suggestion row shows and fills; `aliases` broadens what the client can
 * match a keystroke against, mirroring the names the grader accepts.
 */
export const entitySummarySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    // Non-empty: an empty alias would normalize to "" and match every keystroke
    // as a universal substring.
    aliases: z.array(z.string().min(1)),
  })
  .strict();

export type EntitySummary = z.infer<typeof entitySummarySchema>;

/**
 * `GET /entities?type=` — every entity in the graph of the requested type, for
 * the client to cache and offer as answer suggestions. Global, not per-pack: a
 * city is a city regardless of which pack quizzed it. An unknown type yields an
 * empty list.
 */
export const entityListSchema = z.array(entitySummarySchema);

export type EntityList = z.infer<typeof entityListSchema>;

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
 * recorded — plus the rendered `question` text and the canonical
 * `acceptedAnswer`, both of which the server re-derives from `cardId` at read
 * time rather than storing. `acceptedAnswer` is absent when the card no longer
 * resolves (e.g. the pack changed), the same staleness `question` falls back on.
 * This is the only record that a sitting happened; the review view reads nothing
 * else.
 */
export const answerLogEntrySchema = z
  .object({
    cardId: z.string().min(1),
    question: z.string().min(1),
    input: z.string(),
    correct: z.boolean(),
    acceptedAnswer: z.string().min(1).optional(),
    askedAt: z.string().min(1),
  })
  .strict();

export type AnswerLogEntry = z.infer<typeof answerLogEntrySchema>;

/**
 * One selectable pack, as the picker shows it: its identity, whatever the
 * manifest says about it, and whether it is currently being drawn from.
 *
 * The descriptive fields are optional because `pack.json` makes them optional —
 * the picker renders what a pack chose to say about itself rather than
 * demanding a shape packs don't have. `cardCount` is the honest number for a
 * quiz ("how many questions is this?"), which is not the statement count: a
 * bidirectional relation yields two cards per statement.
 */
export const packSummarySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    version: z.string().min(1),
    license: z.string().optional(),
    credits: z.array(z.object({ source: z.string(), retrieved: z.string() })).optional(),
    statementCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
    /** Whether this pack is in the committed selection — not the checkbox's pending state. */
    included: z.boolean(),
  })
  .strict();

export type PackSummary = z.infer<typeof packSummarySchema>;

/**
 * `GET /packs` — the packs a learner can choose between, plus how many
 * questions are queued ahead of them under the current selection.
 *
 * Only packs that yield questions appear. `core-geo` ships entities and no
 * statements, so it can never be quizzed and would be a checkbox that does
 * nothing (see `specs/packs/README.md`).
 */
export const packListSchema = z
  .object({
    packs: z.array(packSummarySchema),
    /** Cards remaining in the current pass. Display only. */
    queued: z.number().int().nonnegative(),
  })
  .strict();

export type PackList = z.infer<typeof packListSchema>;

/**
 * `PUT /packs` — the learner's committed pack selection.
 *
 * At least one pack: an empty selection is refused here, at the seam, rather
 * than being quietly treated as "no filter". Letting empty mean unfiltered
 * would have the UI show every checkbox clear while the learner is still asked
 * questions — the app telling them a lie about its own state.
 */
export const packSelectionRequestSchema = z
  .object({
    packIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type PackSelectionRequest = z.infer<typeof packSelectionRequestSchema>;

/** `GET /answers` response — the recorded answers, most recent first. */
export const answerLogSchema = z.array(answerLogEntrySchema);

export type AnswerLog = z.infer<typeof answerLogSchema>;
