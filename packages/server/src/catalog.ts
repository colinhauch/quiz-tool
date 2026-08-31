import { existsSync, readFileSync } from "node:fs";
import { defaultPacksDir } from "./pack-loader.js";

/**
 * Which packs are offered to a learner, and on what terms. This is **product
 * policy over the assembled graph, not pack content**: the loader still loads
 * every discovered pack, always (ADR-0001). The catalog only governs what the
 * server *offers*, and it does so at the serving boundary (`/packs`), which is
 * where per-user gating will one day sit — a pack cannot know whether *this*
 * learner may see it. That is deliberately not in `pack.json`, which carries a
 * pack's intrinsic authoring facts (identity, license, credits), on a different
 * lifecycle from "is it shown" and "is it paid". See
 * `docs/adr/0002-pack-visibility-lives-in-a-catalog.md`.
 *
 * The file is a **sparse override map**: `packId → policy`. A pack absent from
 * it — and an absent file entirely — is visible and free. Naming only the
 * exceptions keeps this from re-enumerating the catalogue (which ADR-0001
 * forbids and which would drift the moment a pack is renamed).
 */
export interface PackPolicy {
  /** Loaded into the graph, but withheld from the picker. Default false. */
  hidden?: boolean;
  /**
   * Reserved. Which entitlement a learner needs to draw this pack. Carried so
   * authors can annotate ahead of enforcement; **nothing gates on it yet** —
   * there is no user model. Default `"free"`.
   */
  tier?: "free" | "premium";
}

export type Catalog = Map<string, PackPolicy>;

const CATALOG = "catalog.json";
const TIERS = new Set(["free", "premium"]);

/** Fail loudly with the pack in hand: a typo'd policy silently offering a paid pack for free is the failure to avoid. */
function parsePolicy(packId: string, raw: unknown): PackPolicy {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`catalog: policy for ${packId} must be an object`);
  }
  const policy: PackPolicy = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "hidden") {
      if (typeof value !== "boolean") throw new Error(`catalog: ${packId}.hidden must be a boolean`);
      policy.hidden = value;
    } else if (key === "tier") {
      if (typeof value !== "string" || !TIERS.has(value)) {
        throw new Error(`catalog: ${packId}.tier must be one of ${[...TIERS].join(", ")}`);
      }
      policy.tier = value as PackPolicy["tier"];
    } else {
      throw new Error(`catalog: unknown field ${key} in policy for ${packId}`);
    }
  }
  return policy;
}

/**
 * Reads `packs/catalog.json` into the override map, or an empty catalog when it
 * is absent. Like the pack loader, this is deliberate IO at boot; a malformed
 * catalog throws rather than being skipped, for the same reason a bad pack does
 * — a warning in a scrollback is how policy quietly stops applying.
 */
export function loadCatalog(packsDir: URL = defaultPacksDir()): Catalog {
  const url = new URL(CATALOG, packsDir);
  if (!existsSync(url)) return new Map();
  return parseCatalog(JSON.parse(readFileSync(url, "utf8")) as unknown);
}

/**
 * Validate a raw catalog object (packId → policy) into a `Catalog`. Shared by
 * the fs loader and the Worker: the Worker has no filesystem, so its catalog is
 * bundled into `packs.generated.ts` and passed through here — the same
 * validation either way, so a policy that is offered locally is offered in
 * production. An empty/absent object is an empty catalog (everything visible).
 */
export function parseCatalog(parsed: unknown): Catalog {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("catalog: top level must be an object of packId → policy");
  }
  return new Map(Object.entries(parsed).map(([packId, raw]) => [packId, parsePolicy(packId, raw)]));
}
