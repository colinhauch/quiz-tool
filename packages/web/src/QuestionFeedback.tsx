import type { FeedbackContext } from "@geo/contract";
import { type FormEvent, useState } from "react";
import { submitFeedback } from "./apiClient.js";

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
   * Whether a learner is signed in. Feedback is attributable, so the control is
   * withheld entirely from a signed-out visitor rather than failing at submit
   * (the RLS policy would reject the insert anyway). Defaults to true because
   * the app is signed-in-only today; see {@link Feedback} for the same guard.
   */
  isSignedIn?: boolean;
}

type Status = "editing" | "sending" | "sent" | "error";

/**
 * The per-question feedback control on the quiz card: a small text button that
 * opens an inline comment box. Present in both the asking and answered states,
 * so a broken prompt and a wrong accepted answer are equally reportable. On
 * success the box closes and an inline confirmation takes its place — the only
 * signal the report landed, since learners can never read feedback back. On
 * failure the box stays open so nothing typed is lost.
 */
export function QuestionFeedback({ cardId, context, isSignedIn = true }: QuestionFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("editing");

  if (!isSignedIn) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      await submitFeedback({
        kind: "question",
        card_id: cardId,
        comment: comment.trim() || DEFAULT_QUESTION_COMMENT,
        context,
      });
      setComment("");
      setIsOpen(false);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (!isOpen) {
    return (
      <div className="question-feedback">
        {status === "sent" && (
          <p role="status" className="feedback__note feedback__note--sent">
            Thanks — we’ll take a look at this question.
          </p>
        )}
        <button
          type="button"
          className="question-feedback__open"
          onClick={() => {
            setStatus("editing");
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
          if (status === "error") setStatus("editing");
        }}
        rows={3}
      />
      <div className="question-feedback__bar">
        {status === "error" && (
          <p role="status" className="feedback__note feedback__note--error">
            Couldn’t send that. Try again.
          </p>
        )}
        <div className="feedback__bar-spacer" />
        <button
          type="button"
          className="question-feedback__cancel"
          onClick={() => {
            setComment("");
            setIsOpen(false);
            setStatus("editing");
          }}
        >
          Cancel
        </button>
        <button className="btn-primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
