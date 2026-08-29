/**
 * Whether the reveal map should auto-zoom from global to the regional framing,
 * remembered across visits (spec #152, #156).
 *
 * A per-learner motion preference, so it is persisted — modeled on
 * `autocompletePref`. Default on: the fly is the feature, and a learner who
 * finds the motion distracting can turn it off and have that stick (they keep
 * the slider either way). Every access is guarded so a browser with storage
 * disabled still renders the quiz, falling back to the default.
 */
const STORAGE_KEY = "geo.auto-zoom-enabled";

export function readAutoZoomPref(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function writeAutoZoomPref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable (private mode, blocked): the choice simply won't
    // persist. Not worth surfacing to the learner.
  }
}
