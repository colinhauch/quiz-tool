/**
 * `pnpm packs:import-geometry` — author-time backfill of each entity's regional
 * map geometry (spec #152, ticket #154). For every entity in
 * `packs/core-geo/entities.jsonl` that has a `coordinate`, it clips Natural
 * Earth 50m land to a window sized by the entity's type and stores the result
 * (`localGeoJSON` + `regionExtent`) on the entity, beside the coordinate.
 *
 * The clip step of the import path. Runs after `packs:import-coordinates` (which
 * fills `coordinate` from Wikidata P625): this pass needs no network — it reads
 * the already-stored coordinate + the bundled `world-atlas` 50m land — so it is
 * cheap, deterministic, and safe to re-run (e.g. when swapping 50m → 10m). The
 * pure clip logic it calls lives in `src/regional-geometry.ts` and IS unit-tested.
 *
 * Not part of CI or the runtime path. Run:
 *   `pnpm --filter @geo/server packs:import-geometry`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Entity, GeoMultiPolygon } from "@geo/engine";
import { feature } from "topojson-client";
import { regionalGeometryFor } from "../src/regional-geometry.js";

const ENTITIES_PATH = fileURLToPath(new URL("../../../packs/core-geo/entities.jsonl", import.meta.url));

const require = createRequire(import.meta.url);

/**
 * Load Natural Earth 50m land as one flat GeoJSON MultiPolygon in raw lon/lat.
 * `world-atlas` ships it as TopoJSON; `feature()` expands it to a
 * FeatureCollection of land features, which we merge into a single MultiPolygon.
 * 50m is the chosen resolution; swap to a 10m source here if coastlines look
 * coarse (see spec #152).
 */
function loadLand50m(): GeoMultiPolygon {
  const topology = require("world-atlas/land-50m.json");
  const collection = feature(topology, topology.objects.land) as unknown as {
    features: Array<{ geometry: { type: string; coordinates: unknown } }>;
  };
  const coordinates: number[][][][] = [];
  for (const { geometry } of collection.features) {
    if (geometry.type === "MultiPolygon") {
      coordinates.push(...(geometry.coordinates as number[][][][]));
    } else if (geometry.type === "Polygon") {
      coordinates.push(geometry.coordinates as number[][][]);
    }
  }
  return { type: "MultiPolygon", coordinates };
}

function main() {
  const land = loadLand50m();

  const lines = readFileSync(ENTITIES_PATH, "utf-8").split("\n");
  const trailingNewline = lines.at(-1) === "";
  const entityLines = trailingNewline ? lines.slice(0, -1) : lines;

  let withGeometry = 0;
  let withoutCoordinate = 0;

  const updatedLines = entityLines.map((line) => {
    if (line.trim() === "") return line;

    const entity = JSON.parse(line) as Entity;
    // An entity with no coordinate yields no local geometry and no extent —
    // and any stale geometry is stripped so the file stays consistent.
    if (!entity.coordinate) {
      withoutCoordinate++;
      const { localGeoJSON: _g, regionExtent: _e, ...rest } = entity;
      return JSON.stringify(rest);
    }

    withGeometry++;
    const { localGeoJSON, regionExtent } = regionalGeometryFor(entity.coordinate, entity.types, land);
    return JSON.stringify({ ...entity, localGeoJSON, regionExtent });
  });

  writeFileSync(ENTITIES_PATH, updatedLines.join("\n") + (trailingNewline ? "\n" : ""));

  console.log(
    `✓ imported regional geometry: ${withGeometry} entities clipped, ${withoutCoordinate} without a coordinate left bare`,
  );
}

main();
