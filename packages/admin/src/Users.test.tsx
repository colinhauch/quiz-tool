import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Users } from "./Users.js";

const USERS = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: "2026-08-20T00:00:00.000Z" },
  { id: "u2", email: null, createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

function mockFetchSequence() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (String(input) === "/api/users") return new Response(JSON.stringify(USERS), { status: 200 });
      return new Response(null, { status: 404 });
    }),
  );
}

describe("Users surface", () => {
  beforeEach(() => {
    mockFetchSequence();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every user through the cross-user seam", async () => {
    render(<Users />);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
  });
});
