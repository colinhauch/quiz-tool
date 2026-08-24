// Re-runnable fetch script for the `official-languages` pack's OWNED entities.
//
// This pack owns one entity per distinct official language of a core-geo
// country. Step 1: query Wikidata P37 (official language) over core-geo's
// countries to discover the distinct set of language Q-IDs. Step 2: resolve
// each language's English label + English aliases (same shape core-geo uses).
// Writes `entities.jsonl`, sorted by id, so a re-run is byte-stable: same
// core-geo countries in, same file out.
//
// Usage: node fetch-entities.mjs (from this directory; needs network)
//
// Modeled on ../core-geo/fetch-entities.mjs and ../capital-cities/
// generate-statements.mjs. Regenerating is a deliberate, reviewed act: a fresh
// pull can move labels or add a language, which changes owned Q-IDs.

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 official-languages (colin.hauch@gmail.com)";

// Prefer the English label; fall back to Wikidata's language-agnostic `mul`
// label for names spelled identically across languages.
const LABEL_LANGS = ["en", "mul"];

/** Read core-geo's entities.jsonl into a { qid → entity } map. */
function readCoreGeoEntities() {
  const text = readFileSync(new URL("../core-geo/entities.jsonl", import.meta.url), "utf8");
  const entities = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entity = JSON.parse(line);
    entities[entity.id] = entity;
  }
  return entities;
}

function qidFromUri(uri) {
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

async function post(query) {
  const res = await fetch(WDQS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${res.statusText}`);
  return (await res.json()).results.bindings;
}

/** Distinct official-language Q-IDs (P37) for a batch of countries. */
async function fetchLanguageIds(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const bindings = await post(`
    SELECT ?lang WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P37 ?lang .
    }`);
  const ids = new Set();
  for (const b of bindings) {
    const id = qidFromUri(b.lang.value);
    if (id) ids.add(id);
  }
  return ids;
}

/** English label (en/mul) + English aliases for a batch of language Q-IDs. */
async function fetchLabels(ids) {
  const values = ids.map((id) => `wd:${id}`).join(" ");
  return post(`
    SELECT ?item ?label ?alias WHERE {
      VALUES ?item { ${values} }
      ?item rdfs:label ?label . FILTER(lang(?label) IN ("en", "mul"))
      OPTIONAL { ?item skos:altLabel ?alias . FILTER(lang(?alias) = "en") }
    }`);
}

async function main() {
  const entities = readCoreGeoEntities();
  const countries = Object.values(entities)
    .filter((e) => e.types?.includes("country"))
    .map((e) => e.id);

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error("Discovering official languages (P37) from Wikidata...");

  const langIds = new Set();
  const batch = 50;
  for (let i = 0; i < countries.length; i += batch) {
    const slice = countries.slice(i, i + batch);
    for (const id of await fetchLanguageIds(slice)) langIds.add(id);
    console.error(`  scanned ${Math.min(i + batch, countries.length)}/${countries.length} countries, ${langIds.size} languages so far`);
  }

  const ids = [...langIds].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  console.error(`Resolving labels for ${ids.length} languages...`);

  const labels = new Map(); // qid -> { en?, mul? }
  const aliases = new Map(); // qid -> Set<string>
  const labelBatch = 100;
  for (let i = 0; i < ids.length; i += labelBatch) {
    const bindings = await fetchLabels(ids.slice(i, i + labelBatch));
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
    console.error(`  resolved ${Math.min(i + labelBatch, ids.length)}/${ids.length}`);
  }

  // Emit sorted by numeric Q-ID; aliases sorted + deduped — byte-stable output.
  const lines = ids.map((id) => {
    const byLang = labels.get(id) ?? {};
    const label = LABEL_LANGS.map((lang) => byLang[lang]).find(Boolean);
    if (!label) throw new Error(`no en/mul label for ${id}`);
    const entity = { id, labels: { en: label }, types: ["language"] };
    const alias = aliases.get(id);
    if (alias && alias.size > 0) entity.aliases = { en: [...alias].sort() };
    return JSON.stringify(entity);
  });

  writeFileSync(new URL("entities.jsonl", import.meta.url), lines.join("\n") + "\n");
  console.error(`Wrote ${lines.length} language entities`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
