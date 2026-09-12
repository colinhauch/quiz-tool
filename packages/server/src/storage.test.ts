import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TIERS, type Scheduler } from "@geo/engine";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AnswerRecord,
  createAnswerStore,
  createFeedbackStore,
  createPreferencesStore,
  createRatingStore,
  createSchedulerStore,
  type FeedbackRecord,
  openDatabase,
} from "./storage.js";

const answer: AnswerRecord = {
  cardId: "cc:tokyo-japan:object",
  input: "Japan",
  correct: true,
  askedAt: "2026-07-19T12:00:00.000Z",
};

describe("createPreferencesStore (in-memory)", () => {
  it("returns every default for a learner with no stored row", async () => {
    const store = createPreferencesStore(openDatabase(":memory:"));
    expect(await store.read()).toEqual({ autoZoom: true, autocomplete: true, mapProjection: "equal-earth" });
  });

  it("writes the blob and reads it back", async () => {
    const store = createPreferencesStore(openDatabase(":memory:"));
    await store.write({ autoZoom: false, autocomplete: false, mapProjection: "equirectangular" });
    expect(await store.read()).toEqual({ autoZoom: false, autocomplete: false, mapProjection: "equirectangular" });
  });

  it("replaces wholesale on write", async () => {
    const store = createPreferencesStore(openDatabase(":memory:"));
    await store.write({ autoZoom: false, autocomplete: false, mapProjection: "equal-earth" });
    await store.write({ autoZoom: true, autocomplete: false, mapProjection: "equal-earth" });
    expect(await store.read()).toEqual({ autoZoom: true, autocomplete: false, mapProjection: "equal-earth" });
  });

  it("defaults a key missing from an older stored blob", async () => {
    const db = openDatabase(":memory:");
    const store = createPreferencesStore(db);
    // Simulate a blob written before `autocomplete`/`mapProjection` existed.
    db.prepare("INSERT INTO user_preferences (id, preferences) VALUES (1, ?)").run(
      JSON.stringify({ autoZoom: false }),
    );
    expect(await store.read()).toEqual({ autoZoom: false, autocomplete: true, mapProjection: "equal-earth" });
  });
});

describe("createAnswerStore (in-memory)", () => {
  it("writes an answer and reads it back", async () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    await store.record(answer);
    expect(await store.all()).toEqual([answer]);
  });

  it("preserves correctness as a boolean and keeps insertion order", async () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    await store.record(answer);
    await store.record({ ...answer, input: "China", correct: false });
    const all = await store.all();
    expect(all.map((a) => a.correct)).toEqual([true, false]);
    expect(all[1]?.input).toBe("China");
  });

  it("starts empty", async () => {
    expect(await createAnswerStore(openDatabase(":memory:")).all()).toEqual([]);
  });

  it("round-trips the ask-time rating snapshot", async () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    const withSnapshot: AnswerRecord = {
      ...answer,
      snapshot: { difficulty: 1500, ability: 1520.5, kApplied: 40, packId: "capital-cities" },
    };
    await store.record(withSnapshot);
    expect(await store.all()).toEqual([withSnapshot]);
  });

  it("omits snapshot when the answer carried none (edge not in graph)", async () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    await store.record(answer);
    const [read] = await store.all();
    expect(read).toEqual(answer);
    expect(read?.snapshot).toBeUndefined();
  });
});

describe("createRatingStore (in-memory)", () => {
  it("seeds unseen card and pack at 1500", async () => {
    const store = createRatingStore(openDatabase(":memory:"));
    expect(await store.readCard("cc:tokyo-japan:object")).toEqual({ difficulty: 1500, answerCount: 0 });
    expect(await store.readAbility("capital-cities")).toBe(1500);
  });

  it("round-trips difficulty, answer count, and ability", async () => {
    const store = createRatingStore(openDatabase(":memory:"));
    await store.writeCard("cc:tokyo-japan:object", 1480.25, 3);
    await store.writeAbility("capital-cities", 1521.75);
    expect(await store.readCard("cc:tokyo-japan:object")).toEqual({ difficulty: 1480.25, answerCount: 3 });
    expect(await store.readAbility("capital-cities")).toBe(1521.75);
  });

  it("upserts rather than duplicating on repeated writes", async () => {
    const store = createRatingStore(openDatabase(":memory:"));
    await store.writeCard("cc:tokyo-japan:object", 1490, 1);
    await store.writeCard("cc:tokyo-japan:object", 1470, 2);
    expect(await store.readCard("cc:tokyo-japan:object")).toEqual({ difficulty: 1470, answerCount: 2 });
  });
});

const generalFeedback: FeedbackRecord = {
  kind: "general",
  cardId: null,
  comment: "The map is gorgeous.",
  context: null,
  createdAt: "2026-08-29T12:00:00.000Z",
};

const questionFeedback: FeedbackRecord = {
  kind: "question",
  cardId: "cc:tokyo-japan:object",
  comment: "This question is wrong",
  context: {
    prompt: "What country is Tokyo in?",
    packLabel: "Cities & Countries",
    packId: "core-cities",
    acceptedAnswers: ["Japan"],
    input: "China",
  },
  createdAt: "2026-08-29T12:05:00.000Z",
};

describe("createFeedbackStore (in-memory)", () => {
  it("records general feedback and reads it back", async () => {
    const store = createFeedbackStore(openDatabase(":memory:"));
    await store.record(generalFeedback);
    expect(await store.all()).toEqual([generalFeedback]);
  });

  it("round-trips a question report's card_id and jsonb context, in insertion order", async () => {
    const store = createFeedbackStore(openDatabase(":memory:"));
    await store.record(generalFeedback);
    await store.record(questionFeedback);
    expect(await store.all()).toEqual([generalFeedback, questionFeedback]);
  });

  it("starts empty", async () => {
    expect(await createFeedbackStore(openDatabase(":memory:")).all()).toEqual([]);
  });
});

const scheduler: Scheduler = {
  included: ["capital-cities"],
  tiers: DEFAULT_TIERS,
  packRatio: {},
  difficultyBag: ["medium", "easy", "hard"],
  packBag: ["capital-cities"],
  drawn: ["cc:tokyo-japan:object"],
  current: "cc:paris-france:object",
};

describe("createSchedulerStore (in-memory)", () => {
  it("reads null before anything is written", async () => {
    const store = createSchedulerStore(openDatabase(":memory:"));
    expect(await store.read()).toBeNull();
  });

  it("round-trips the whole scheduler value", async () => {
    const store = createSchedulerStore(openDatabase(":memory:"));
    await store.write(scheduler);
    expect(await store.read()).toEqual(scheduler);
  });

  it("overwrites the whole value on rewrite (single row)", async () => {
    const store = createSchedulerStore(openDatabase(":memory:"));
    await store.write(scheduler);
    const next: Scheduler = { ...scheduler, drawn: [], current: null, included: ["core-geo"] };
    await store.write(next);
    expect(await store.read()).toEqual(next);
  });
});

describe("createAnswerStore (real file)", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("persists across separate connections to the same file", async () => {
    dir = mkdtempSync(join(tmpdir(), "geo-store-"));
    const file = join(dir, "answers.sqlite");

    const writer = openDatabase(file);
    await createAnswerStore(writer).record(answer);
    writer.close();

    const reader = openDatabase(file);
    expect(await createAnswerStore(reader).all()).toEqual([answer]);
    reader.close();
  });
});

/**
 * A database as it stood before #119 added the rating-snapshot columns to
 * `answers`. This is what a developer who has been running the app since then
 * actually has on disk, and `CREATE TABLE IF NOT EXISTS` leaves it untouched.
 */
function preSnapshotDatabase(file = ":memory:") {
  const db = openDatabase(file);
  db.exec(`
    CREATE TABLE answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      input TEXT NOT NULL,
      correct INTEGER NOT NULL,
      asked_at TEXT NOT NULL
    )
  `);
  return db;
}

describe("opening a store over an older database", () => {
  it("adds the columns an existing table is missing rather than failing to open", async () => {
    // The bug this replaces: the store's INSERT named card_difficulty, the
    // table predated it, and the server died at boot with SQLITE_ERROR.
    const db = preSnapshotDatabase();
    expect(() => createAnswerStore(db)).not.toThrow();
  });

  it("keeps the answers already in the older table", async () => {
    const db = preSnapshotDatabase();
    db.exec(
      `INSERT INTO answers (card_id, input, correct, asked_at)
       VALUES ('cc:tokyo-japan:object', 'Japan', 1, '2026-07-19T12:00:00.000Z')`,
    );

    // Upgrading is not a reset: the log is append-only and irreplaceable.
    expect(await createAnswerStore(db).all()).toEqual([answer]);
  });

  it("reads a pre-upgrade answer as carrying no snapshot, not a broken one", async () => {
    const db = preSnapshotDatabase();
    db.exec(
      `INSERT INTO answers (card_id, input, correct, asked_at)
       VALUES ('cc:tokyo-japan:object', 'Japan', 1, '2026-07-19T12:00:00.000Z')`,
    );
    const [read] = await createAnswerStore(db).all();
    expect(read?.snapshot).toBeUndefined();
  });

  it("accepts new answers, snapshot and all, once upgraded", async () => {
    const store = createAnswerStore(preSnapshotDatabase());
    const withSnapshot: AnswerRecord = {
      ...answer,
      snapshot: { difficulty: 1500, ability: 1520.5, kApplied: 40, packId: "capital-cities" },
    };
    await store.record(withSnapshot);
    expect(await store.all()).toEqual([withSnapshot]);
  });

  it("upgrades the file on disk, so the next boot has nothing left to do", async () => {
    const dir = mkdtempSync(join(tmpdir(), "geo-upgrade-"));
    try {
      const file = join(dir, "answers.sqlite");
      const stale = preSnapshotDatabase(file);
      createAnswerStore(stale);
      stale.close();

      const reopened = openDatabase(file);
      const columns = (reopened.pragma("table_info(answers)") as { name: string }[]).map(
        (c) => c.name,
      );
      expect(columns).toContain("card_difficulty");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent — opening an already-current database changes nothing", async () => {
    const db = openDatabase(":memory:");
    createAnswerStore(db);
    const before = (db.pragma("table_info(answers)") as { name: string }[]).map((c) => c.name);
    createAnswerStore(db);
    expect((db.pragma("table_info(answers)") as { name: string }[]).map((c) => c.name)).toEqual(
      before,
    );
  });

  it("says what is wrong when a missing column cannot be added", async () => {
    // SQLite cannot ADD COLUMN a NOT NULL with no default. That is a mistake in
    // a future schema edit, not something a learner's database can cause — so it
    // should name the column, rather than surfacing as SQLITE_ERROR at boot.
    const db = openDatabase(":memory:");
    db.exec(`
      CREATE TABLE feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        card_id TEXT,
        context TEXT,
        created_at TEXT NOT NULL
      )
    `);
    expect(() => createFeedbackStore(db)).toThrow(/feedback\.comment/);
  });
});
