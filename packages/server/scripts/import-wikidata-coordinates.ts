/**
 * `pnpm packs:import-coordinates` — author-time backfill of `Entity.coordinate`
 * from Wikidata's P625 (coordinate location) claim, keyed by each entity's
 * Q-ID.
 *
 * Runs once, by hand, when core-geo's entity list changes. Not part of the
 * server's runtime path and not part of CI — no network calls happen at boot
 * or in tests; see `wikidata-coordinate.ts` for the pure claim-extraction
 * logic this script calls, which IS unit-tested.
 *
 * Fetches each entity's JSON from the Special:EntityData REST endpoint,
 * extracts P625, and merges the result into `packs/core-geo/entities.jsonl`
 * in place — preserving line order and every other field. An entity that
 * already has a seeded `coordinate` (see #108) and has no P625 on Wikidata
 * keeps its seeded value; only a successful P625 lookup overwrites it.
 *
 * Run: `pnpm --filter @geo/server packs:import-coordinates`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Entity } from "@geo/engine";
import { extractCoordinate, type WikidataEntity } from "../src/wikidata-coordinate.js";

const ENTITIES_PATH = fileURLToPath(new URL("../../../packs/core-geo/entities.jsonl", import.meta.url));

/** Politeness delay between requests, per Wikidata's rate-limit etiquette. */
const REQUEST_DELAY_MS = 200;

const USER_AGENT = "geo-learning-engine-coordinate-import/1.0 (author-time script; contact: colin.hauch@gmail.com)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches one Q-ID's entity JSON from the Special:EntityData REST endpoint. */
async function fetchWikidataEntity(qid: string): Promise<WikidataEntity | undefined> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.error(`  ✗ ${qid}: HTTP ${res.status}`);
    return undefined;
  }
  const body = (await res.json()) as { entities?: Record<string, WikidataEntity> };
  return body.entities?.[qid];
}

async function main() {
  const lines = readFileSync(ENTITIES_PATH, "utf-8").split("\n");
  const trailingNewline = lines.at(-1) === "";
  const entityLines = trailingNewline ? lines.slice(0, -1) : lines;

  let found = 0;
  let missing = 0;

  const updatedLines: string[] = [];
  for (const line of entityLines) {
    if (line.trim() === "") {
      updatedLines.push(line);
      continue;
    }

    const entity = JSON.parse(line) as Entity;
    const wikidataEntity = await fetchWikidataEntity(entity.id);
    const coordinate = wikidataEntity ? extractCoordinate(wikidataEntity) : undefined;

    if (coordinate) {
      found++;
      updatedLines.push(JSON.stringify({ ...entity, coordinate }));
    } else {
      missing++;
      // No P625 (or lookup failed): leave any seeded coordinate untouched.
      updatedLines.push(JSON.stringify(entity));
    }

    await sleep(REQUEST_DELAY_MS);
  }

  writeFileSync(ENTITIES_PATH, updatedLines.join("\n") + (trailingNewline ? "\n" : ""));

  console.log(`✓ imported coordinates: ${found} entities got a P625 coordinate, ${missing} did not`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
