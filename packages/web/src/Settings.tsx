import { useEffect, useState } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";
import { Feedback } from "./Feedback.js";
import {
  readAutocompletePref,
  readAutoZoomPref,
  readMapProjectionPref,
  writeAutocompletePref,
  writeAutoZoomPref,
  writeMapProjectionPref,
} from "./preferences.js";
import { PROJECTIONS, type ProjectionId, projectionFor } from "./projection.js";

/**
 * A single account-synced preference: its label, current on-screen value, and
 * the writer that persists a change. The Preferences section renders a list of
 * these, discriminated by `kind` so a preference that isn't a yes/no gets the
 * control it needs (#235). Two kinds today — a checkbox and a select — and a
 * third is one more variant plus one more `case` in the row renderer, not
 * another rewrite of the section.
 */
type PreferenceRow =
  | {
      kind: "toggle";
      key: string;
      label: string;
      checked: boolean;
      onChange: (enabled: boolean) => void;
    }
  | {
      kind: "choice";
      key: string;
      label: string;
      value: string;
      options: { value: string; label: string }[];
      onChange: (value: string) => void;
    };

/**
 * The dedicated home for account-synced preferences and account info (spec
 * #226, reshaped by #231). Reached from the main-nav "Settings" tab. Top to
 * bottom: the account email with Sign out on its row, the preferences (wired to
 * the exact same account-synced store the quiz reads, so a change here follows
 * the learner across devices), and the feedback card.
 *
 * Talks only to the {@link AuthBoundary} for email and sign-out — never to
 * `supabase-js` — so a fake boundary drives it in tests exactly as the app
 * singleton drives it in production (default prop, same seam as `AuthWidget`).
 *
 * The preferences seed from the synchronous read helpers via `useState` just as
 * `Quiz` does; App has already blocked entry on the preferences read (falling
 * back to defaults on failure), so the store is populated and complete by the
 * time this mounts — the page renders and stays interactive on defaults even if
 * that read failed.
 */
export function Settings({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [auth, setAuth] = useState(() => boundary.getState());
  const [autocomplete, setAutocomplete] = useState(readAutocompletePref);
  const [autoZoom, setAutoZoom] = useState(readAutoZoomPref);
  // `projectionFor` resolves the stored id, so an unknown or legacy one shows as
  // the default rather than leaving the select with no matching option.
  const [projection, setProjection] = useState<ProjectionId>(
    () => projectionFor(readMapProjectionPref()).id,
  );

  useEffect(() => boundary.subscribe(setAuth), [boundary]);

  const rows: PreferenceRow[] = [
    {
      kind: "toggle",
      key: "autocomplete",
      label: "Autocomplete",
      checked: autocomplete,
      onChange: (enabled) => {
        setAutocomplete(enabled);
        writeAutocompletePref(enabled);
      },
    },
    {
      kind: "toggle",
      key: "auto-zoom",
      label: "Auto-zoom",
      checked: autoZoom,
      onChange: (enabled) => {
        setAutoZoom(enabled);
        writeAutoZoomPref(enabled);
      },
    },
    {
      kind: "choice",
      key: "map-projection",
      label: "Map projection",
      value: projection,
      options: PROJECTIONS.map((p) => ({ value: p.id, label: p.label })),
      onChange: (id) => {
        // The registry is the only source of ids here, so the resolve is a
        // formality that also narrows the string back to a ProjectionId.
        const resolved = projectionFor(id).id;
        setProjection(resolved);
        writeMapProjectionPref(resolved);
      },
    },
  ];

  return (
    <div className="settings">
      <section className="settings__section" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings__heading">
          Account
        </h2>
        {/*
          Sign out sits on the email's row (#234) — the account it signs out of
          is right there. The header AuthWidget keeps its own Sign out too; two
          paths to the same boundary.signOut() is the intended state, not an
          oversight (consolidating the header is deliberately out of scope).
        */}
        <div className="settings__account-row">
          <p className="settings__account-email">{auth.email ?? "—"}</p>
          <button
            type="button"
            className="settings__signout"
            onClick={() => void boundary.signOut()}
          >
            Sign out
          </button>
        </div>
      </section>

      <section className="settings__section" aria-labelledby="settings-preferences">
        <h2 id="settings-preferences" className="settings__heading">
          Preferences
        </h2>
        <ul className="settings__prefs">
          {rows.map((row) => (
            <li key={row.key} className="settings__pref-row">
              {row.kind === "toggle" ? (
                <label className="settings__pref settings__pref--toggle">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => row.onChange(e.target.checked)}
                  />
                  {row.label}
                </label>
              ) : (
                <label className="settings__pref settings__pref--choice">
                  {row.label}
                  <select
                    className="settings__pref-select"
                    value={row.value}
                    onChange={(e) => row.onChange(e.target.value)}
                  >
                    {row.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/*
        Feedback is a section here rather than its own nav tab (#236): one card
        does not earn a top-level destination. Mounted unchanged — the card owns
        its own signed-in check and submission.
      */}
      {/* Named here rather than by `aria-labelledby`: the heading is Feedback's
          own and the card is mounted unchanged, so the section borrows its name
          to stand as a labelled region beside Account and Preferences. */}
      <section className="settings__section settings__section--feedback" aria-label="Feedback">
        <Feedback />
      </section>
    </div>
  );
}
