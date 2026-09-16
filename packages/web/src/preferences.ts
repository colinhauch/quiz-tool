import { type Preferences, preferencesSchema } from "@geo/contract";
import { getPreferences, putPreferences } from "./apiClient.js";

/**
 * The signed-in learner's account-synced display preferences (spec #216),
 * held in memory for the session. This replaces the old per-device
 * `localStorage` prefs (`geo.auto-zoom-enabled`, `geo.autocomplete-enabled`):
 * preferences now follow the learner across devices, loaded once at post-login
 * bootstrap ({@link loadPreferences}) and written straight back through the
 * server on every toggle.
 *
 * The read helpers are synchronous so the quiz can seed its toggles from
 * `useState(readAutoZoomPref)` exactly as before — bootstrap has already
 * populated the store by the time any signed-in view mounts (App blocks entry on
 * the read). Old `localStorage` values are deliberately not imported; everyone
 * starts from server defaults, and since both default to `true` no one regresses.
 */

/** Server-side defaults, mirrored here so a failed bootstrap read still yields a complete blob. */
const DEFAULTS: Preferences = preferencesSchema.parse({});

let current: Preferences = { ...DEFAULTS };

/**
 * Loads the learner's preferences once, at post-login bootstrap. A failed read
 * falls back to defaults rather than blocking entry (story 14): the caller can
 * always proceed. Never call this for a signed-out visitor.
 */
export async function loadPreferences(): Promise<void> {
  try {
    const { preferences } = await getPreferences();
    current = preferencesSchema.parse(preferences);
  } catch {
    current = { ...DEFAULTS };
  }
}

/** The current in-memory preferences. Complete and defaulted at all times. */
export function currentPreferences(): Preferences {
  return current;
}

/**
 * Resets the in-memory store to defaults. Exists for tests, which — like the old
 * `localStorage`-backed prefs did via `localStorage.clear()` — must isolate one
 * case's toggles from the next. Never needed in production: the store is
 * (re)seeded by {@link loadPreferences} at each sign-in.
 */
export function resetPreferences(): void {
  current = { ...DEFAULTS };
}

function persist(next: Preferences): void {
  current = next;
  // Fire-and-forget: the toggle already reflects the choice in the UI. A failed
  // PUT leaves the in-memory value ahead of the server until the next write (and
  // the apiClient funnels a 401 to the auth boundary); swallow the rejection here
  // so it never surfaces as an unhandled rejection.
  void putPreferences(next).catch(() => {});
}

export function readAutoZoomPref(): boolean {
  return current.autoZoom;
}

export function writeAutoZoomPref(enabled: boolean): void {
  persist({ ...current, autoZoom: enabled });
}

export function readAutocompletePref(): boolean {
  return current.autocomplete;
}

export function writeAutocompletePref(enabled: boolean): void {
  persist({ ...current, autocomplete: enabled });
}

/**
 * The stored reveal-map projection id (#221). A bare string: the projection
 * registry resolves it to a working projection (falling back to Equal Earth for
 * an unknown/legacy id), so the store never validates the id itself.
 */
export function readMapProjectionPref(): string {
  return current.mapProjection;
}

export function writeMapProjectionPref(id: string): void {
  persist({ ...current, mapProjection: id });
}
