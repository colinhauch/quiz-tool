// Re-runnable fetch script for the `core-geo` published entity tranche.
//
// Reads the committed, curated Q-ID list (`curated-qids.tsv`) and emits
// `entities.jsonl` — the pack itself. The list is the frozen, author-supplied
// input; this script only resolves each Q-ID's English label + aliases from
// Wikidata, so a "publish" is deterministic: same list in, same file out
// (stable ordering, sorted+deduped aliases). Types come from the curated list,
// not from Wikidata's P31, so the author controls exactly what each entity is.
//
// Not part of the build or test suite — scaffolding, kept re-runnable rather
// than thrown away because re-publishing core-geo is a deliberate act (see
// specs/tooling/mvp-bootstrap.md and specs/packs/README.md). Regenerating
// against fresher Wikidata is not routine: it can move labels, which is why
// the file is committed and reviewed.
//
// Usage:  node fetch-entities.mjs   (from this directory; needs network)

import { readFileSync, writeFileSync } from "node:fs";
import { applyAliasOverrides, readAliasOverrides } from "./alias-overrides.mjs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 core-geo publish (colin.hauch@gmail.com)";
const BATCH = 100;

/** Parse the curated list into ordered {id, type} rows (skips the header). */
function readCurated() {
  const text = readFileSync(new URL("curated-qids.tsv", import.meta.url), "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== "qid\ttype")
    .map((l) => {
      const [id, type] = l.split("\t");
      return { id, type };
    });
}

// Prefer the English label; fall back to Wikidata's language-agnostic `mul`
// label (used for names spelled identically across languages, e.g. "Abuja"),
// which some entities carry instead of an explicit `en` label.
const LABEL_LANGS = ["en", "mul"];

/** One WDQS query for a batch of Q-IDs: label (en/mul) + English aliases. */
async function fetchBatch(ids) {
  const values = ids.map((id) => `wd:${id}`).join(" ");
  const query = `
    SELECT ?item ?label ?alias WHERE {
      VALUES ?item { ${values} }
      ?item rdfs:label ?label . FILTER(lang(?label) IN ("en", "mul"))
      OPTIONAL { ?item skos:altLabel ?alias . FILTER(lang(?alias) = "en") }
    }`;
  const res = await fetch(WDQS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`WDQS ${res.status} for batch starting ${ids[0]}`);
  const json = await res.json();
  return json.results.bindings;
}

function qidFromUri(uri) {
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

async function main() {
  const curated = readCurated();
  const labels = new Map(); // qid -> { en?, mul? }
  const aliases = new Map(); // qid -> Set<string>

  for (let i = 0; i < curated.length; i += BATCH) {
    const batch = curated.slice(i, i + BATCH).map((r) => r.id);
    const bindings = await fetchBatch(batch);
    for (const b of bindings) {
      const id = qidFromUri(b.item.value);
      if (!id) continue;
      if (b.label) {
        if (!labels.has(id)) labels.set(id, {});
        labels.get(id)[b.label["xml:lang"]] = b.label.value;
      }
      if (b.alias) {
        if (!aliases.has(id)) aliases.set(id, new Set());
        aliases.get(id).add(b.alias.value);
      }
    }
    process.stderr.write(`fetched ${Math.min(i + BATCH, curated.length)}/${curated.length}\n`);
  }

  // Emit in curated order (already type-grouped, numeric-sorted) so re-running
  // yields byte-identical output. Aliases sorted + deduped for the same reason.
  // Curated alias overrides (ticket #183) are unioned in last, so a full
  // re-publish keeps them exactly as apply-alias-overrides.mjs would (both call
  // applyAliasOverrides).
  const overrides = readAliasOverrides();
  const lines = curated.map(({ id, type }) => {
    const byLang = labels.get(id) ?? {};
    const label = LABEL_LANGS.map((lang) => byLang[lang]).find(Boolean);
    if (!label) throw new Error(`no en/mul label for ${id} — check the curated list`);
    const entity = { id, labels: { en: label }, types: [type] };
    const alias = aliases.get(id);
    if (alias && alias.size > 0) {
      entity.aliases = { en: [...alias].sort() };
    }
    return JSON.stringify(applyAliasOverrides(entity, overrides));
  });

  writeFileSync(new URL("entities.jsonl", import.meta.url), lines.join("\n") + "\n");
  process.stderr.write(`wrote ${lines.length} entities\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
