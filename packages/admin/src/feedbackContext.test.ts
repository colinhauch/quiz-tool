import { adminFeedbackContextSchema } from "@geo/contract";
import { describe, expect, it } from "vitest";
import { toFeedbackContext } from "./supabase-read-store.js";

/**
 * The second place a feedback context field can vanish silently. The contract
 * parity test (`feedback-context-parity.test.ts`) holds the two *schemas* to the
 * same shape; this holds the read store's hand-written whitelist to the admin
 * schema. Both guards are needed: a field can be declared on both sides and
 * still never reach the operator because nothing copies it out of the jsonb.
 *
 * The whitelist itself is deliberate — `context` is jsonb, so a row written
 * out-of-band could carry anything, and the route's strict parse would fail the
 * whole request over one bad row.
 */
const FULL_CONTEXT = {
  prompt: "What country is Tokyo in?",
  packLabel: "Cities & Countries",
  packId: "core-cities",
  acceptedAnswers: ["Japan"],
  input: "Chian",
  answered: true,
};

describe("toFeedbackContext", () => {
  it("copies every field the admin contract declares", () => {
    // Driven off the schema, so a field added there and forgotten here fails.
    expect(Object.keys(FULL_CONTEXT).sort()).toEqual(
      Object.keys(adminFeedbackContextSchema.shape).sort(),
    );
    expect(toFeedbackContext(FULL_CONTEXT)).toEqual(FULL_CONTEXT);
  });

  it("keeps a pre-answer snapshot's answered flag rather than dropping it", () => {
    const before = { prompt: "What country is Tokyo in?", packId: "core-cities", answered: false };
    expect(toFeedbackContext(before)).toEqual(before);
  });

  // The point of the whitelist: an out-of-band row cannot widen what the strict
  // route schema sees, so one bad row can't take the whole surface down.
  it("drops unknown and wrongly-typed fields", () => {
    expect(
      toFeedbackContext({
        prompt: "kept",
        answered: "yes",
        acceptedAnswers: "Tokyo",
        scribbledByHand: true,
      }),
    ).toEqual({ prompt: "kept" });
  });

  it("keeps only the string entries of acceptedAnswers", () => {
    expect(toFeedbackContext({ acceptedAnswers: ["Japan", 7, null] })).toEqual({
      acceptedAnswers: ["Japan"],
    });
  });
});
