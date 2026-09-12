import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPreferences, putPreferences } from "./apiClient.js";
import {
  currentPreferences,
  loadPreferences,
  readAutocompletePref,
  readAutoZoomPref,
  readMapProjectionPref,
  writeAutocompletePref,
  writeAutoZoomPref,
  writeMapProjectionPref,
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
    vi.mocked(getPreferences).mockResolvedValue({
      preferences: { autoZoom: false, autocomplete: true, mapProjection: "equirectangular" },
    });

    await loadPreferences();

    expect(readAutoZoomPref()).toBe(false);
    expect(readAutocompletePref()).toBe(true);
    expect(readMapProjectionPref()).toBe("equirectangular");
  });

  it("falls back to defaults when the bootstrap read fails", async () => {
    vi.mocked(getPreferences).mockRejectedValue(new Error("network"));

    await loadPreferences();

    // Both toggles default on, projection defaults to Equal Earth, so a failed
    // read never leaves a learner worse off or with a broken map.
    expect(readAutoZoomPref()).toBe(true);
    expect(readAutocompletePref()).toBe(true);
    expect(readMapProjectionPref()).toBe("equal-earth");
  });

  it("defaults mapProjection to equal-earth when the stored blob omits it", async () => {
    // A blob written before #221 has no mapProjection key; the schema defaults it.
    // Cast past the current (complete) response type to model that older stored shape.
    vi.mocked(getPreferences).mockResolvedValue({
      preferences: { autoZoom: true, autocomplete: true },
    } as Awaited<ReturnType<typeof getPreferences>>);

    await loadPreferences();

    expect(readMapProjectionPref()).toBe("equal-earth");
  });

  it("writes update the in-memory blob and PUT the whole object", async () => {
    vi.mocked(getPreferences).mockResolvedValue({
      preferences: { autoZoom: true, autocomplete: true, mapProjection: "equal-earth" },
    });
    await loadPreferences();

    writeAutoZoomPref(false);

    expect(readAutoZoomPref()).toBe(false);
    expect(putPreferences).toHaveBeenLastCalledWith({
      autoZoom: false,
      autocomplete: true,
      mapProjection: "equal-earth",
    });

    writeMapProjectionPref("equirectangular");

    expect(readMapProjectionPref()).toBe("equirectangular");
    expect(putPreferences).toHaveBeenLastCalledWith({
      autoZoom: false,
      autocomplete: true,
      mapProjection: "equirectangular",
    });

    writeAutocompletePref(false);

    expect(readAutocompletePref()).toBe(false);
    expect(currentPreferences()).toEqual({
      autoZoom: false,
      autocomplete: false,
      mapProjection: "equirectangular",
    });
    expect(putPreferences).toHaveBeenLastCalledWith({
      autoZoom: false,
      autocomplete: false,
      mapProjection: "equirectangular",
    });
  });

  it("never touches localStorage", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(getPreferences).mockResolvedValue({
      preferences: { autoZoom: true, autocomplete: true, mapProjection: "equal-earth" },
    });

    await loadPreferences();
    readAutoZoomPref();
    readAutocompletePref();
    readMapProjectionPref();
    writeAutoZoomPref(false);
    writeAutocompletePref(false);
    writeMapProjectionPref("equirectangular");

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
