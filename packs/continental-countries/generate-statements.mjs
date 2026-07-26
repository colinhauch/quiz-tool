// Generate statements.jsonl for continental-countries pack.
// Fetches country→continent mappings from Wikidata.
//
// Usage: node generate-statements.mjs (from this directory; needs network)

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 continental-countries (colin.hauch@gmail.com)";

// Read entities.jsonl from core-geo to get the list of countries and continents
function readCoreGeoEntities() {
  const text = readFileSync(
    new URL("../core-geo/entities.jsonl", import.meta.url),
    "utf8"
  );
  const entities = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const entity = JSON.parse(line);
    entities[entity.id] = entity;
  }
  return entities;
}

/** Fetch continent for each country from Wikidata. */
async function fetchContinents(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const query = `
    SELECT ?country ?continent WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P30 ?continent .
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

  if (!res.ok) {
    throw new Error(`WDQS ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const mapping = {};
  for (const binding of json.results.bindings) {
    const countryUri = binding.country.value;
    const continentUri = binding.continent.value;
    const countryMatch = countryUri.match(/\/(Q\d+)$/);
    const continentMatch = continentUri.match(/\/(Q\d+)$/);
    if (countryMatch && continentMatch) {
      const countryId = countryMatch[1];
      const continentId = continentMatch[1];
      if (!mapping[countryId]) {
        mapping[countryId] = continentId;
      }
    }
  }
  return mapping;
}

async function main() {
  const entities = readCoreGeoEntities();

  // Get list of countries in core-geo
  const countries = [];
  for (const [qid, entity] of Object.entries(entities)) {
    if (entity.types && entity.types.includes("country")) {
      countries.push(qid);
    }
  }

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error("Fetching continent mappings from Wikidata...");

  // Fetch continent mappings in batches (API limit is 50 items per query)
  const mapping = {};
  const batchSize = 50;
  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    try {
      const batchMapping = await fetchContinents(batch);
      Object.assign(mapping, batchMapping);
      console.error(
        `Fetched ${Object.keys(mapping).length}/${countries.length} mappings`
      );
    } catch (err) {
      console.error(`Error fetching batch: ${err.message}`);
      // Continue with partial results
    }
  }

  // Generate statements
  const statements = [];
  for (const countryId of countries) {
    const continentId = mapping[countryId];
    if (!continentId) {
      console.error(
        `Warning: no continent mapping for ${countryId} (${entities[countryId]?.labels?.en || "unknown"})`
      );
      continue;
    }

    const country = entities[countryId];
    const countrySlug = country.labels.en
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const statement = {
      id: `cc:${countrySlug}`,
      subject: countryId,
      relation: "located_in",
      object: { kind: "entity", id: continentId },
    };

    statements.push(statement);
  }

  // Sort by ID for stable output
  statements.sort((a, b) => a.id.localeCompare(b.id));

  // Write statements.jsonl
  const lines = statements.map((s) => JSON.stringify(s));
  writeFileSync(
    new URL("statements.jsonl", import.meta.url),
    lines.join("\n") + "\n"
  );

  console.error(`Wrote ${lines.length} statements`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
