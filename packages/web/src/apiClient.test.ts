import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./apiClient.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiClient.submitFeedback", () => {
  it("POSTs the feedback body as JSON to /api/feedback", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.submitFeedback({ kind: "general", comment: "The map is gorgeous." });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "general", comment: "The map is gorgeous." }),
      }),
    );
  });

  it("rejects when the server does not accept the submission", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 401 })));
    await expect(
      apiClient.submitFeedback({ kind: "general", comment: "hi" }),
    ).rejects.toThrow(/feedback submission failed/i);
  });
});
