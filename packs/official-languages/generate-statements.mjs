// Generate statements.jsonl for the official-languages pack.
// Queries Wikidata P37 (official language) for core-geo's countries and emits
// one country→language `official_language` statement per (country, language)
// pair whose language entity THIS pack owns (see entities.jsonl).
//
// Multi-valued by design: a country with several official languages emits N
// separate statements (Switzerland → German/French/Italian/Romansh). A pair
// whose language entity this pack does not own is SKIPPED with a warning rather
// than emitted as a broken row (the validator rejects an object no pack owns).
//
// Usage: node generate-statements.mjs (from this directory; needs network)
//
// Modeled on ../capital-cities/generate-statements.mjs and ../continental-
// countries/generate-statements.mjs. Deterministic: stable sort by id, so the
// same core-geo + entities.jsonl produce byte-identical output. Statement ids
// include the language slug so a country's several statements never collide.

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 official-languages (colin.hauch@gmail.com)";

/** Read a *.jsonl entities file into a { qid → entity } map. */
function readEntities(url) {
  const entities = {};
  for (const line of readFileSync(url, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entity = JSON.parse(line);
    entities[entity.id] = entity;
  }
  return entities;
}

/** en-label → slug: lowercased, spaces→'-', strip non [a-z0-9-]. */
function slug(label) {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Fetch official-language pairs (P37) for a batch, as [countryQid, langQid][]. */
async function fetchOfficialLanguages(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const query = `
    SELECT ?country ?lang WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P37 ?lang .
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
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${res.statusText}`);

  const json = await res.json();
  const pairs = [];
  for (const b of json.results.bindings) {
    const country = b.country.value.match(/\/(Q\d+)$/);
    const lang = b.lang.value.match(/\/(Q\d+)$/);
    if (country && lang) pairs.push([country[1], lang[1]]);
  }
  return pairs;
}

async function main() {
  const core = readEntities(new URL("../core-geo/entities.jsonl", import.meta.url));
  // Languages this pack owns — fetch-entities.mjs must have run first.
  const owned = readEntities(new URL("entities.jsonl", import.meta.url));

  const countries = Object.values(core)
    .filter((e) => e.types?.includes("country"))
    .map((e) => e.id);

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error(`Own ${Object.keys(owned).length} language entities`);
  console.error("Fetching official languages (P37) from Wikidata...");

  const pairs = [];
  const batchSize = 50;
  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    try {
      const batchPairs = await fetchOfficialLanguages(batch);
      pairs.push(...batchPairs);
      console.error(`Fetched ${pairs.length} pairs (through ${Math.min(i + batchSize, countries.length)}/${countries.length} countries)`);
    } catch (err) {
      console.error(`Error fetching batch: ${err.message}`);
    }
  }

  const statements = [];
  const seen = new Set();
  for (const [countryId, langId] of pairs) {
    const country = core[countryId];
    if (!country) continue; // a P37 value for a non-core-geo country; ignore
    const langName = country?.labels?.en ?? "unknown";
    if (!owned[langId]) {
      console.error(`Warning: ${countryId} (${langName}) language ${langId} is not an owned entity — skipped`);
      continue;
    }
    const id = `lang:${slug(country.labels.en)}:${slug(owned[langId].labels.en)}`;
    if (seen.has(id)) continue; // guard against duplicate P37 rows
    seen.add(id);
    statements.push({
      id,
      subject: countryId,
      relation: "official_language",
      object: { kind: "entity", id: langId },
    });
  }

  statements.sort((a, b) => a.id.localeCompare(b.id));

  const lines = statements.map((s) => JSON.stringify(s));
  writeFileSync(new URL("statements.jsonl", import.meta.url), lines.join("\n") + "\n");
  console.error(`Wrote ${lines.length} statements`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
