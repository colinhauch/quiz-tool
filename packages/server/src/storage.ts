import type { FeedbackContext } from "@geo/contract";
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
 * One learner-submitted feedback report, as the store persists it. `kind` splits
 * general app feedback from a question flag; `cardId` and `context` are populated
 * only for question feedback (null for general). `comment` is always present —
 * general requires the learner's text, a question flag with an empty box carries
 * the default sentinel sentence the client supplied.
 */
export interface FeedbackRecord {
  kind: "general" | "question";
  cardId: string | null;
  comment: string;
  context: FeedbackContext | null;
  /** ISO-8601 timestamp of when the report was recorded. */
  createdAt: string;
}

/**
 * Records feedback. Deliberately write-only: the learner-facing app can submit
 * feedback but never read it back (only the admin's `service_role` reads it),
 * so there is no `all()` on the production seam — the isolation is in the RLS,
 * and the narrow interface makes an accidental learner-side read impossible to
 * wire. The in-memory store below adds an `all()` for test assertions only.
 *
 * Async for the same reason `AnswerStore` is: the production store is Supabase
 * Postgres over the network (see `supabase-storage.ts`).
 */
export interface FeedbackStore {
  record(feedback: FeedbackRecord): Promise<void>;
}

interface FeedbackRow {
  kind: "general" | "question";
  cardId: string | null;
  comment: string;
  context: string | null;
  createdAt: string;
}

/**
 * A better-sqlite3 feedback store for local dev and tests, satisfying the
 * production {@link FeedbackStore} seam plus an `all()` the route never uses but
 * tests read to assert what was recorded (prior art: {@link createAnswerStore}).
 * `context` is stored as a JSON string, mirroring the jsonb column in Postgres.
 */
export function createFeedbackStore(
  db: Database.Database,
): FeedbackStore & { all(): Promise<FeedbackRecord[]> } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      card_id TEXT,
      comment TEXT NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL
    )
  `);

  const insert = db.prepare(
    "INSERT INTO feedback (kind, card_id, comment, context, created_at) VALUES (@kind, @cardId, @comment, @context, @createdAt)",
  );
  const selectAll = db.prepare(
    "SELECT kind, card_id AS cardId, comment, context, created_at AS createdAt FROM feedback ORDER BY id",
  );

  return {
    async record(feedback) {
      insert.run({
        kind: feedback.kind,
        cardId: feedback.cardId,
        comment: feedback.comment,
        context: feedback.context === null ? null : JSON.stringify(feedback.context),
        createdAt: feedback.createdAt,
      });
    },
    async all() {
      return (selectAll.all() as FeedbackRow[]).map((row) => ({
        kind: row.kind,
        cardId: row.cardId,
        comment: row.comment,
        context: row.context === null ? null : (JSON.parse(row.context) as FeedbackContext),
        createdAt: row.createdAt,
      }));
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
      asked_at TEXT NOT NULL
    )
  `);

  const insert = db.prepare(
    "INSERT INTO answers (card_id, input, correct, asked_at) VALUES (@cardId, @input, @correct, @askedAt)",
  );
  const selectAll = db.prepare(
    "SELECT card_id AS cardId, input, correct, asked_at AS askedAt FROM answers ORDER BY id",
  );

  return {
    async record(answer) {
      insert.run({ ...answer, correct: answer.correct ? 1 : 0 });
    },
    async all() {
      return (selectAll.all() as AnswerRow[]).map((row) => ({
        cardId: row.cardId,
        input: row.input,
        correct: row.correct === 1,
        askedAt: row.askedAt,
      }));
    },
  };
}

/** Opens a better-sqlite3 database at a file path (or `:memory:`). */
export function openDatabase(filename: string): Database.Database {
  return new Database(filename);
}
