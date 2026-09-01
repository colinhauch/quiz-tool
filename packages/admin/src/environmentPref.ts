import { environmentSchema, type Environment } from "@geo/contract";

/**
 * The operator's chosen {@link Environment}, persisted across visits and
 * across browser restarts — the SPA-side half of #172. `apiClient.ts` reads
 * this exactly once, at module load, and attaches it to every request inside
 * its single fetch choke point; no component reads or writes this directly.
 *
 * Deliberately mirrors `@geo/web`'s `autocompletePref.ts`/`autoZoomPref.ts`
 * (guarded storage access, never throws) but with a *different* default, and
 * that difference is the point of this whole feature: nothing persisted
 * yields `dev`, not `prod`. That is the opposite of the BFF route default
 * (`admin-app.ts`'s `resolveEnvironment`, which treats an absent `?env=` as
 * `prod` for backwards compatibility with existing callers/tests). The route
 * default protects old behavior; this default protects a new operator's
 * first impression — `dev` is where the live play data actually lives, and
 * defaulting to `prod` here would reproduce the exact empty-table confusion
 * this feature exists to fix. Two different defaults for two different
 * reasons; see spec #171.
 */
const STORAGE_KEY = "geo-admin-env";
const DEFAULT_ENVIRONMENT: Environment = "dev";

export function readEnvironmentPref(): Environment {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = environmentSchema.safeParse(stored);
    return parsed.success ? parsed.data : DEFAULT_ENVIRONMENT;
  } catch {
    return DEFAULT_ENVIRONMENT;
  }
}

export function writeEnvironmentPref(env: Environment): void {
  try {
    localStorage.setItem(STORAGE_KEY, env);
  } catch {
    // Storage unavailable (private mode, blocked): the choice simply won't
    // persist. Not worth surfacing to the operator.
  }
}
