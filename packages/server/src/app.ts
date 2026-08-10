import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  healthSchema,
  packListSchema,
  packSelectionRequestSchema,
  questionResponseSchema,
} from "@geo/contract";
import {
  applySelection,
  buildQueue,
  checkAnswer,
  drawNext,
  enumerateCards,
  findCard,
  generateQuestion,
  type Pack,
  type Queue,
} from "@geo/engine";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Catalog } from "./catalog.js";
import type { AnswerStore, SelectionStore } from "./storage.js";

export interface AppOptions {
  /** The assembled graph: every discovered pack, always. Selection filters draws, never loads. */
  pack: Pack;
  /** Where answered questions are persisted. */
  store: AnswerStore;
  /** Where the learner's pack selection is persisted. Omit for an unfiltered, non-persisting app. */
  selection?: SelectionStore;
  /** Randomness source for queue ordering; injectable for deterministic tests. */
  rng?: () => number;
  /** Clock for answer timestamps; injectable for deterministic tests. */
  now?: () => Date;
  /** Per-pack visibility/tier policy. Omit to offer every selectable pack (the default catalog). */
  catalog?: Catalog;
}

/**
 * The packs a learner can choose between: those that yield at least one
 * drawable card. `core-geo` ships entities and no statements, so it is not a
 * choice — a checkbox for it would do nothing whichever way it was set.
 */
function selectablePacks(pack: Pack): string[] {
  const yielding = new Set(
    enumerateCards(pack)
      .filter((card) => card.statement.relation in pack.generators)
      .map((card) => card.statement.pack),
  );
  return [...pack.packs.keys()].filter((id) => yielding.has(id));
}

/** How many drawable cards a pack contributes — the honest "how many questions is this?". */
function cardCounts(pack: Pack): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of enumerateCards(pack)) {
    if (!(card.statement.relation in pack.generators)) continue;
    counts.set(card.statement.pack, (counts.get(card.statement.pack) ?? 0) + 1);
  }
  return counts;
}

/**
 * Builds the Hono app. Kept separate from the Node server entrypoint so tests
 * can drive it in-process via `app.request()` with no network — the primary
 * integration seam for the walking skeleton. Its dependencies (the pack, the
 * store, the rng/clock) are passed in rather than reached for, so the same
 * builder serves both the real startup wiring and fixtures under test.
 */
export function createApp({ pack, store, selection, rng, now = () => new Date(), catalog }: AppOptions) {
  const app = new Hono();

  // First run selects everything, so introducing the picker regresses nothing.
  // A stored selection is intersected with what is actually selectable, so a
  // pack removed from disk since the last save drops out instead of poisoning
  // the queue with an id nothing can draw.
  //
  // Two distinct reasons a pack is not selectable, kept separate: it yields no
  // questions (entities-only, like core-geo), or the catalog hides it (product
  // policy, like the retired core-cities). A hidden pack is still in the graph;
  // it just never reaches the picker, the queue, or a stored selection.
  const selectable = selectablePacks(pack).filter((id) => !catalog?.get(id)?.hidden);
  const stored = selection?.read() ?? null;
  const initial = stored ? stored.filter((id) => selectable.includes(id)) : selectable;

  // The one live queue. Held in memory and rebuilt at boot from the persisted
  // selection: the *selection* is the durable thing, the order it happens to
  // produce is not (#20). Reassigned rather than mutated, because every engine
  // queue operation returns a new queue.
  let queue: Queue = buildQueue(pack, initial.length > 0 ? initial : selectable, rng);

  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));

  // The next question from the queue. Drawing advances it, so a card is not
  // handed out twice in a pass. The response is parsed through the shared
  // schema so the server cannot drift from the contract the browser trusts —
  // and so an accidental answer leak fails here, at the seam.
  app.get("/question", (c) => {
    const drawn = drawNext(pack, queue, rng);
    queue = drawn.queue;
    return c.json(
      questionResponseSchema.parse(
        generateQuestion(pack, drawn.card.statement, drawn.card.hiddenSlot),
      ),
    );
  });

  // The picker's catalogue: every selectable pack, what its manifest says about
  // it, and whether it is currently drawn from. `included` reflects the
  // *committed* selection — the checkbox's pending state lives in the browser
  // until saved.
  app.get("/packs", (c) => {
    const counts = cardCounts(pack);
    const statements = new Map<string, number>();
    for (const statement of pack.statements) {
      statements.set(statement.pack, (statements.get(statement.pack) ?? 0) + 1);
    }
    return c.json(
      packListSchema.parse({
        packs: selectable.map((id) => {
          const info = pack.packs.get(id);
          if (!info) throw new Error(`selectable pack ${id} is not in the graph`);
          return {
            id,
            label: info.labels.en,
            description: info.descriptions?.en,
            version: info.version,
            license: info.license,
            credits: info.credits,
            statementCount: statements.get(id) ?? 0,
            cardCount: counts.get(id) ?? 0,
            included: queue.included.includes(id),
          };
        }),
        queued: queue.upcoming.length,
      }),
    );
  });

  // Commit a new selection. Cards from dropped packs leave the queue and cards
  // from newly included packs fold into it, so the learner keeps their place in
  // the current pass. Nothing here touches the answer log: selection governs
  // what will be asked, never what was.
  app.put("/packs", async (c) => {
    let packIds: string[];
    try {
      ({ packIds } = packSelectionRequestSchema.parse(await c.req.json()));
    } catch (err) {
      throw new HTTPException(400, { message: "malformed pack selection", cause: err });
    }

    const unknown = packIds.filter((id) => !selectable.includes(id));
    if (unknown.length > 0) {
      throw new HTTPException(400, { message: `not a selectable pack: ${unknown.join(", ")}` });
    }

    queue = applySelection(pack, queue, packIds, rng);
    selection?.write(packIds);
    return c.json({ ok: true });
  });

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
