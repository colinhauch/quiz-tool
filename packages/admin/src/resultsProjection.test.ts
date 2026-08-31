import { describe, expect, it } from "vitest";
import { buildResultRows, buildResultsResponse, filterResultRows } from "./resultsProjection.js";
import { fixtureReadStorePack } from "./test-fixtures.js";
import type { AdminUser } from "./read-store.js";

const users: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
];

const answers = [
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
  { userId: "u2", cardId: "S2:object", input: "wrong", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
];

describe("buildResultRows", () => {
  it("resolves every answer to a row carrying which user answered it", () => {
    const rows = buildResultRows(fixtureReadStorePack(), users, answers);
    expect(rows).toEqual([
      {
        cardId: "S1:object",
        input: "Japan",
        correct: true,
        askedAt: "2026-08-20T00:00:00.000Z",
        statementId: "S1",
        relation: "located_in",
        packId: "test-pack",
        subjectEntityId: "Q1490",
        userId: "u1",
        userEmail: "a@example.com",
      },
      {
        cardId: "S2:object",
        input: "wrong",
        correct: false,
        askedAt: "2026-08-21T00:00:00.000Z",
        statementId: "S2",
        relation: "capital_of",
        packId: "other-pack",
        subjectEntityId: "Q64",
        userId: "u2",
        userEmail: "b@example.com",
      },
    ]);
  });
});

describe("filterResultRows", () => {
  const rows = buildResultRows(fixtureReadStorePack(), users, answers);

  it("returns every row when no filter is set", () => {
    expect(filterResultRows(rows, {})).toEqual(rows);
  });

  it("filters by user, pack, Relation, correctness — composably", () => {
    expect(filterResultRows(rows, { userId: "u1" })).toEqual([rows[0]]);
    expect(filterResultRows(rows, { packId: "other-pack" })).toEqual([rows[1]]);
    expect(filterResultRows(rows, { relation: "located_in" })).toEqual([rows[0]]);
    expect(filterResultRows(rows, { correct: false })).toEqual([rows[1]]);
    expect(filterResultRows(rows, { userId: "u1", correct: true })).toEqual([rows[0]]);
    expect(filterResultRows(rows, { userId: "u1", correct: false })).toEqual([]);
  });

  it("filters by an inclusive date range, a bare date bound included through end of day", () => {
    expect(filterResultRows(rows, { from: "2026-08-21" })).toEqual([rows[1]]);
    expect(filterResultRows(rows, { to: "2026-08-20" })).toEqual([rows[0]]);
    expect(filterResultRows(rows, { from: "2026-08-20", to: "2026-08-21" })).toEqual(rows);
  });
});

describe("buildResultsResponse", () => {
  it("summarizes the (already filtered) rows it's given", () => {
    const rows = buildResultRows(fixtureReadStorePack(), users, answers);
    expect(buildResultsResponse(rows)).toEqual({ rows, total: 2, accuracy: 0.5 });
  });

  it("returns zero accuracy for an empty set rather than NaN", () => {
    expect(buildResultsResponse([])).toEqual({ rows: [], total: 0, accuracy: 0 });
  });
});
