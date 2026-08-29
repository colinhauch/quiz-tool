import type { FeedbackRequest } from "@geo/contract";

/** Where the browser reaches the Node server; `/api` is proxied in dev (see vite.config.ts). */
const FEEDBACK_URL = "/api/feedback";

/**
 * The one place feedback crosses the wire. Components call this rather than
 * `fetch` directly, so the request shape lives in one spot and the seam is
 * mockable in tests (prior art in the parent spec #160). It intentionally has no
 * read method: the feedback channel is write-only for learners.
 */
export const apiClient = {
  /** POST a feedback report. Rejects if the server does not accept it. */
  async submitFeedback(body: FeedbackRequest): Promise<void> {
    const res = await fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`feedback submission failed: ${res.status}`);
  },
};

export type ApiClient = typeof apiClient;
