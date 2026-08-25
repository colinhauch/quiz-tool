// Editorial override logic shared by fetch-entities.mjs and generate-
// statements.mjs, so both scripts compute the SAME final (country, language)
// pairs — the languages the pack owns must be exactly the languages its
// statements reference. See overrides.json for the data and the rationale.

import { readFileSync } from "node:fs";

/** Read overrides.json into { add: {country: [lang]}, remove: {country: [lang]} }. */
export function readOverrides() {
  const raw = JSON.parse(readFileSync(new URL("overrides.json", import.meta.url), "utf8"));
  return { add: raw.add ?? {}, remove: raw.remove ?? {} };
}

/**
 * The curated pair set: start from the P37 baseline, drop every `remove` pair,
 * then union in every `add` pair. `countries` restricts the result to core-geo
 * (a P37 value for a country the app doesn't teach is dropped). Deterministic
 * and idempotent; order is irrelevant since callers sort downstream.
 */
export function finalPairs(baseline, countries) {
  const { add, remove } = readOverrides();
  const removed = new Set();
  for (const [c, langs] of Object.entries(remove)) {
    for (const l of langs) removed.add(`${c} ${l}`);
  }

  const kept = new Map(); // "country lang" → [country, lang], de-dupes
  const keep = (c, l) => {
    if (!countries.has(c)) return;
    if (removed.has(`${c} ${l}`)) return;
    kept.set(`${c} ${l}`, [c, l]);
  };

  for (const [c, l] of baseline) keep(c, l);
  for (const [c, langs] of Object.entries(add)) {
    for (const l of langs) keep(c, l);
  }
  return [...kept.values()];
}
