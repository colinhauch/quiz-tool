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
