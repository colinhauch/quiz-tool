import { type FormEvent, useState } from "react";
import { apiClient, type ApiClient } from "./apiClient.js";

interface FeedbackProps {
  /**
   * Whether a learner is signed in. Feedback is attributable, so an unauthed
   * visitor is guarded out here rather than allowed to submit (spec #160). The
   * app is signed-in-only today, so this defaults to true; the sign-in-request
   * flow for real unauthed visitors is deferred.
   */
  isSignedIn?: boolean;
  /** The client that performs the POST; injectable so tests can drive the seam. */
  client?: ApiClient;
}

type Status = "editing" | "sending" | "sent" | "error";

/**
 * The general feedback view: a single textarea a signed-in learner types
 * freeform thoughts into and submits. Empty text is refused (the app never
 * records a blank note). On success an inline confirmation shows and the box
 * resets, so a second note can follow immediately — the learner can never read
 * feedback back, so the confirmation is the only signal it went through.
 */
export function Feedback({ isSignedIn = true, client = apiClient }: FeedbackProps) {
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("editing");

  if (!isSignedIn) {
    return <p className="quiz-message">Sign in to send feedback.</p>;
  }

  const trimmed = comment.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed.length === 0) return;
    setStatus("sending");
    try {
      await client.submitFeedback({ kind: "general", comment: trimmed });
      setComment("");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
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
            if (status !== "editing") setStatus("editing");
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
