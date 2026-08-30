import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnvironmentPref, writeEnvironmentPref } from "./environmentPref.js";

/**
 * `environmentPref` (#172) follows the same shape as `@geo/web`'s
 * `autocompletePref.ts` / `autoZoomPref.ts` — guarded `localStorage` access
 * that never breaks the app when storage is blocked — but with a different
 * default, deliberately: nothing persisted means `dev`, not the "safe"
 * `true`/`false` those modules fall back to. See the module's own doc comment
 * for why.
 */
describe("environmentPref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("defaults to dev when nothing is stored", () => {
    expect(readEnvironmentPref()).toBe("dev");
  });

  it("round-trips a written choice", () => {
    writeEnvironmentPref("prod");
    expect(readEnvironmentPref()).toBe("prod");
    writeEnvironmentPref("test");
    expect(readEnvironmentPref()).toBe("test");
  });

  it("falls back to dev when the stored value is not a recognized environment", () => {
    localStorage.setItem("geo-admin-env", "staging");
    expect(readEnvironmentPref()).toBe("dev");
  });

  it("falls back to dev when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => writeEnvironmentPref("prod")).not.toThrow();
    expect(readEnvironmentPref()).toBe("dev");
  });
});
