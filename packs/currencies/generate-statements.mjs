// Generate statements.jsonl for the currencies pack.
// Fetches each core-geo country's currencies (Wikidata P38) and emits one
// country→currency `official_currency` statement per (country, currency) pair
// whose currency entity THIS pack owns (see ./entities.jsonl). A pair pointing
// at a currency the pack does not own is skipped with a warning, never emitted
// broken — same discipline as ../continental-countries/generate-statements.mjs.
//
// Usage: node generate-statements.mjs (from this directory; needs network;
// run fetch-entities.mjs first so entities.jsonl exists).
//
// Deterministic by construction: same core-geo entities + owned currencies in,
// byte-identical statements.jsonl out (stable sort by id). Object-hidden only.

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 currencies (colin.hauch@gmail.com)";
const BATCH = 50;

function readJsonl(url) {
  const text = readFileSync(url, "utf8");
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

function slug(label) {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function qidFromUri(uri) {
  const m = uri.match(/\/(Q\d+)$/);
  return m ? m[1] : null;
}

/** Fetch country→currency pairs (P38) for a batch of countries. */
async function fetchCurrencies(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const query = `
    SELECT ?country ?currency WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P38 ?currency .
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
    const country = qidFromUri(b.country.value);
    const currency = qidFromUri(b.currency.value);
    if (country && currency) pairs.push([country, currency]);
  }
  return pairs;
}

async function main() {
  const coreGeo = {};
  for (const e of readJsonl(new URL("../core-geo/entities.jsonl", import.meta.url))) {
    coreGeo[e.id] = e;
  }
  const countries = Object.values(coreGeo)
    .filter((e) => e.types?.includes("country"))
    .map((e) => e.id);

  // The currency entities this pack owns, with their labels (for slugs).
  const owned = new Map();
  for (const e of readJsonl(new URL("entities.jsonl", import.meta.url))) {
    owned.set(e.id, e);
  }

  console.error(`Found ${countries.length} countries in core-geo; ${owned.size} owned currencies`);
  console.error("Fetching currencies (P38) from Wikidata...");

  const pairs = [];
  for (let i = 0; i < countries.length; i += BATCH) {
    const batch = countries.slice(i, i + BATCH);
    try {
      pairs.push(...(await fetchCurrencies(batch)));
      console.error(`Scanned ${Math.min(i + BATCH, countries.length)}/${countries.length} countries`);
    } catch (err) {
      console.error(`Error fetching batch: ${err.message}`);
    }
  }

  const statements = [];
  const seen = new Set();
  for (const [countryId, currencyId] of pairs) {
    const country = coreGeo[countryId];
    if (!country) continue; // not a core-geo country (defensive)
    const currency = owned.get(currencyId);
    const countryName = country.labels?.en ?? "unknown";
    if (!currency) {
      console.error(
        `Warning: ${countryId} (${countryName}) currency ${currencyId} is not owned by this pack — skipped`,
      );
      continue;
    }
    const id = `cur:${slug(countryName)}:${slug(currency.labels.en)}`;
    if (seen.has(id)) continue; // a country listing the same currency twice
    seen.add(id);
    statements.push({
      id,
      subject: countryId,
      relation: "official_currency",
      object: { kind: "entity", id: currencyId },
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
