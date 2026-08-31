import { describe, expect, it } from "vitest";
import { projectUserRows } from "./userRowProjection.js";
import type { AdminAnswerRow, AdminUser } from "./read-store.js";

const USERS: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

function answer(userId: string, askedAt: string): AdminAnswerRow {
  return { userId, cardId: "S1:object", input: "Japan", correct: true, askedAt };
}

describe("projectUserRows", () => {
  it("counts each user's answers in this environment and dates their most recent one", () => {
    const rows = projectUserRows(USERS, [
      answer("u1", "2026-08-20T00:00:00.000Z"),
      answer("u1", "2026-08-22T00:00:00.000Z"),
      answer("u2", "2026-08-21T00:00:00.000Z"),
    ]);
    expect(rows.find((r) => r.id === "u1")).toMatchObject({ answerCount: 2, lastAnsweredAt: "2026-08-22T00:00:00.000Z" });
    expect(rows.find((r) => r.id === "u2")).toMatchObject({ answerCount: 1, lastAnsweredAt: "2026-08-21T00:00:00.000Z" });
  });

  // The roster is shared across environments; the activity is not. A user who
  // registered but never played *here* must still appear, as a real zero.
  it("keeps a user with no activity in this environment, as a zero rather than an omission", () => {
    const rows = projectUserRows(USERS, [answer("u1", "2026-08-20T00:00:00.000Z")]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "u2")).toMatchObject({ answerCount: 0, lastAnsweredAt: null });
  });

  it("keeps every user when the environment has no answers at all", () => {
    const rows = projectUserRows(USERS, []);
    expect(rows.map((r) => r.answerCount)).toEqual([0, 0]);
  });

  // An answer whose user is no longer in the roster is not a reason to invent
  // a row: the roster is the authority on who exists.
  it("ignores answers from a user absent from the roster", () => {
    const rows = projectUserRows(USERS, [answer("ghost", "2026-08-20T00:00:00.000Z")]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.answerCount === 0)).toBe(true);
  });

  it("takes the latest answer regardless of the order they arrive in", () => {
    const rows = projectUserRows(USERS, [
      answer("u1", "2026-08-22T00:00:00.000Z"),
      answer("u1", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(rows.find((r) => r.id === "u1")?.lastAnsweredAt).toBe("2026-08-22T00:00:00.000Z");
  });
});
