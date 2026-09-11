import { useEffect, useState } from "react";
import { type AuthBoundary, getAuthBoundary } from "./auth.js";
import {
  readAutocompletePref,
  readAutoZoomPref,
  writeAutocompletePref,
  writeAutoZoomPref,
} from "./preferences.js";

/**
 * A single account-synced preference: its label, current on-screen value, and
 * the writer that persists a flip. The Preferences section renders a list of
 * these, so a future toggle (map projection, #221) is one more entry — no
 * structural change.
 */
type ToggleRow = {
  key: string;
  label: string;
  checked: boolean;
  onChange: (enabled: boolean) => void;
};

/**
 * The dedicated home for account-synced preferences and account info (spec
 * #226). Reached from the main-nav "Settings" tab. Top to bottom: the read-only
 * account email, the display toggles (wired to the exact same account-synced
 * store the in-quiz popup uses, so a change here follows the learner across
 * devices), and a Sign out control.
 *
 * Talks only to the {@link AuthBoundary} for email and sign-out — never to
 * `supabase-js` — so a fake boundary drives it in tests exactly as the app
 * singleton drives it in production (default prop, same seam as `AuthWidget`).
 *
 * The toggles seed from the synchronous read helpers via `useState` just as
 * `Quiz` does; App has already blocked entry on the preferences read (falling
 * back to defaults on failure), so the store is populated and complete by the
 * time this mounts — the page renders and stays interactive on defaults even if
 * that read failed.
 */
export function Settings({ boundary = getAuthBoundary() }: { boundary?: AuthBoundary }) {
  const [auth, setAuth] = useState(() => boundary.getState());
  const [autocomplete, setAutocomplete] = useState(readAutocompletePref);
  const [autoZoom, setAutoZoom] = useState(readAutoZoomPref);

  useEffect(() => boundary.subscribe(setAuth), [boundary]);

  const rows: ToggleRow[] = [
    {
      key: "autocomplete",
      label: "Autocomplete",
      checked: autocomplete,
      onChange: (enabled) => {
        setAutocomplete(enabled);
        writeAutocompletePref(enabled);
      },
    },
    {
      key: "auto-zoom",
      label: "Auto-zoom",
      checked: autoZoom,
      onChange: (enabled) => {
        setAutoZoom(enabled);
        writeAutoZoomPref(enabled);
      },
    },
  ];

  return (
    <div className="settings">
      <section className="settings__section" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings__heading">
          Account
        </h2>
        <p className="settings__account-email">{auth.email ?? "—"}</p>
      </section>

      <section className="settings__section" aria-labelledby="settings-preferences">
        <h2 id="settings-preferences" className="settings__heading">
          Preferences
        </h2>
        <ul className="settings__toggles">
          {rows.map((row) => (
            <li key={row.key} className="settings__toggle-row">
              <label className="settings__toggle">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) => row.onChange(e.target.checked)}
                />
                {row.label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="settings__section settings__section--signout">
        {/*
          Sign out lives here per the spec. The header AuthWidget keeps its own
          Sign out too — two paths to the same boundary.signOut() — deliberately
          left rather than consolidated: the header control is app-wide and this
          ticket only adds the Settings home. Consolidating the header is out of
          scope (tracked separately with the in-quiz gear removal, #228).
        */}
        <button
          type="button"
          className="settings__signout"
          onClick={() => void boundary.signOut()}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
