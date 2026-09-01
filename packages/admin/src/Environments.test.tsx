import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Environments } from "./Environments.js";

const COMPARISON = {
  registeredUsers: 4,
  environments: {
    prod: {
      status: "ok",
      usersWithAnswers: 0,
      totalAnswers: 0,
      accuracy: 0,
      distinctCardsAnswered: 0,
      firstAnswerAt: null,
      lastAnswerAt: null,
      packsWithAbilityRows: 0,
      ratedCards: 0,
    },
    dev: {
      status: "ok",
      usersWithAnswers: 3,
      totalAnswers: 120,
      accuracy: 0.75,
      distinctCardsAnswered: 44,
      firstAnswerAt: "2026-08-01T00:00:00.000Z",
      lastAnswerAt: "2026-08-29T00:00:00.000Z",
      packsWithAbilityRows: 2,
      ratedCards: 40,
    },
    test: { status: "unavailable", reason: "no AdminReadStore configured for environment test" },
  },
};

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(COMPARISON), { headers: { "content-type": "application/json" } })),
  );
}

beforeEach(mockFetch);
afterEach(() => vi.unstubAllGlobals());

describe("Environments surface", () => {
  it("compares all three environments side by side", async () => {
    render(<Environments />);
    const header = await screen.findByRole("columnheader", { name: /dev/ });
    expect(header).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /prod/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /test/ })).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("shows the shared registered-user count once, outside the per-environment table", async () => {
    render(<Environments />);
    const shared = await screen.findByTestId("shared-registered-users");
    expect(shared.textContent).toContain("4");
    // Not a row of the comparison table: the auth pool is shared, and a
    // per-column figure would imply otherwise.
    expect(screen.queryByRole("row", { name: /registered/i })).toBeNull();
  });

  it("renders an unavailable environment's reason without blanking the healthy columns", async () => {
    render(<Environments />);
    expect(await screen.findByText(/no AdminReadStore configured for environment test/)).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("states that it reads every environment, so the selector does not apply", async () => {
    render(<Environments />);
    await waitFor(() => expect(screen.getByTestId("shared-registered-users")).toBeTruthy());
    expect(screen.getByText(/reads all three environments/i)).toBeTruthy();
  });

  it("marks the selected environment's column so the two views are visibly connected", async () => {
    render(<Environments selectedEnvironment="dev" />);
    // The header carries the schema too — "dev (dev)" — so the marker is
    // asserted as a suffix on the full accessible name, not on its own.
    const marked = await screen.findByRole("columnheader", { name: /dev \(dev\) \(selected\)/ });
    expect(marked).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /prod .*selected/ })).toBeNull();
  });
});
