// Re-runnable fetch script for the `spoken-languages` pack's OWNED entities.
//
// This pack owns one entity per distinct language it asserts a country speaks.
// Step 1: query Wikidata P37 (official language) over core-geo's countries for a
// BASELINE, then apply overrides.json (editorial curation) to get the final
// (country, language) pairs — the same computation generate-statements.mjs
// does, so the owned entities match the statements exactly. Step 2: resolve
// each distinct language's English label + English aliases.
//
// Writes `entities.jsonl`, sorted by id, so a re-run is byte-stable: same
// core-geo + P37 + overrides in, same file out.
//
// Usage: node fetch-entities.mjs (from this directory; needs network)
//
// Regenerating is a deliberate, reviewed act: a fresh pull can move labels or
// add a language, which changes owned Q-IDs.

import { readFileSync, writeFileSync } from "node:fs";
import { finalPairs } from "./overrides.mjs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 spoken-languages (colin.hauch@gmail.com)";

// Prefer the English label; fall back to Wikidata's language-agnostic `mul`
// label for names spelled identically across languages.
const LABEL_LANGS = ["en", "mul"];

// Languages whose short autocomplete form the last-word rule gets wrong.
// `null` = no short form (the label is a proper name that must stay whole).
// Keyed by Q-id. Kept small; the last-word default is right for most.
const SHORT_FORM_OVERRIDES = {
  Q34159: null, // Tok Pisin — "Pisin" alone is not the name
  Q33617: null, // Hiri Motu — "Motu" is a different, related thing
};

/**
 * The short common name for a language's autocomplete: the last word of a
 * multi-word label ("Jamaican Patois" → "patois"), with two corrections:
 * anything ending in "Sign Language" collapses to "Sign Language" (the country
 * prefix would otherwise leak, and the last word alone is the useless
 * "language"); and a few proper names are pinned via SHORT_FORM_OVERRIDES.
 * Returns null for a single-word label (already the short answer) or a pinned
 * skip.
 */
function shortForm(id, label) {
  if (id in SHORT_FORM_OVERRIDES) return SHORT_FORM_OVERRIDES[id];
  if (/\bsign language$/i.test(label)) return "Sign Language";
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return null;
  return words[words.length - 1].toLowerCase();
}

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

/** Official-language pairs (P37) for a batch, as [countryQid, langQid][]. */
async function fetchOfficialLanguagePairs(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const bindings = await post(`
    SELECT ?country ?lang WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P37 ?lang .
    }`);
  const pairs = [];
  for (const b of bindings) {
    const country = qidFromUri(b.country.value);
    const lang = qidFromUri(b.lang.value);
    if (country && lang) pairs.push([country, lang]);
  }
  return pairs;
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
  const countrySet = new Set(countries);

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error("Discovering official languages (P37) from Wikidata...");

  const baseline = [];
  const batch = 50;
  for (let i = 0; i < countries.length; i += batch) {
    const slice = countries.slice(i, i + batch);
    baseline.push(...(await fetchOfficialLanguagePairs(slice)));
    console.error(`  scanned ${Math.min(i + batch, countries.length)}/${countries.length} countries, ${baseline.length} pairs so far`);
  }

  // Own exactly the languages the curated statements will reference.
  const pairs = finalPairs(baseline, countrySet);
  const langIds = new Set(pairs.map(([, lang]) => lang));
  const ids = [...langIds].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  console.error(`Resolving labels for ${ids.length} languages (after overrides)...`);

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
    const names = new Set(aliases.get(id) ?? []);

    // The autocomplete short form: the bare language name a learner types, for a
    // label that carries the country/nationality ("Jamaican Patois" → "Patois",
    // "British English" → "English") — showing that leaks less than the full
    // label. Unlike currencies, languages aren't pluralized, so only the
    // singular is added to the accepted aliases (the box fills what it shows).
    const short = shortForm(id, label);
    if (short && short.toLowerCase() !== label.toLowerCase()) {
      entity.autocomplete = short;
      names.add(short);
    }

    if (names.size > 0) entity.aliases = { en: [...names].filter((a) => a !== label).sort() };
    return JSON.stringify(entity);
  });

  writeFileSync(new URL("entities.jsonl", import.meta.url), lines.join("\n") + "\n");
  console.error(`Wrote ${lines.length} language entities`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
