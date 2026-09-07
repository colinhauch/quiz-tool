import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentBadge } from "./EnvironmentBadge.js";

/**
 * Stubs the `GET /api/config` fetch the badge makes on mount. `getConfig` goes
 * through `apiFetch`, so stubbing the global fetch (as Feedback.test does) is
 * what drives the component without a real server.
 */
function stubConfig(environment: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ environment }) })),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EnvironmentBadge", () => {
  it("renders the dev badge when the server reports dev", async () => {
    stubConfig("dev");
    render(<EnvironmentBadge />);
    expect(await screen.findByText("DEV")).toBeInTheDocument();
  });

  it("renders nothing on prod", async () => {
    stubConfig("prod");
    render(<EnvironmentBadge />);
    // Give the resolved fetch a chance to flush before asserting absence.
    await waitFor(() => expect(screen.queryByText("DEV")).not.toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the fail-safe unknown badge when the config request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(<EnvironmentBadge />);
    expect(await screen.findByText("UNKNOWN")).toBeInTheDocument();
  });
});
