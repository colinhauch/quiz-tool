import { afterEach, describe, expect, it, vi } from "vitest";
import { readAutoZoomPref, writeAutoZoomPref } from "./autoZoomPref.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("autoZoomPref", () => {
  it("defaults to on when nothing is stored", () => {
    expect(readAutoZoomPref()).toBe(true);
  });

  it("round-trips a written choice", () => {
    writeAutoZoomPref(false);
    expect(readAutoZoomPref()).toBe(false);
    writeAutoZoomPref(true);
    expect(readAutoZoomPref()).toBe(true);
  });

  it("falls back to the default when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => writeAutoZoomPref(false)).not.toThrow();
    expect(readAutoZoomPref()).toBe(true);
  });
});
