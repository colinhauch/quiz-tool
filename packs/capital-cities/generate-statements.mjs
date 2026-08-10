// Generate statements.jsonl for the capital-cities pack.
// Fetches each core-geo country's capital (Wikidata P36) and emits one
// country→capital `capital` statement per country whose capital core-geo owns.
//
// Usage: node generate-statements.mjs (from this directory; needs network)
//
// Modeled on ../continental-countries/generate-statements.mjs. Deterministic by
// construction: same core-geo entities in, byte-identical statements.jsonl out
// (stable sort by id). Regenerating is not routine — a capital that moves would
// change a statement id and orphan its answer history; treat a re-run as a
// deliberate, reviewed change. See ../core-geo/README.md.

import { readFileSync, writeFileSync } from "node:fs";

const WDQS = "https://query.wikidata.org/sparql";
const UA = "geo-quiz-tool/0.1 capital-cities (colin.hauch@gmail.com)";

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

/** Fetch the capital (P36) for each country from Wikidata, as { countryQid → capitalQid }. */
async function fetchCapitals(countryIds) {
  const values = countryIds.map((id) => `wd:${id}`).join(" ");
  const query = `
    SELECT ?country ?capital WHERE {
      VALUES ?country { ${values} }
      ?country wdt:P36 ?capital .
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
  const mapping = {};
  for (const binding of json.results.bindings) {
    const country = binding.country.value.match(/\/(Q\d+)$/);
    const capital = binding.capital.value.match(/\/(Q\d+)$/);
    // First capital wins: a handful of countries list more than one (historic
    // or de-jure). We keep it deterministic; a wrong pick is a curation fix in
    // core-geo, not a reason to emit two.
    if (country && capital && !mapping[country[1]]) mapping[country[1]] = capital[1];
  }
  return mapping;
}

async function main() {
  const entities = readCoreGeoEntities();

  const countries = Object.values(entities)
    .filter((e) => e.types?.includes("country"))
    .map((e) => e.id);

  // Every city core-geo owns. A capital statement may only point at one of
  // these: core-geo is the sole owner of entities, and the pack validator
  // rejects a statement whose object no pack owns. Countries whose capital is
  // not in core-geo are skipped below rather than emitted as a broken row.
  const ownedCities = new Set(
    Object.values(entities)
      .filter((e) => e.types?.includes("city"))
      .map((e) => e.id),
  );

  console.error(`Found ${countries.length} countries in core-geo`);
  console.error("Fetching capitals from Wikidata...");

  const mapping = {};
  const batchSize = 50;
  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    try {
      Object.assign(mapping, await fetchCapitals(batch));
      console.error(`Fetched ${Object.keys(mapping).length}/${countries.length} capitals`);
    } catch (err) {
      console.error(`Error fetching batch: ${err.message}`);
    }
  }

  const statements = [];
  for (const countryId of countries) {
    const capitalId = mapping[countryId];
    const name = entities[countryId]?.labels?.en ?? "unknown";
    if (!capitalId) {
      console.error(`Warning: no capital for ${countryId} (${name})`);
      continue;
    }
    if (!ownedCities.has(capitalId)) {
      console.error(
        `Warning: ${countryId} (${name}) capital ${capitalId} is not a core-geo city — skipped`,
      );
      continue;
    }

    const slug = entities[countryId].labels.en
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    statements.push({
      id: `cap:${slug}`,
      subject: countryId,
      relation: "capital",
      object: { kind: "entity", id: capitalId },
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
