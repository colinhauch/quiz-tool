import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreferences, putPreferences } from "./apiClient.js";
import {
  currentPreferences,
  loadPreferences,
  readAutocompletePref,
  readAutoZoomPref,
  writeAutocompletePref,
  writeAutoZoomPref,
} from "./preferences.js";

// The store is the unit under test; the network seam is mocked so we assert what
// it reads from and writes back, not how it reaches the server (apiClient has its
// own tests). vi.mock is hoisted above the imports above.
vi.mock("./apiClient.js", () => ({
  getPreferences: vi.fn(),
  putPreferences: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getPreferences).mockReset();
  vi.mocked(putPreferences).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preferences store", () => {
  it("resolves read helpers from the synced blob after bootstrap", async () => {
    vi.mocked(getPreferences).mockResolvedValue({ preferences: { autoZoom: false, autocomplete: true } });

    await loadPreferences();

    expect(readAutoZoomPref()).toBe(false);
    expect(readAutocompletePref()).toBe(true);
  });

  it("falls back to defaults when the bootstrap read fails", async () => {
    vi.mocked(getPreferences).mockRejectedValue(new Error("network"));

    await loadPreferences();

    // Both defaults are on, so a failed read never leaves a learner worse off.
    expect(readAutoZoomPref()).toBe(true);
    expect(readAutocompletePref()).toBe(true);
  });

  it("writes update the in-memory blob and PUT the whole object", async () => {
    vi.mocked(getPreferences).mockResolvedValue({ preferences: { autoZoom: true, autocomplete: true } });
    await loadPreferences();

    writeAutoZoomPref(false);

    expect(readAutoZoomPref()).toBe(false);
    expect(putPreferences).toHaveBeenLastCalledWith({ autoZoom: false, autocomplete: true });

    writeAutocompletePref(false);

    expect(readAutocompletePref()).toBe(false);
    expect(currentPreferences()).toEqual({ autoZoom: false, autocomplete: false });
    expect(putPreferences).toHaveBeenLastCalledWith({ autoZoom: false, autocomplete: false });
  });

  it("never touches localStorage", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(getPreferences).mockResolvedValue({ preferences: { autoZoom: true, autocomplete: true } });

    await loadPreferences();
    readAutoZoomPref();
    readAutocompletePref();
    writeAutoZoomPref(false);
    writeAutocompletePref(false);

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
