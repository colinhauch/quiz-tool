import type { FeedbackRequest } from "@geo/contract";
import { useState } from "react";
import { submitFeedback } from "./apiClient.js";

/**
 * Where a feedback submission has got to. `signed-out` is a refusal, not a
 * failure: the surface knew the learner was signed out and never sent the
 * request — the server would 401 it and the RLS policy would reject the insert
 * behind that, but neither should be how a learner finds out.
 */
export type FeedbackStatus = "editing" | "sending" | "sent" | "error" | "signed-out";

/**
 * The submission half of a feedback surface, shared by the general tab and the
 * quiz card's per-question control. Both run the same four-state cycle around
 * one POST; only their markup and what they put in the body differ. Returns the
 * current status, a `send` that reports whether the report landed (so the caller
 * can clear its own box), and a `reset` for when the learner edits again.
 */
export function useFeedbackSubmission(isSignedIn: boolean) {
  const [status, setStatus] = useState<FeedbackStatus>("editing");

  async function send(body: FeedbackRequest): Promise<boolean> {
    if (!isSignedIn) {
      setStatus("signed-out");
      return false;
    }
    setStatus("sending");
    try {
      await submitFeedback(body);
      setStatus("sent");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }

  /** Back to editing — used when the learner types again or abandons the draft. */
  function reset() {
    setStatus("editing");
  }

  return { status, send, reset };
}
