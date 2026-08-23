/**
 * Whether the learner wants answer autocomplete, remembered across visits.
 *
 * A genuine per-learner preference, so it is persisted (unlike the entity
 * cache, which is session-only). Default on: the feature exists to help, and a
 * learner who wants pure free-recall can turn it off and have that stick.
 * Every access is guarded — a browser with storage disabled or blocked must
 * still render the quiz, falling back to the default.
 */
const STORAGE_KEY = "geo.autocomplete-enabled";

export function readAutocompletePref(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function writeAutocompletePref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable (private mode, blocked): the choice simply won't
    // persist. Not worth surfacing to the learner.
  }
}
