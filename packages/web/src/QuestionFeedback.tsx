import type { FeedbackContext } from "@geo/contract";
import { type FormEvent, useState } from "react";
import { readSignedIn } from "./auth.js";
import { useFeedbackSubmission } from "./feedbackSubmission.js";

/**
 * What an empty box submits. A learner flagging a bad question should need two
 * clicks and no typing, so the box's greyed placeholder shows this sentence and
 * submitting empty persists it verbatim (the `comment` column is not-null, and
 * the contract requires non-empty text). Placeholder copy — still to be
 * workshopped per spec #160.
 */
export const DEFAULT_QUESTION_COMMENT = "This question is wrong.";

interface QuestionFeedbackProps {
  /** The card being flagged — the operator's handle back to its entities. */
  cardId: string;
  /**
   * The snapshot of what the learner saw, built by the caller because only it
   * knows the current state: prompt and pack always, `input`/`acceptedAnswers`
   * only once the question has been answered.
   */
  context: FeedbackContext;
  /**
   * Whether a learner is signed in, read from the auth boundary by default.
   * Feedback is attributable, so this surface checks for itself rather than
   * trusting the app-wide gate — anonymous visitors are coming, and the answer
   * has to stay no here. A signed-out submit is refused locally with an error
   * rather than sent, since the route and the RLS policy would both reject it.
   */
  isSignedIn?: boolean;
}

/**
 * The per-question feedback control on the quiz card: a small text button that
 * opens an inline comment box. Present in both the asking and answered states,
 * so a broken prompt and a wrong accepted answer are equally flaggable. On
 * success the box closes and an inline confirmation takes its place — the only
 * signal the feedback landed, since learners can never read it back. On
 * failure the box stays open so nothing typed is lost.
 */
export function QuestionFeedback({
  cardId,
  context,
  isSignedIn = readSignedIn(),
}: QuestionFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const { phase, send, reset } = useFeedbackSubmission(isSignedIn);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sent = await send({
      kind: "question",
      card_id: cardId,
      comment: comment.trim() || DEFAULT_QUESTION_COMMENT,
      context,
    });
    // Only landed feedback closes the box; a refusal or a failure leaves what
    // the learner wrote where they can retry it.
    if (sent) {
      setComment("");
      setIsOpen(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="question-feedback">
        {phase === "sent" && (
          <p role="status" className="feedback__note feedback__note--sent">
            Thanks — we’ll take a look at this question.
          </p>
        )}
        <button
          type="button"
          className="question-feedback__open"
          onClick={() => {
            reset();
            setIsOpen(true);
          }}
        >
          Submit feedback about this question
        </button>
      </div>
    );
  }

  return (
    <form className="question-feedback" onSubmit={submit}>
      <textarea
        className="question-feedback__box"
        aria-label="Feedback about this question"
        placeholder={DEFAULT_QUESTION_COMMENT}
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          if (phase === "error" || phase === "signed-out") reset();
        }}
        rows={3}
      />
      <div className="question-feedback__bar">
        {phase === "error" && (
          <p role="status" className="feedback__note feedback__note--error">
            Couldn’t send that. Try again.
          </p>
        )}
        {phase === "signed-out" && (
          <p role="status" className="feedback__note feedback__note--error">
            Sign in to send feedback.
          </p>
        )}
        <div className="feedback__bar-spacer" />
        <button
          type="button"
          className="feedback__cancel"
          onClick={() => {
            setComment("");
            setIsOpen(false);
            reset();
          }}
        >
          Cancel
        </button>
        <button className="btn-primary" type="submit" disabled={phase === "sending"}>
          {phase === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
