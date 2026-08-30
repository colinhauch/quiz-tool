import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `apiClient`'s single choke point attaches `?env=` to every request, reading
 * the persisted environment exactly once at module load (#172) — so these
 * tests set `localStorage` *before* importing the module (via a fresh
 * `vi.resetModules()` + dynamic `import`) rather than after, which is the
 * one thing a normal top-of-file `import` can't exercise.
 */
describe("apiClient environment attachment", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("appends ?env=<persisted environment> to a path with no existing query string", async () => {
    localStorage.setItem("geo-admin-env", "test");
    let requestedPath = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        requestedPath = String(input);
        return new Response(JSON.stringify({ status: "ok", readOnly: true }), { status: 200 });
      }),
    );

    const { getHealth } = await import("./apiClient.js");
    await getHealth();

    expect(requestedPath).toBe("/api/health?env=test");
  });

  it("merges into an existing query string rather than producing a second '?'", async () => {
    localStorage.setItem("geo-admin-env", "dev");
    let requestedPath = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        requestedPath = String(input);
        return new Response(JSON.stringify({ rows: [], total: 0, accuracy: 0 }), { status: 200 });
      }),
    );

    const { getResults } = await import("./apiClient.js");
    await getResults({ userId: "u1" });

    expect(requestedPath).toBe("/api/results?userId=u1&env=dev");
    expect((requestedPath.match(/\?/g) ?? []).length).toBe(1);
  });

  it("defaults to dev when nothing is persisted", async () => {
    let requestedPath = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        requestedPath = String(input);
        return new Response(JSON.stringify([]), { status: 200 });
      }),
    );

    const { getUsers } = await import("./apiClient.js");
    await getUsers();

    expect(requestedPath).toBe("/api/users?env=dev");
  });
});
