import { readFileSync } from "node:fs";
import type { Entity, Pack, Statement } from "@geo/engine";
import { generators, packDir } from "@geo/pack-core-cities";

/**
 * The one piece of pack IO in the system. The engine stays pure by never
 * touching disk; the server reads a pack's data files here and hands the
 * engine an already-assembled {@link Pack}. Swapping in the real `core-cities`
 * pack later is a data change behind this seam, not a code change.
 */

/** Parse a `.jsonl` file (one JSON object per line) relative to the pack dir. */
function readJsonl<T>(file: string): T[] {
  const text = readFileSync(new URL(file, packDir), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Loads the fixture `core-cities` pack from local disk: its entities and
 * statements off `.jsonl`, its generators from the pack's code. Called once at
 * startup (and per integration test) — the runtime trusts the data, per the
 * validate-at-build/install discipline in `specs/packs/README.md`.
 */
export function loadCoreCitiesPack(): Pack {
  const entities = new Map(readJsonl<Entity>("entities.jsonl").map((e) => [e.id, e]));
  const statements = readJsonl<Statement>("statements.jsonl");
  return { entities, statements, generators };
}
