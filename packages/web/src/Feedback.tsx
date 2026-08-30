import { type FormEvent, useState } from "react";
import { readSignedIn } from "./auth.js";
import { useFeedbackSubmission } from "./feedbackSubmission.js";

interface FeedbackProps {
  /**
   * Whether a learner is signed in, read from the auth boundary by default.
   * Feedback is attributable, so this surface checks for itself rather than
   * trusting the app-wide gate — anonymous visitors are coming, and the answer
   * has to stay no here. The sign-in-request flow for them is still deferred.
   */
  isSignedIn?: boolean;
}

/**
 * The general feedback view: a single textarea a signed-in learner types
 * freeform thoughts into and submits. Empty text is refused (the app never
 * records a blank note). On success an inline confirmation shows and the box
 * resets, so a second note can follow immediately — the learner can never read
 * feedback back, so the confirmation is the only signal it went through.
 */
export function Feedback({ isSignedIn = readSignedIn() }: FeedbackProps) {
  const [comment, setComment] = useState("");
  const { status, send, reset } = useFeedbackSubmission(isSignedIn);

  if (!isSignedIn) {
    return <p className="quiz-message">Sign in to send feedback.</p>;
  }

  const trimmed = comment.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed.length === 0) return;
    // A failed send keeps the note in the box so it is not lost to a retry.
    if (await send({ kind: "general", comment: trimmed })) setComment("");
  }

  return (
    <div className="feedback">
      <div className="feedback__head">
        <h2 className="feedback__title">Feedback</h2>
        <p className="feedback__sub">
          Tell us anything about the app. We read every note, though you won’t see
          them back here.
        </p>
      </div>

      <form className="feedback__form" onSubmit={submit}>
        <textarea
          className="feedback__box"
          aria-label="Your feedback"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            if (status !== "editing") reset();
          }}
          rows={6}
          autoFocus
        />
        <div className="feedback__bar">
          {status === "sent" && (
            <p role="status" className="feedback__note feedback__note--sent">
              Thanks — your feedback was sent.
            </p>
          )}
          {status === "error" && (
            <p role="status" className="feedback__note feedback__note--error">
              Couldn’t send that. Try again.
            </p>
          )}
          <div className="feedback__bar-spacer" />
          <button
            type="button"
            className="feedback__cancel"
            onClick={() => {
              setComment("");
              reset();
            }}
            disabled={comment.length === 0}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            type="submit"
            disabled={trimmed.length === 0 || status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}
