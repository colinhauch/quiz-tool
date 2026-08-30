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

/**
 * Wikidata has more than one item that reads "Oceania": Q538 is the geographic
 * region, Q55643 is the continent. `P30` returns Q538 for the Pacific island
 * nations, but core-geo owns Q55643 — so six statements pointed at an entity no
 * pack owned, and answering any of those questions 404'd. Canonicalise here,
 * and refuse anything else core-geo does not own (below), so a re-run cannot
 * silently reintroduce the same class of break.
 */
const CONTINENT_ALIASES = { Q538: "Q55643" };

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
  // A country maps to *every* continent P30 gives it, not one: a transcontinental
  // country like Kazakhstan or Turkey spans two, and the pack should teach that
  // (any-of grading accepts either, and the reveal lists both). De-duplicated,
  // in first-seen order.
  const mapping = {};
  for (const binding of json.results.bindings) {
    const countryUri = binding.country.value;
    const continentUri = binding.continent.value;
    const countryMatch = countryUri.match(/\/(Q\d+)$/);
    const continentMatch = continentUri.match(/\/(Q\d+)$/);
    if (countryMatch && continentMatch) {
      const countryId = countryMatch[1];
      const continentId =
        CONTINENT_ALIASES[continentMatch[1]] ?? continentMatch[1];
      const continents = (mapping[countryId] ??= []);
      if (!continents.includes(continentId)) continents.push(continentId);
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

  // Every continent core-geo owns. A statement may only point at one of these:
  // core-geo is the sole owner of entities, so a continent it does not own is
  // an unresolvable reference, which the pack validator now rejects at load.
  const ownedContinents = new Set(
    Object.values(entities)
      .filter((e) => e.types?.includes("continent"))
      .map((e) => e.id)
  );

  const slugify = (text) =>
    text
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

  // Generate statements — one per (country, continent), so a transcontinental
  // country yields several. Ids carry the continent slug to stay unique.
  const statements = [];
  for (const countryId of countries) {
    const continentIds = mapping[countryId];
    if (!continentIds || continentIds.length === 0) {
      console.error(
        `Warning: no continent mapping for ${countryId} (${entities[countryId]?.labels?.en || "unknown"})`
      );
      continue;
    }

    const country = entities[countryId];
    const countrySlug = slugify(country.labels.en);

    for (const continentId of continentIds) {
      if (!ownedContinents.has(continentId)) {
        console.error(
          `Warning: ${countryId} (${entities[countryId]?.labels?.en || "unknown"}) maps to ${continentId}, which core-geo does not own — skipped`
        );
        continue;
      }
      statements.push({
        id: `cc:${countrySlug}-${slugify(entities[continentId].labels.en)}`,
        subject: countryId,
        relation: "located_in_continent",
        object: { kind: "entity", id: continentId },
      });
    }
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
