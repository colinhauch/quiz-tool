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
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AuthEnv, type AuthOptions, createAuthMiddleware } from "./auth.js";
import type { Catalog } from "./catalog.js";
import type { AnswerStore, SelectionStore } from "./storage.js";

/** The pair of stores that serve one learner: their answer log and pack selection. */
export interface UserStores {
  store: AnswerStore;
  selection?: SelectionStore;
}

export interface AppOptions {
  /** The assembled graph: every discovered pack, always. Selection filters draws, never loads. */
  pack: Pack;
  /**
   * Single-user mode: the one answer store every request writes to. Use this
   * (with the sqlite stores) for local dev and tests. Omit when running
   * multi-user — {@link AppOptions.storesForUser} supplies the store per request.
   */
  store?: AnswerStore;
  /** Single-user mode: where the learner's pack selection is persisted. Omit for a non-persisting app. */
  selection?: SelectionStore;
  /**
   * Multi-user mode: verify each request's Supabase JWT. Given together with
   * {@link AppOptions.storesForUser}, the data routes are guarded (401 without a
   * valid token) and each caller gets their own stores and queue.
   */
  auth?: AuthOptions;
  /**
   * Multi-user mode: builds the caller's stores from their user-scoped Supabase
   * client. `userId` (the verified `sub`) is handed alongside so the queue can be
   * keyed by it; the client is what RLS scopes the stores to.
   */
  storesForUser?: (client: SupabaseClient, userId: string) => UserStores;
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
export function createApp({
  pack,
  store,
  selection,
  auth,
  storesForUser,
  rng,
  now = () => new Date(),
  catalog,
}: AppOptions) {
  const multiUser = Boolean(auth && storesForUser);
  if (!multiUser && !store) {
    throw new Error("createApp needs either an injected store (single-user) or auth + storesForUser (multi-user)");
  }

  const app = new Hono<AuthEnv>();

  // Which stores serve this request, and the key its queue lives under. In
  // single-user mode both are constant; in multi-user mode they come from the
  // JWT the middleware verified — a per-user client (RLS scopes it) and the
  // verified subject as the queue key. Cheap and synchronous: no queue built.
  const SINGLE_USER = "__single__";
  function resolve(c: Context<AuthEnv>): { store: AnswerStore; selection?: SelectionStore; key: string } {
    if (storesForUser) {
      const userId = c.get("userId");
      const built = storesForUser(c.get("supabase"), userId);
      return { store: built.store, selection: built.selection, key: userId };
    }
    // Guarded in the constructor: single-user mode always has an injected store.
    return { store: store as AnswerStore, selection, key: SINGLE_USER };
  }

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

  // The live queues, one per learner (keyed as `resolve` decides — a single
  // shared key in single-user mode, the user id in multi-user mode). Each is
  // held in memory and rebuilt from that learner's persisted selection on their
  // first request: the *selection* is the durable thing, the order it happens to
  // produce is not (#20). Entries are replaced rather than mutated, because every
  // engine queue operation returns a new queue.
  //
  // Built lazily rather than at construction because the selection read is async
  // (Postgres over the network — see storage.ts), and `createApp` stays
  // synchronous so its many callers need no `await`. The map memoises per key,
  // so the read runs once per learner and every later handler reuses the queue.
  const queues = new Map<string, Queue>();
  async function ensureQueue(
    c: Context<AuthEnv>,
  ): Promise<{ queue: Queue; key: string; store: AnswerStore; selection?: SelectionStore }> {
    const resolved = resolve(c);
    let queue = queues.get(resolved.key);
    if (!queue) {
      const stored = (await resolved.selection?.read()) ?? null;
      const initial = stored ? stored.filter((id) => selectable.includes(id)) : selectable;
      queue = buildQueue(pack, initial.length > 0 ? initial : selectable, rng);
      queues.set(resolved.key, queue);
    }
    return { queue, ...resolved };
  }

  // Registered before the auth middleware so it stays public; every route below
  // the `app.use` is guarded in multi-user mode.
  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));
  if (multiUser && auth) {
    app.use("*", createAuthMiddleware(auth));
  }

  // The next question from the queue. Drawing advances it, so a card is not
  // handed out twice in a pass. The response is parsed through the shared
  // schema so the server cannot drift from the contract the browser trusts —
  // and so an accidental answer leak fails here, at the seam.
  app.get("/question", async (c) => {
    const { queue, key } = await ensureQueue(c);
    const drawn = drawNext(pack, queue, rng);
    queues.set(key, drawn.queue);
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
  app.get("/packs", async (c) => {
    const { queue: live } = await ensureQueue(c);
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
            included: live.included.includes(id),
          };
        }),
        queued: live.upcoming.length,
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

    const { queue, key, selection: sel } = await ensureQueue(c);
    queues.set(key, applySelection(pack, queue, packIds, rng));
    await sel?.write(packIds);
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

    const { store: s } = resolve(c);
    await s.record({ cardId, input, correct: result.correct, askedAt: now().toISOString() });
    return c.json(answerResponseSchema.parse(result));
  });

  // The raw answer log for review, most recent first. The store keeps the log
  // in insertion order (it is an append log); reversing here is the view's
  // choice, not the store's. Each record's question text is re-derived from its
  // cardId — the prompt is a deterministic function of the card, so it isn't
  // stored — and falls back to the raw cardId if the card no longer resolves
  // (e.g. the pack changed). Parsed through the schema so the seam stays honest.
  app.get("/answers", async (c) => {
    const { store: s } = resolve(c);
    return c.json(
      answerLogSchema.parse(
        [...(await s.all())]
          .reverse()
          .map((record) => ({
            ...record,
            question: questionText(pack, record.cardId),
            acceptedAnswer: acceptedAnswerFor(pack, record.cardId),
          })),
      ),
    );
  });

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

/**
 * The canonical correct answer for a recorded card, re-derived from its id so
 * the log can show it beside the learner's input. The judgement is independent
 * of what was typed, so any input recovers the accepted label; a stale id (its
 * card gone from the pack) yields `undefined`, the same staleness `questionText`
 * falls back on, and the log entry simply omits the answer.
 */
function acceptedAnswerFor(pack: Pack, cardId: string): string | undefined {
  try {
    return checkAnswer(pack, cardId, "").acceptedAnswer;
  } catch {
    return undefined;
  }
}
