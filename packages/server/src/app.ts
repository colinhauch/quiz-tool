import {
  answerLogSchema,
  answerRequestSchema,
  answerResponseSchema,
  entityListSchema,
  healthSchema,
  packListSchema,
  packSelectionRequestSchema,
  questionResponseSchema,
} from "@geo/contract";
import {
  abilityKey,
  abilityOf,
  applyAnswer,
  applySelection,
  buildScheduler,
  checkAnswer,
  difficultyOf,
  drawNext,
  eligibleCards,
  emptyRatings,
  enumerateCards,
  findCard,
  generateQuestion,
  ownerPackId,
  type Pack,
  type Ratings,
  type Scheduler,
  type RatingSnapshot,
} from "@geo/engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AuthEnv, type AuthOptions, createAuthMiddleware } from "./auth.js";
import type { Catalog } from "./catalog.js";
import type { AnswerStore, RatingStore, SelectionStore } from "./storage.js";

/** The stores that serve one learner: their answer log, pack selection, and Elo ratings. */
export interface UserStores {
  store: AnswerStore;
  selection?: SelectionStore;
  rating?: RatingStore;
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
   * Single-user mode: the Elo rating cache. Omit to run without live ratings —
   * answers are still logged, just with no snapshot and no difficulty/ability
   * update (the pre-scheduler behaviour). Supply it to calibrate on every answer.
   */
  rating?: RatingStore;
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
  rating,
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
  function resolve(c: Context<AuthEnv>): {
    store: AnswerStore;
    selection?: SelectionStore;
    rating?: RatingStore;
    key: string;
  } {
    if (storesForUser) {
      const userId = c.get("userId");
      const built = storesForUser(c.get("supabase"), userId);
      return { store: built.store, selection: built.selection, rating: built.rating, key: userId };
    }
    // Guarded in the constructor: single-user mode always has an injected store.
    return { store: store as AnswerStore, selection, rating, key: SINGLE_USER };
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

  // The live schedulers, one per learner (keyed as `resolve` decides — a single
  // shared key in single-user mode, the user id in multi-user mode). Each is
  // held in memory and rebuilt from that learner's persisted selection and the
  // current ratings on their first request: the *selection* is the durable
  // thing, the bag state it produces is not. Entries are replaced rather than
  // mutated, because every engine scheduler operation returns a new scheduler.
  //
  // Built lazily rather than at construction because the selection and rating
  // reads are async (Postgres over the network — see storage.ts), and `createApp`
  // stays synchronous so its many callers need no `await`. The map memoises per
  // key, so the reads run once per learner and every later handler reuses the
  // scheduler.
  const schedulers = new Map<string, Scheduler>();
  async function ensureScheduler(
    c: Context<AuthEnv>,
  ): Promise<{
    scheduler: Scheduler;
    key: string;
    store: AnswerStore;
    selection?: SelectionStore;
    rating?: RatingStore;
  }> {
    const resolved = resolve(c);
    let scheduler = schedulers.get(resolved.key);
    if (!scheduler) {
      const stored = (await resolved.selection?.read()) ?? null;
      const initial = stored ? stored.filter((id) => selectable.includes(id)) : selectable;
      const included = initial.length > 0 ? initial : selectable;
      const ratings = await loadRatings(resolved.rating, resolved.key, included);
      scheduler = buildScheduler(pack, ratings, resolved.key, included, rng);
      schedulers.set(resolved.key, scheduler);
    }
    return { scheduler, ...resolved };
  }

  // Registered before the auth middleware so it stays public; every route below
  // the `app.use` is guarded in multi-user mode.
  app.get("/health", (c) => c.json(healthSchema.parse({ status: "ok" })));
  if (multiUser && auth) {
    app.use("*", createAuthMiddleware(auth));
  }

  // The next question, drawn by the bag-of-bags scheduler over the current
  // ratings. Ratings are re-read per draw because they drift as answers arrive
  // (every answer nudges a card's difficulty and the learner's ability), and an
  // emptied inner bag re-bins against the fresh numbers. Drawing advances the
  // scheduler state, so a card is not handed out twice within a cycle. The
  // response is parsed through the shared schema so the server cannot drift from
  // the contract the browser trusts — and so an accidental answer leak fails
  // here, at the seam.
  app.get("/question", async (c) => {
    const { scheduler, key, rating } = await ensureScheduler(c);
    const ratings = await loadRatings(rating, key, scheduler.included);
    const drawn = drawNext(pack, ratings, key, scheduler, rng);
    schedulers.set(key, drawn.scheduler);
    return c.json(
      questionResponseSchema.parse(
        generateQuestion(pack, drawn.card.statement, drawn.card.hiddenSlot),
      ),
    );
  });

  // Every entity of a given type in the graph, for the client to cache and
  // offer as answer suggestions. Read-only and global — the graph is the same
  // for every learner, so no selection or store is consulted. `type` is
  // required: without it there is no sensible default (the whole graph), so an
  // omitted type is a client error rather than a firehose.
  app.get("/entities", (c) => {
    const type = c.req.query("type");
    if (!type) throw new HTTPException(400, { message: "missing required query param: type" });
    const entities = [...pack.entities.values()]
      .filter((e) => e.types.includes(type))
      .map((e) => ({
        id: e.id,
        label: e.labels.en,
        aliases: e.aliases ? Object.values(e.aliases).flat() : [],
        ...(e.autocomplete ? { autocomplete: e.autocomplete } : {}),
      }));
    return c.json(entityListSchema.parse(entities));
  });

  // The picker's catalogue: every selectable pack, what its manifest says about
  // it, and whether it is currently drawn from. `included` reflects the
  // *committed* selection — the checkbox's pending state lives in the browser
  // until saved.
  app.get("/packs", async (c) => {
    const { scheduler: live } = await ensureScheduler(c);
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
        // How many distinct cards the current selection is quizzing on — the
        // eligible pool size. With no within-session exclusion (re-draws are
        // allowed) this is a property of the selection, not of how far a pass
        // has progressed, so it is stable across draws and only moves when the
        // selection does.
        queued: eligibleCards(pack, live.included).length,
      }),
    );
  });

  // Commit a new selection. Cards from dropped packs leave the scheduler's bags
  // immediately; a newly included pack's cards are picked up on the next re-bin.
  // Nothing here touches the answer log: selection governs what will be asked,
  // never what was.
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

    const { scheduler, key, selection: sel } = await ensureScheduler(c);
    schedulers.set(key, applySelection(pack, scheduler, packIds));
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

    const { store: s, rating: r, key } = resolve(c);
    // Move the card's global difficulty and this learner's pack ability, and
    // snapshot what the scheduler believed at ask time. The next draw re-reads
    // these ratings, so the answer feeds back into selection (#120). Without a
    // rating store, log as before.
    //
    // Compute the update (pure) first, then append the log row — the source of
    // truth — and only then persist the rating caches. That order keeps the
    // caches from ever leading the log: if the log append fails, the caches are
    // untouched; if a cache write fails, replay rebuilds it from the row.
    const update = r ? await computeRatingUpdate(r, pack, cardId, key, result.correct) : undefined;
    await s.record({
      cardId,
      input,
      correct: result.correct,
      askedAt: now().toISOString(),
      ...(update?.snapshot ? { snapshot: update.snapshot } : {}),
    });
    await update?.persist();
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
          // The rating snapshot is telemetry, not part of the review view — drop
          // it here (the log entry schema is strict); `GET /answers` is unchanged.
          .map(({ snapshot: _snapshot, ...record }) => ({
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
 * Loads a learner's ratings into the engine's {@link Ratings} shape for the
 * scheduler to bin the pool: every rated card's difficulty in one read, plus
 * this learner's ability for each included pack. Unrated cards and unseen packs
 * are simply absent — the engine defaults them to the seed, so a brand-new card
 * computes `P = 0.5` and lands medium. With no rating store (single-user mode
 * run without ratings) every card reads back at the seed, so the mix is uniform
 * over the medium tier — correct, just not yet adaptive.
 */
async function loadRatings(
  rating: RatingStore | undefined,
  learnerId: string,
  included: readonly string[],
): Promise<Ratings> {
  if (!rating) return emptyRatings();
  const cards = await rating.readAllCards();
  const difficulty = new Map<string, number>();
  const answerCount = new Map<string, number>();
  for (const [id, v] of cards) {
    difficulty.set(id, v.difficulty);
    answerCount.set(id, v.answerCount);
  }
  const ability = new Map<string, number>();
  for (const packId of included) ability.set(abilityKey(learnerId, packId), await rating.readAbility(packId));
  return { difficulty, answerCount, ability };
}

/**
 * Computes one answer's effect on the Elo cache: the ask-time snapshot to log,
 * and a `persist` that writes the post-answer difficulty and ability. Splitting
 * compute from persist lets the caller append the log row (the source of truth)
 * *between* them, so the caches never lead the log. A card with no owning pack —
 * an edge not in the graph — scores 0, moves no rating, and yields `undefined`.
 *
 * Reads only the one card and one ability the answer touches, hands the engine a
 * one-entry `Ratings`, and writes back what changed — the online O(1) path the
 * scheduler spec calls for, with the append-only log as the rebuildable truth.
 */
async function computeRatingUpdate(
  rating: RatingStore,
  pack: Pack,
  cardId: string,
  learnerId: string,
  correct: boolean,
): Promise<{ snapshot: RatingSnapshot; persist: () => Promise<void> } | undefined> {
  const packId = ownerPackId(pack, cardId);
  if (packId === undefined) return undefined;

  const [{ difficulty, answerCount }, ability] = await Promise.all([
    rating.readCard(cardId),
    rating.readAbility(packId),
  ]);
  const current: Ratings = {
    difficulty: new Map([[cardId, difficulty]]),
    answerCount: new Map([[cardId, answerCount]]),
    ability: new Map([[abilityKey(learnerId, packId), ability]]),
  };

  const { ratings: next, snapshot } = applyAnswer(current, { cardId, learnerId, correct }, packId);
  // packId is defined, so applyAnswer always moved this card and pack.
  if (!snapshot) throw new Error(`rating update produced no snapshot for card ${cardId}`);
  return {
    snapshot,
    persist: () =>
      Promise.all([
        rating.writeCard(cardId, difficultyOf(next, cardId), next.answerCount.get(cardId) as number),
        rating.writeAbility(packId, abilityOf(next, learnerId, packId)),
      ]).then(() => undefined),
  };
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
