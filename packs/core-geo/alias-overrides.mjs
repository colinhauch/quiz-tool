// Shared alias-override logic (ticket #183), used by both fetch-entities.mjs (a
// full re-publish) and apply-alias-overrides.mjs (label-preserving in-place
// apply), so the curated aliases land the same way regardless of entry point.
// See alias-overrides.json for the data and its rationale.

import { readFileSync } from "node:fs";

/** Read alias-overrides.json into { qid → [alias, ...] } (drops the _readme). */
export function readAliasOverrides() {
  const raw = JSON.parse(readFileSync(new URL("alias-overrides.json", import.meta.url), "utf8"));
  return Object.fromEntries(Object.entries(raw.aliases).map(([qid, v]) => [qid, v.add]));
}

/**
 * Return `entity` with the curated aliases for its Q-id unioned into
 * `aliases.en` — additive, sorted, deduped, and never repeating the label.
 * Idempotent: an alias already present (or equal to the label) is dropped, so
 * re-applying changes nothing. Entities with no override are returned unchanged.
 */
export function applyAliasOverrides(entity, overrides) {
  const add = overrides[entity.id];
  if (!add || add.length === 0) return entity;
  const existing = entity.aliases?.en ?? [];
  const merged = [...new Set([...existing, ...add])].filter((a) => a !== entity.labels.en).sort();
  return { ...entity, aliases: { ...entity.aliases, en: merged } };
}
