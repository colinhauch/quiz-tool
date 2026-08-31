import { describe, expect, it } from "vitest";
import { buildFeedbackRows, filterFeedbackRows } from "./feedbackProjection.js";
import type { AdminFeedbackRecord, AdminUser } from "./read-store.js";

const USERS: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: null, createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

const RECORDS: AdminFeedbackRecord[] = [
  {
    id: 1,
    userId: "u1",
    kind: "general",
    comment: "Love the app",
    status: "resolved",
    createdAt: "2026-08-28T00:00:00.000Z",
  },
  {
    id: 2,
    userId: "u2",
    kind: "question",
    cardId: "S1:object",
    comment: "This question is wrong",
    status: "unresolved",
    createdAt: "2026-08-30T00:00:00.000Z",
    context: { prompt: "Capital of Japan?", packLabel: "Capital Cities", packId: "capital-cities", acceptedAnswers: ["Tokyo"] },
  },
];

describe("buildFeedbackRows", () => {
  it("resolves the submitter's email and orders newest-first", () => {
    const rows = buildFeedbackRows(USERS, RECORDS);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0]?.userEmail).toBeNull();
    expect(rows[1]?.userEmail).toBe("a@example.com");
  });

  it("carries the captured context through untouched", () => {
    const rows = buildFeedbackRows(USERS, RECORDS);
    expect(rows[0]?.context).toEqual(RECORDS[1]?.context);
    expect(rows[1]?.context).toBeUndefined();
  });

  it("leaves the email null when the submitter is no longer a known user", () => {
    const rows = buildFeedbackRows([], RECORDS);
    expect(rows.every((r) => r.userEmail === null)).toBe(true);
  });
});

describe("filterFeedbackRows", () => {
  const rows = buildFeedbackRows(USERS, RECORDS);

  it("returns everything when no filter is given", () => {
    expect(filterFeedbackRows(rows, {})).toHaveLength(2);
  });

  it("filters by status", () => {
    expect(filterFeedbackRows(rows, { status: "unresolved" }).map((r) => r.id)).toEqual([2]);
    expect(filterFeedbackRows(rows, { status: "resolved" }).map((r) => r.id)).toEqual([1]);
  });

  it("filters by kind", () => {
    expect(filterFeedbackRows(rows, { kind: "general" }).map((r) => r.id)).toEqual([1]);
    expect(filterFeedbackRows(rows, { kind: "question" }).map((r) => r.id)).toEqual([2]);
  });

  it("composes status and kind", () => {
    expect(filterFeedbackRows(rows, { status: "resolved", kind: "question" })).toEqual([]);
  });
});
