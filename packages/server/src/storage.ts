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
