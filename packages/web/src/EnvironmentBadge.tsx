import { useEffect, useState } from "react";
import type { ConfigEnvironment } from "@geo/contract";
import { getConfig } from "./apiClient.js";
import { badgeFor } from "./badgeFor.js";

/**
 * A persistent pill naming the environment on every non-prod screen, so a tab
 * can never be mistaken for prod. Fixed to the top-left of the viewport (not in
 * the header, which only renders in the signed-in branch) so it also shows in
 * the signed-out gate and the auth callback.
 *
 * State starts `unknown` — the fail-safe badge shows until the config resolves,
 * and *stays* `unknown` on a rejected fetch (requirement 6). Only an explicit
 * `prod` suppresses it (`badgeFor` returns null → nothing renders).
 */
export function EnvironmentBadge() {
  const [environment, setEnvironment] = useState<ConfigEnvironment>("unknown");

  useEffect(() => {
    let live = true;
    getConfig()
      .then((config) => {
        if (live) setEnvironment(config.environment);
      })
      // Fail-safe: a failed config request leaves the badge on `unknown`.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const badge = badgeFor(environment);
  if (!badge) return null;

  return (
    <div
      role="status"
      className={`env-badge env-badge--${badge.variant}`}
      aria-label={`Environment: ${badge.label}`}
    >
      {badge.label}
    </div>
  );
}
