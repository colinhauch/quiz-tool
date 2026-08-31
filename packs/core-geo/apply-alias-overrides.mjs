// Apply alias-overrides.json to the committed entities.jsonl in place, WITHOUT
// re-fetching from Wikidata (ticket #183). This is the routine path for editing
// country aliases: a full fetch-entities.mjs run re-resolves every label from
// live Wikidata and can move them (a deliberate, reviewed act — see
// fetch-entities.mjs), whereas adding an accepted-answer variant should not risk
// that drift. Preserves every existing field; only `aliases.en` grows.
//
// Idempotent: re-running produces byte-identical output (applyAliasOverrides
// sorts + dedups). Line order is preserved.
//
// Usage:  node apply-alias-overrides.mjs   (from this directory; no network)

import { readFileSync, writeFileSync } from "node:fs";
import { applyAliasOverrides, readAliasOverrides } from "./alias-overrides.mjs";

const url = new URL("entities.jsonl", import.meta.url);
const overrides = readAliasOverrides();

// Only entities named in the overrides are re-serialized; every other line is
// passed through verbatim, so an untouched entity's bytes (float formatting in
// its geometry included) never change.
let touched = 0;
const lines = readFileSync(url, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    const entity = JSON.parse(l);
    if (!overrides[entity.id]) return l;
    const after = JSON.stringify(applyAliasOverrides(entity, overrides));
    if (after !== l) touched++;
    return after;
  });

writeFileSync(url, lines.join("\n") + "\n");
process.stderr.write(`applied alias overrides to ${touched} entities\n`);
