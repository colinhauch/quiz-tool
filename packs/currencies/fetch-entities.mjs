// Fetch entities.jsonl for the currencies pack — the currency entities this
// pack OWNS, one per distinct currency used by a core-geo country.
//
// Two Wikidata passes, both deterministic (same core-geo entities in →
// byte-identical file out, sorted by numeric Q-id):
//   1. P38 (currency) over core-geo's countries → the distinct set of currency
//      Q-ids the pack must own.
//   2. Resolve each currency's English label + English altLabels, plus its
//      ISO 4217 code (P498) added as an alias so "EUR" grades "Euro" correct.
//
// Usage: node fetch-entities.mjs (from this directory; needs network)
//
// Modeled on ../core-geo/fetch-entities.mjs and ../capital-cities/
// generate-statements.mjs. Regenerating is a deliberate, reviewed act — a moved
// label or a currency change alters this file; see ../core-geo/fetch-entities.mjs.

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 currencies (colin.hauch@gmail.com)";
const BATCH = 50;

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

async function wdqs(query) {
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

/** The distinct set of currency Q-ids used (P38) by a batch of countries. */
async function fetchCurrencyIds(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const bindings = await wdqs(`
    SELECT ?currency WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P38 ?currency .
    }`);
  const ids = new Set();
  for (const b of bindings) {
    const id = qidFromUri(b.currency.value);
    if (id) ids.add(id);
  }
  return ids;
}

/** Label (en/mul), English altLabels, and ISO 4217 code (P498) for a batch of currencies. */
async function fetchCurrencyDetails(currencyIds) {
  const values = currencyIds.map((id) => `wd:${id}`).join(" ");
  return wdqs(`
    SELECT ?item ?label ?alias ?iso WHERE {
      VALUES ?item { ${values} }
      ?item rdfs:label ?label . FILTER(lang(?label) IN ("en", "mul"))
      OPTIONAL { ?item skos:altLabel ?alias . FILTER(lang(?alias) = "en") }
      OPTIONAL { ?item wdt:P498 ?iso . }
    }`);
}

const LABEL_LANGS = ["en", "mul"];

async function main() {
  const entities = readCoreGeoEntities();
  const countries = Object.values(entities)
    .filter((e) => e.types?.includes("country"))
    .map((e) => e.id);

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error("Fetching currency ids (P38) from Wikidata...");

  const currencyIds = new Set();
  for (let i = 0; i < countries.length; i += BATCH) {
    const batch = countries.slice(i, i + BATCH);
    for (const id of await fetchCurrencyIds(batch)) currencyIds.add(id);
    console.error(`Scanned ${Math.min(i + BATCH, countries.length)}/${countries.length} countries; ${currencyIds.size} distinct currencies`);
  }

  const ids = [...currencyIds];
  const labels = new Map(); // qid -> { en?, mul? }
  const aliases = new Map(); // qid -> Set<string>

  console.error(`Resolving labels/aliases/ISO for ${ids.length} currencies...`);
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    for (const b of await fetchCurrencyDetails(batch)) {
      const id = qidFromUri(b.item.value);
      if (!id) continue;
      if (b.label) {
        if (!labels.has(id)) labels.set(id, {});
        labels.get(id)[b.label["xml:lang"]] = b.label.value;
      }
      if (!aliases.has(id)) aliases.set(id, new Set());
      if (b.alias) aliases.get(id).add(b.alias.value);
      if (b.iso) aliases.get(id).add(b.iso.value); // ISO 4217 code, e.g. "EUR"
    }
    console.error(`Resolved ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }

  // Sort by numeric Q-id for a stable, clean order; aliases sorted + deduped,
  // and never repeating the label. Same discipline as core-geo.
  ids.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const lines = ids.map((id) => {
    const byLang = labels.get(id) ?? {};
    const label = LABEL_LANGS.map((lang) => byLang[lang]).find(Boolean);
    if (!label) throw new Error(`no en/mul label for currency ${id}`);
    const entity = { id, labels: { en: label }, types: ["currency"] };
    const alias = [...(aliases.get(id) ?? [])].filter((a) => a !== label).sort();
    if (alias.length > 0) entity.aliases = { en: alias };
    return JSON.stringify(entity);
  });

  writeFileSync(new URL("entities.jsonl", import.meta.url), lines.join("\n") + "\n");
  console.error(`Wrote ${lines.length} currency entities`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
