import { describe, expect, it } from "vitest";
import { adminFeedbackContextSchema } from "./admin-store.js";
import { feedbackContextSchema } from "./index.js";

/**
 * The learner submits a question-feedback snapshot against `feedbackContextSchema`;
 * the operator reads it back through `adminFeedbackContextSchema`, deliberately a
 * separate shape so a change to what learners send cannot silently redefine what
 * the operator reads (#163).
 *
 * The boundary works — but its failure mode is silent. A field added to one side
 * and not the other is dropped at the read seam with no error: the admin's strict
 * schema never sees it, and the Supabase read store copies known keys only. That
 * is what happened to `context.answered` when #162 and #163 landed in parallel.
 * These tests make the drift loud. **Divergence may be the right answer** — if the
 * operator should genuinely not see a field, change the expectation here and say
 * why. What must not happen is drifting by accident.
 */

/**
 * One snapshot carrying every field both schemas declare. Kept explicit rather
 * than generated: the parity tests below check it covers every key, so adding a
 * field to either schema without adding it here fails.
 */
const FULL_CONTEXT = {
  prompt: "What country is Tokyo in?",
  packLabel: "Cities & Countries",
  packId: "core-cities",
  acceptedAnswers: ["Japan"],
  input: "Chian",
  answered: true,
};

describe("feedback context parity", () => {
  it("declares the same fields on both sides of the seam", () => {
    expect(Object.keys(adminFeedbackContextSchema.shape).sort()).toEqual(
      Object.keys(feedbackContextSchema.shape).sort(),
    );
  });

  it("covers every declared field in the parity sample", () => {
    expect(Object.keys(FULL_CONTEXT).sort()).toEqual(
      Object.keys(feedbackContextSchema.shape).sort(),
    );
  });

  // Same input, same output: a field typed differently on the two sides (say
  // `answered` as a string here and a boolean there) fails here rather than
  // being quietly reshaped between submission and review.
  it("accepts a full snapshot identically on both sides", () => {
    expect(feedbackContextSchema.parse(FULL_CONTEXT)).toEqual(FULL_CONTEXT);
    expect(adminFeedbackContextSchema.parse(FULL_CONTEXT)).toEqual(FULL_CONTEXT);
  });

  // Every field is optional on both sides: a flag raised before answering has no
  // input, and general feedback carries no context at all.
  it("accepts an empty snapshot on both sides", () => {
    expect(feedbackContextSchema.parse({})).toEqual({});
    expect(adminFeedbackContextSchema.parse({})).toEqual({});
  });

  // Both sides reject unknown keys, so neither can be widened by accident — the
  // admin's strictness is what makes the read-store whitelist load-bearing.
  it("rejects an unknown field on both sides", () => {
    const leak = { ...FULL_CONTEXT, userEmail: "leak@example.com" };
    expect(feedbackContextSchema.safeParse(leak).success).toBe(false);
    expect(adminFeedbackContextSchema.safeParse(leak).success).toBe(false);
  });
});
