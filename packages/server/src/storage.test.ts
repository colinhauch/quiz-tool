import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AnswerRecord, createAnswerStore, openDatabase } from "./storage.js";

const answer: AnswerRecord = {
  cardId: "cc:tokyo-japan:object",
  input: "Japan",
  correct: true,
  askedAt: "2026-07-19T12:00:00.000Z",
};

describe("createAnswerStore (in-memory)", () => {
  it("writes an answer and reads it back", () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    store.record(answer);
    expect(store.all()).toEqual([answer]);
  });

  it("preserves correctness as a boolean and keeps insertion order", () => {
    const store = createAnswerStore(openDatabase(":memory:"));
    store.record(answer);
    store.record({ ...answer, input: "China", correct: false });
    const all = store.all();
    expect(all.map((a) => a.correct)).toEqual([true, false]);
    expect(all[1]?.input).toBe("China");
  });

  it("starts empty", () => {
    expect(createAnswerStore(openDatabase(":memory:")).all()).toEqual([]);
  });
});

describe("createAnswerStore (real file)", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("persists across separate connections to the same file", () => {
    dir = mkdtempSync(join(tmpdir(), "geo-store-"));
    const file = join(dir, "answers.sqlite");

    const writer = openDatabase(file);
    createAnswerStore(writer).record(answer);
    writer.close();

    const reader = openDatabase(file);
    expect(createAnswerStore(reader).all()).toEqual([answer]);
    reader.close();
  });
});
