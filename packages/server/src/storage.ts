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
 */
export interface AnswerStore {
  record(answer: AnswerRecord): void;
  all(): AnswerRecord[];
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
  read(): string[] | null;
  write(packIds: string[]): void;
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

  return {
    read() {
      if (!wasSaved.get()) return null;
      return (selectAll.all() as { packId: string }[]).map((row) => row.packId);
    },
    write: db.transaction((packIds: string[]) => {
      clear.run();
      for (const packId of packIds) insert.run(packId);
      markSaved.run(new Date().toISOString());
    }),
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
    record(answer) {
      insert.run({ ...answer, correct: answer.correct ? 1 : 0 });
    },
    all() {
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
