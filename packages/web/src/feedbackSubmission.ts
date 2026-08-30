import type { FeedbackRequest } from "@geo/contract";
import { useState } from "react";
import { submitFeedback } from "./apiClient.js";

/**
 * How far a submission has got. Named a phase, not a status, because CONTEXT.md
 * gives Status to where a piece of feedback stands with the operator
 * (`unresolved`/`resolved`) — a different thing this surface never sees.
 * `signed-out` is a refusal rather than a failure: the surface knew the learner
 * was signed out and never sent the request. The server would 401 it and the RLS
 * policy would reject the insert behind that; neither should be how a learner
 * finds out.
 */
export type SubmissionPhase = "editing" | "sending" | "sent" | "error" | "signed-out";

/**
 * The submission half of a feedback surface, shared by the general tab and the
 * quiz card's per-question control. Both run the same cycle around one POST;
 * only their markup and what they put in the body differ. Returns the current
 * phase, a `send` answering whether the feedback landed (so each caller decides
 * what to clear), and a `reset` for when the learner edits again.
 */
export function useFeedbackSubmission(isSignedIn: boolean) {
  const [phase, setPhase] = useState<SubmissionPhase>("editing");

  async function send(body: FeedbackRequest): Promise<boolean> {
    if (!isSignedIn) {
      setPhase("signed-out");
      return false;
    }
    setPhase("sending");
    try {
      await submitFeedback(body);
      setPhase("sent");
      return true;
    } catch {
      setPhase("error");
      return false;
    }
  }

  /** Back to editing — used when the learner types again or abandons the draft. */
  function reset() {
    setPhase("editing");
  }

  return { phase, send, reset };
}
