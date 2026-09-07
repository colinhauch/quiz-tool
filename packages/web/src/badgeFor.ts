import type { ConfigEnvironment } from "@geo/contract";

/**
 * The pure show/hide + color decision for the environment badge, kept out of the
 * DOM so it's unit-testable on its own. Returns `null` for `prod` alone — every
 * other environment (dev/test/local, and the fail-safe `unknown`) is non-prod
 * and gets a badge. `label` is the uppercased environment name, always shown as
 * text so the environment is never conveyed by color alone (requirement 3/7);
 * `variant` selects the per-environment color via a `.env-badge--<variant>`
 * class in index.css.
 */
export function badgeFor(env: ConfigEnvironment): { label: string; variant: string } | null {
  if (env === "prod") return null;
  return { label: env.toUpperCase(), variant: env };
}
