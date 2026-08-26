import { SEED_RATING } from "@geo/engine";
import Database from "better-sqlite3";

/**
 * A single recorded answer. The card reference (`<statementId>:<hiddenSlot>`)
 * captures both the fact tested and the slot concealed, so the hidden slot is
 * derivable without a separate column (see `specs/learning/README.md`).
 */
export interface AnswerRecord {
  cardId: string;
  input: string;
  correct: boolean;
  /** ISO-8601 timestamp of when the answer was recorded. */
  askedAt: string;
  /**
   * The scheduler's rating belief the moment it asked (spec #118). Denormalized
   * telemetry — rebuildable by replaying the log, never the source of truth — so
   * "difficulty vs. outcome" analysis needs no replay. Absent when the card had
   * no owning pack (an edge not in the graph), which moves no rating. `P(success)`
   * is deliberately not stored: it is a pure function of difficulty and ability.
   */
  snapshot?: RatingSnapshotRow;
}

/** The rating inputs recorded on an answer row: pre-answer difficulty, ability, K, and the pack the ability came from. */
export interface RatingSnapshotRow {
  difficulty: number;
  ability: number;
  kApplied: number;
  packId: string;
}

/**
 * Persists answers and reads them back. The MVP schema is deliberately flat —
 * card reference, input, correctness, timestamp — matching what spec #10 asks
 * the skeleton to record. Richer `answer_events` fields (resolved statements,
 * hidden values, latency) are post-MVP breadth.
 *
 * The methods are async because the production store is Supabase Postgres over
 * the network (see `supabase-storage.ts`); the local better-sqlite3 store below
 * satisfies the same shape by wrapping its synchronous calls. Which user's rows
 * a store touches is not this interface's concern — the Supabase store carries a
 * user-scoped JWT and Postgres RLS decides ownership (see `#57`).
 */
export interface AnswerStore {
  record(answer: AnswerRecord): Promise<void>;
  all(): Promise<AnswerRecord[]>;
}

interface AnswerRow {
  cardId: string;
  input: string;
  correct: number;
  askedAt: string;
  difficulty: number | null;
  ability: number | null;
  kApplied: number | null;
  ratingPackId: string | null;
}

/**
 * The cached Elo ratings (spec #118). Difficulty and its answer count are global
 * (keyed by card id); ability is per-`(learner, pack)`. This store holds one
 * learner's view — the Supabase store scopes ability by RLS, the sqlite store is
 * single-user — so `readAbility`/`writeAbility` take only a pack id. Both are a
 * cache: the answer log replays back to the same numbers.
 */
export interface RatingStore {
  /** A card's difficulty and global answer count; seed (1500) and 0 if unseen. */
  readCard(cardId: string): Promise<{ difficulty: number; answerCount: number }>;
  /**
   * Every rated card, keyed by card id — the whole difficulty cache in one read.
   * The scheduler bins the eligible pool by `P(success)`, so it needs every
   * card's difficulty at once; unrated cards are simply absent (the reader
   * defaults them to the seed). Bounded by the number of *answered* cards, not
   * the graph, since the cache only holds cards an answer has moved.
   */
  readAllCards(): Promise<Map<string, { difficulty: number; answerCount: number }>>;
  /** The learner's ability for a pack; seed (1500) if unseen. */
  readAbility(packId: string): Promise<number>;
  /** Persist a card's post-answer difficulty and answer count. */
  writeCard(cardId: string, difficulty: number, answerCount: number): Promise<void>;
  /** Persist the learner's post-answer ability for a pack. */
  writeAbility(packId: string, ability: number): Promise<void>;
}

/**
 * Which packs the learner has chosen to be quizzed on.
 *
 * A singleton preference, not per-user: this system has no user concept, and
 * inventing one to hold a set of checkboxes would be backwards. It lives beside
 * the answer log because it is learner state, but it is emphatically *not* part
 * of the log — selection governs what will be asked and never what was.
 *
 * `read` returns `null` on a first run, which the caller turns into "every
 * question-yielding pack". The absence is kept distinct from the empty set on
 * purpose: empty is refused everywhere, so it must never arise from a default.
 */
export interface SelectionStore {
  read(): Promise<string[] | null>;
  write(packIds: string[]): Promise<void>;
}

/**
 * Persists the pack selection. The whole set is rewritten on every save rather
 * than diffed — it is a handful of rows, and a replace cannot half-apply the
 * way an add/remove pair can.
 */
export function createSelectionStore(db: Database.Database): SelectionStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pack_selection (
      pack_id TEXT PRIMARY KEY
    )
  `);
  // A one-row table recording that a selection was saved at all, so a learner
  // who deselects everything but one pack is not mistaken for a first run.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pack_selection_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      saved_at TEXT NOT NULL
    )
  `);

  const selectAll = db.prepare("SELECT pack_id AS packId FROM pack_selection ORDER BY pack_id");
  const wasSaved = db.prepare("SELECT 1 FROM pack_selection_state WHERE id = 1");
  const clear = db.prepare("DELETE FROM pack_selection");
  const insert = db.prepare("INSERT INTO pack_selection (pack_id) VALUES (?)");
  const markSaved = db.prepare(
    "INSERT INTO pack_selection_state (id, saved_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET saved_at = excluded.saved_at",
  );

  const writeTxn = db.transaction((packIds: string[]) => {
    clear.run();
    for (const packId of packIds) insert.run(packId);
    markSaved.run(new Date().toISOString());
  });

  return {
    async read() {
      if (!wasSaved.get()) return null;
      return (selectAll.all() as { packId: string }[]).map((row) => row.packId);
    },
    async write(packIds: string[]) {
      writeTxn(packIds);
    },
  };
}

/**
 * Opens (or creates) an answer store over a better-sqlite3 database. Callers
 * own the database's lifecycle: pass a file path via {@link openDatabase} for
 * the real app, or an in-memory db under test.
 */
export function createAnswerStore(db: Database.Database): AnswerStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      input TEXT NOT NULL,
      correct INTEGER NOT NULL,
      asked_at TEXT NOT NULL,
      card_difficulty REAL,
      pack_ability REAL,
      k_applied REAL,
      rating_pack_id TEXT
    )
  `);

  const insert = db.prepare(
    `INSERT INTO answers (card_id, input, correct, asked_at, card_difficulty, pack_ability, k_applied, rating_pack_id)
     VALUES (@cardId, @input, @correct, @askedAt, @difficulty, @ability, @kApplied, @ratingPackId)`,
  );
  const selectAll = db.prepare(
    `SELECT card_id AS cardId, input, correct, asked_at AS askedAt,
            card_difficulty AS difficulty, pack_ability AS ability,
            k_applied AS kApplied, rating_pack_id AS ratingPackId
     FROM answers ORDER BY id`,
  );

  return {
    async record(answer) {
      insert.run({
        cardId: answer.cardId,
        input: answer.input,
        correct: answer.correct ? 1 : 0,
        askedAt: answer.askedAt,
        difficulty: answer.snapshot?.difficulty ?? null,
        ability: answer.snapshot?.ability ?? null,
        kApplied: answer.snapshot?.kApplied ?? null,
        ratingPackId: answer.snapshot?.packId ?? null,
      });
    },
    async all() {
      return (selectAll.all() as AnswerRow[]).map(rowToRecord);
    },
  };
}

/** Reassembles an {@link AnswerRecord} from a row, folding the four snapshot columns back into `snapshot` (present only when the row carried one). */
function rowToRecord(row: AnswerRow): AnswerRecord {
  const record: AnswerRecord = {
    cardId: row.cardId,
    input: row.input,
    correct: row.correct === 1,
    askedAt: row.askedAt,
  };
  if (row.ratingPackId !== null && row.difficulty !== null && row.ability !== null && row.kApplied !== null) {
    record.snapshot = {
      difficulty: row.difficulty,
      ability: row.ability,
      kApplied: row.kApplied,
      packId: row.ratingPackId,
    };
  }
  return record;
}

/**
 * Opens (or creates) a rating store over a better-sqlite3 database — the local
 * mirror of the two Supabase cache tables. `card_difficulty` is global (single
 * learner locally); `pack_ability` is this learner's ability per pack. Both are
 * a cache the answer log can rebuild.
 */
export function createRatingStore(db: Database.Database): RatingStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_difficulty (
      card_id TEXT PRIMARY KEY,
      difficulty REAL NOT NULL,
      answer_count INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pack_ability (
      pack_id TEXT PRIMARY KEY,
      ability REAL NOT NULL
    )
  `);

  const selectCard = db.prepare(
    "SELECT difficulty, answer_count AS answerCount FROM card_difficulty WHERE card_id = ?",
  );
  const selectAllCards = db.prepare(
    "SELECT card_id AS cardId, difficulty, answer_count AS answerCount FROM card_difficulty",
  );
  const selectAbility = db.prepare("SELECT ability FROM pack_ability WHERE pack_id = ?");
  const upsertCard = db.prepare(
    `INSERT INTO card_difficulty (card_id, difficulty, answer_count) VALUES (@cardId, @difficulty, @answerCount)
     ON CONFLICT(card_id) DO UPDATE SET difficulty = excluded.difficulty, answer_count = excluded.answer_count`,
  );
  const upsertAbility = db.prepare(
    `INSERT INTO pack_ability (pack_id, ability) VALUES (@packId, @ability)
     ON CONFLICT(pack_id) DO UPDATE SET ability = excluded.ability`,
  );

  return {
    async readCard(cardId) {
      const row = selectCard.get(cardId) as { difficulty: number; answerCount: number } | undefined;
      return row ?? { difficulty: SEED_RATING, answerCount: 0 };
    },
    async readAllCards() {
      const rows = selectAllCards.all() as { cardId: string; difficulty: number; answerCount: number }[];
      return new Map(rows.map((r) => [r.cardId, { difficulty: r.difficulty, answerCount: r.answerCount }]));
    },
    async readAbility(packId) {
      const row = selectAbility.get(packId) as { ability: number } | undefined;
      return row?.ability ?? SEED_RATING;
    },
    async writeCard(cardId, difficulty, answerCount) {
      upsertCard.run({ cardId, difficulty, answerCount });
    },
    async writeAbility(packId, ability) {
      upsertAbility.run({ packId, ability });
    },
  };
}

/** Opens a better-sqlite3 database at a file path (or `:memory:`). */
export function openDatabase(filename: string): Database.Database {
  return new Database(filename);
}
