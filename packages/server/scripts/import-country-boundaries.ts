/**
 * `pnpm packs:import-boundaries` — author-time backfill of each country's real
 * administrative outline (`boundaryGeoJSON`) on the reveal map (spec #203,
 * `sdlc/features/country-boundary-outlines/`). For every `country` entity in
 * `packs/core-geo/entities.jsonl`, it matches a Natural Earth 10m admin-0
 * feature by Wikidata QID, adaptively simplifies its boundary to the reveal
 * framing (see `src/country-boundary.ts`), and stores the result on the entity
 * beside `coordinate` / `localGeoJSON` / `regionExtent` — never per request.
 *
 * Not part of CI or the runtime path. Deterministic and re-runnable: the NE
 * source is pinned to an immutable commit and cached under a gitignored dir on
 * first run, and the pure simplify logic it calls IS unit-tested. After running
 * this, run `pnpm bundle-packs` to regenerate the committed `packs.generated.ts`
 * or the server ships stale data.
 *
 * Run: `pnpm --filter @geo/server packs:import-boundaries`
 *
 * ── Source pin ──────────────────────────────────────────────────────────────
 * nvkelso/natural-earth-vector @ v5.1.2, commit
 * f1890d9f152c896d250a77557a5751a93d494776, file
 * geojson/ne_10m_admin_0_countries.geojson (13.3 MB, 258 features, every one
 * carrying a Q-style WIKIDATAID). To bump the source, change NE_COMMIT and
 * delete the cache. Offline repro: drop the file into the cache dir by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Entity, GeoMultiPolygon } from "@geo/engine";
import { framingBboxOf, isAntimeridianCrossing, simplifyForFraming, TARGET_PX } from "../src/country-boundary.js";

const ENTITIES_PATH = fileURLToPath(new URL("../../../packs/core-geo/entities.jsonl", import.meta.url));
const CACHE_DIR = fileURLToPath(new URL("./.ne-cache/", import.meta.url));
const CACHE_PATH = `${CACHE_DIR}ne_10m_admin_0_countries.geojson`;

const NE_COMMIT = "f1890d9f152c896d250a77557a5751a93d494776";
const NE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_10m_admin_0_countries.geojson`;

/**
 * Curated QID overrides (spec Q4 spike): our entities use the *Kingdom* QID for
 * the Netherlands and Denmark, while NE keys the constituent country. Same
 * alias-override pattern core-geo already uses for flags. Every other country
 * joins cleanly on its own id.
 */
const QID_OVERRIDES: Record<string, string> = {
  Q29999: "Q55", // Netherlands (Kingdom) → Netherlands (country)
  Q756617: "Q35", // Denmark (Kingdom) → Denmark (country)
};

/**
 * Soft per-entity byte cap for the simplified boundary, pre-gzip (spec
 * "Execution-spike constants"). Only Canada trips it at the locked TARGET_PX;
 * the valve raises that country's tolerance in ×1.25 steps until it fits.
 */
const BYTE_CAP = 40 * 1024;
const VALVE_STEP = 1.25;
const TARGET_PX_MAX = 2.0;

/** A country's boundary counts as chunky (worth an eyeball) above this. */
const REVIEW_FLAG_BYTES = 25 * 1024;

type NeFeature = { properties: { WIKIDATAID?: string }; geometry: { type: string; coordinates: unknown } | null };

/** Normalize an NE feature's geometry (Polygon or MultiPolygon) to MultiPolygon. */
function toMultiPolygon(geometry: NeFeature["geometry"]): GeoMultiPolygon | undefined {
  if (!geometry) return undefined;
  if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates as number[][][][] };
  }
  if (geometry.type === "Polygon") {
    return { type: "MultiPolygon", coordinates: [geometry.coordinates as number[][][]] };
  }
  return undefined;
}

/** Fetch the pinned NE file into the gitignored cache once; reuse it after. */
async function loadNaturalEarth(): Promise<Map<string, GeoMultiPolygon>> {
  if (!existsSync(CACHE_PATH)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`↓ fetching NE 10m admin-0 @ ${NE_COMMIT.slice(0, 10)} …`);
    const res = await fetch(NE_URL);
    if (!res.ok) throw new Error(`NE fetch failed: HTTP ${res.status}`);
    writeFileSync(CACHE_PATH, Buffer.from(await res.arrayBuffer()));
  }
  const gj = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as { features: NeFeature[] };
  const byWikidata = new Map<string, GeoMultiPolygon>();
  for (const f of gj.features) {
    const qid = f.properties.WIKIDATAID;
    const mp = toMultiPolygon(f.geometry);
    if (qid && mp) byWikidata.set(qid, mp);
  }
  return byWikidata;
}

/**
 * Simplify to the byte cap: start at the locked tolerance, and while the result
 * is over `BYTE_CAP`, raise `targetPx` by `VALVE_STEP` until it fits or the cap
 * on tolerance is reached. Returns the boundary plus the tolerance used.
 */
function simplifyUnderCap(raw: GeoMultiPolygon): { boundary: GeoMultiPolygon; targetPx: number } {
  const extent = framingBboxOf(raw);
  let targetPx = TARGET_PX;
  let boundary = simplifyForFraming(raw, extent, { targetPx });
  while (JSON.stringify(boundary).length > BYTE_CAP && targetPx < TARGET_PX_MAX) {
    targetPx = Math.min(targetPx * VALVE_STEP, TARGET_PX_MAX);
    boundary = simplifyForFraming(raw, extent, { targetPx });
  }
  return { boundary, targetPx };
}

type ReportRow = {
  entityId: string;
  label: string;
  reason: "no-match" | "antimeridian" | "all-sub-pixel";
};

async function main() {
  const byWikidata = await loadNaturalEarth();

  const lines = readFileSync(ENTITIES_PATH, "utf-8").split("\n");
  const trailingNewline = lines.at(-1) === "";
  const entityLines = trailingNewline ? lines.slice(0, -1) : lines;

  const skipped: ReportRow[] = [];
  const capped: string[] = [];
  const chunky: Array<{ label: string; bytes: number }> = [];
  let written = 0;

  const updatedLines = entityLines.map((line) => {
    if (line.trim() === "") return line;
    const entity = JSON.parse(line) as Entity & { boundaryGeoJSON?: GeoMultiPolygon };

    // Non-country entities never carry a boundary; strip any stale field so a
    // re-run after a scope change leaves the file consistent.
    if (!entity.types.includes("country")) {
      const { boundaryGeoJSON: _b, ...rest } = entity;
      return JSON.stringify(rest);
    }

    const { boundaryGeoJSON: _b, ...bare } = entity;
    const raw = byWikidata.get(QID_OVERRIDES[entity.id] ?? entity.id);
    if (!raw) {
      skipped.push({ entityId: entity.id, label: entity.labels.en, reason: "no-match" });
      return JSON.stringify(bare);
    }
    // Seam-crossers get no boundary in v1 (spec Q3): the baked base + coastline
    // live in [−180, 180] with no unwrapping, so a boundary spanning the seam
    // would frame and draw wrong. They fall back to today's pin + coastline.
    if (isAntimeridianCrossing(raw)) {
      skipped.push({ entityId: entity.id, label: entity.labels.en, reason: "antimeridian" });
      return JSON.stringify(bare);
    }

    const { boundary, targetPx } = simplifyUnderCap(raw);
    // An all-atoll archipelago (Maldives, Marshall Islands) can lose every ring
    // to the sub-pixel drop at its own framing, leaving an empty geometry with
    // no usable bbox. Don't ship that — fall back to pin + coastline and report
    // it (spec story 13). Framing story 4's fine atolls at whole-country zoom is
    // a known limitation, tracked in the spec.
    if (boundary.coordinates.length === 0) {
      skipped.push({ entityId: entity.id, label: entity.labels.en, reason: "all-sub-pixel" });
      return JSON.stringify(bare);
    }
    const bytes = JSON.stringify(boundary).length;
    if (targetPx > TARGET_PX) capped.push(`${entity.labels.en} (px ${targetPx.toFixed(2)}, ${(bytes / 1024).toFixed(1)} KB)`);
    if (bytes > REVIEW_FLAG_BYTES) chunky.push({ label: entity.labels.en, bytes });
    written++;
    return JSON.stringify({ ...bare, boundaryGeoJSON: boundary });
  });

  writeFileSync(ENTITIES_PATH, updatedLines.join("\n") + (trailingNewline ? "\n" : ""));

  // ── Review report (spec story 12) ──────────────────────────────────────────
  const noMatch = skipped.filter((r) => r.reason === "no-match");
  const seam = skipped.filter((r) => r.reason === "antimeridian");
  const subPixel = skipped.filter((r) => r.reason === "all-sub-pixel");
  console.log(`\n✓ boundaries imported: ${written} written, ${skipped.length} skipped\n`);
  console.log(`  antimeridian seam-crossers (fallback, ${seam.length}): ${seam.map((r) => r.label).join(", ") || "—"}`);
  console.log(`  all sub-pixel at framing (fallback, ${subPixel.length}): ${subPixel.map((r) => r.label).join(", ") || "—"}`);
  console.log(`  no NE match (fallback, ${noMatch.length}): ${noMatch.map((r) => `${r.label} [${r.entityId}]`).join(", ") || "—"}`);
  console.log(`  byte-cap valve raised tolerance (${capped.length}): ${capped.join(", ") || "—"}`);
  chunky.sort((a, b) => b.bytes - a.bytes);
  console.log(
    `  chunky (>${REVIEW_FLAG_BYTES / 1024} KB, eyeball, ${chunky.length}): ${chunky.map((c) => `${c.label} ${(c.bytes / 1024).toFixed(1)}KB`).join(", ") || "—"}`,
  );
  console.log(`\n  Next: pnpm --filter @geo/server bundle-packs (regenerate packs.generated.ts).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
