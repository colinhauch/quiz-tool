# Plan: country boundary outlines on the reveal map

Feature folder (source of truth): `sdlc/features/country-boundary-outlines/`
(`intent.md`, `spec.md`). Issue #203. On approval, this plan is copied to
`sdlc/features/country-boundary-outlines/plan.md` and becomes the live tracker.

## Context

Country reveals show a pin + a coarse type-boxed coastline clip, not the
country's real shape — so the map can't teach shape recognition. This adds a
precomputed **administrative boundary** (`boundaryGeoJSON`) drawn as a
translucent fill + solid stroke, auto-zoomed to its own extent. Additive: the
existing `localGeoJSON`/`regionExtent` coastline layer stays. All geometry is
author-time precompute; runtime just reads a field, exactly as `localGeoJSON`
does today. Spec open questions are resolved; a measurement spike (2026-09-07)
already proved 191/193 WIKIDATAID coverage and ~876 KB total simplified.

## Resumability model (the point of this structure)

Each step below is a self-contained "ticket": goal, files, reuse, **done-when**,
and it **ends at a commit that leaves `checks` green and is mergeable to `dev`**.
`plan.md` carries a live status box per step. **To resume in a fresh session:**
read `spec.md` + `plan.md`, find the first unchecked step, act — all context is
in the step. Stop at any step boundary safely.

Status: `[ ]` todo · `[~]` in-progress · `[x]` done (commit SHA)

---

## Step 0 — Execution spike: lock the visual constants  `[x]` (done 2026-09-07)

**LOCKED** (see `spec.md` "Execution-spike constants — LOCKED"):
`TARGET_PX = 0.75`, `DROP_PX = 1`, `CARD_PX = 416` (not retina-doubled),
byte-cap valve at ~40 KB (raise tolerance ×1.25 until under; only Canada trips
it, settles ~38 KB). Visvalingam min-area ≈ `(TARGET_PX × view.w / CARD_PX)²`.
QID overrides: `Q29999→Q55`, `Q756617→Q35`. Downstream steps read these.

_Spike was a throwaway Visvalingam preview grid in scratch; nothing to ship._

## Step 1 — Data seam: `boundaryGeoJSON` through the stack (no data yet)  `[x]` (done 2026-09-07)

- **Goal:** thread the optional field end to end so later steps have a target.
- **Files:**
  - `packages/engine/src/types.ts` — add `boundaryGeoJSON?: GeoMultiPolygon` to
    `Entity` (~L45) and `MapVisualAid` (~L241), mirroring `localGeoJSON` docs.
  - `packages/engine/src/answer.ts` — after L74-75, add
    `if (entity.boundaryGeoJSON) visual.boundaryGeoJSON = entity.boundaryGeoJSON;`
  - `packages/contract/src/index.ts` — add
    `boundaryGeoJSON: geoMultiPolygonSchema.optional()` to `mapVisualAidSchema`.
  - `packages/contract/src/index.test.ts` — extend the `visualAidSchema` block
    (~L140-160): accept a valid `boundaryGeoJSON`, reject a malformed one
    (mirror the existing `localGeoJSON` / wrong-`type` cases).
- **Reuse:** `geoMultiPolygonSchema` (contract L52), existing `GeoMultiPolygon`.
- **Done-when:** `pnpm -w typecheck` + contract tests pass. Field is optional so
  nothing else changes. Green, mergeable.

## Step 2 — Pure module `country-boundary.ts` + unit tests  `[ ]`

- **Goal:** the testable heart — raw boundary + framing → simplified,
  island-dropped MultiPolygon; plus seam-cross detection (→ caller falls back).
- **Files:** `packages/server/src/country-boundary.ts` (+ `.test.ts`),
  sibling of `regional-geometry.ts`. Pure/total, no IO — NE source is passed in
  by the script (same shape as `regionalGeometryFor`).
- **Design:**
  - `framingBboxOf(geo) → RegionExtent` (pre-simplification bbox, padded ~8%).
  - `isAntimeridianCrossing(geo) → boolean` (raw lon bbox width > 180°).
  - `simplifyForFraming(geo, extent, { targetPx, dropPx, cardPx }) → GeoMultiPolygon`
    — px/deg = `cardPx / view.w` (`view.w` = aspect-fitted extent width);
    tolerance/drop derived per the Step-0 formula; Visvalingam via
    `topojson-server` (`topology`) + `topojson-simplify` (`presimplify`/`simplify`)
    → `topojson-client` `feature`; round to 3 decimals.
- **New dep:** `topojson-server`, `topojson-simplify` (+ `@types/*`) in
  `packages/server` (dev). `topojson-client` already present.
- **Reuse:** `mapZoom` aspect math as the reference for `view.w`; test style from
  `regional-geometry.test.ts` (synthetic polygons, `describe`/`it`/`toBeClose`).
- **Done-when:** unit tests cover: coarser output for a wide extent than a narrow
  one; sub-px ring dropped, supra-px kept; multipart kept; padded bbox correct;
  seam-cross flagged. All pass. Green.

## Step 3 — Import script + run it  `[ ]`

- **Goal:** populate `boundaryGeoJSON` on the 186 eligible countries; report the
  rest.
- **Files:** `packages/server/scripts/import-country-boundaries.ts`; add
  `"packs:import-boundaries"` to `packages/server/package.json`
  (mirrors `import-regional-geometry.ts` / `packs:import-geometry`).
- **NE source (decision):** fetch NE 10m admin-0 from a **pinned** nvkelso
  commit URL into a gitignored cache on first run (author-time only, not CI,
  deterministic via the pin). Fallback if offline repro is wanted: vendor the
  file. State the pin in the script header.
- **Logic:** load NE → index by `WIKIDATAID` (+ the 2 curated QID overrides) →
  for each country entity: skip if seam-crossing or unmatched (record in report),
  else `simplifyForFraming` and write `boundaryGeoJSON`; preserve
  `localGeoJSON`/`regionExtent`. Emit review report
  (`{entityId,label,reason}`) to stdout/file.
- **Then:** run `pnpm --filter @geo/server packs:import-boundaries`, then
  `pnpm bundle-packs` (regenerates the committed `packs.generated.ts`).
- **Reuse:** `import-regional-geometry.ts` structure (JSONL read/rewrite,
  trailing-newline handling), `country-boundary.ts` from Step 2.
- **Done-when:** `entities.jsonl` + `packs.generated.ts` carry boundaries,
  report shows ~186 written / 5 seam / 2 fallback, `checks` green. Green.

## Step 4 — Client render + framing  `[ ]`

- **Goal:** draw the boundary and zoom to it.
- **Files:**
  - `packages/web/src/mapZoom.ts` — add pure `bboxOf(geo) → View`
    (+ test in `mapZoom.test.ts`).
  - `packages/web/src/MapAid.tsx` — accept `boundaryGeoJSON` prop; add a
    `<path className="map-aid__boundary" d={geoToPath(boundaryGeoJSON)}
    vectorEffect="non-scaling-stroke" />` **above** `map-aid__local`, **below**
    the marks; when a boundary is present, use its `fitAspect(bboxOf(...))` as the
    regional zoom target instead of `regionExtent`.
  - `packages/web/src/index.css` — `.map-aid__boundary`: translucent fill +
    solid stroke (unlike `.map-aid__local` which is fill-only), styled like
    `.map-aid__land` stroke.
- **Reuse:** existing `geoToPath`, `extentToView`/`fitAspect`/`interpolateView`,
  `non-scaling-stroke` convention.
- **Delivery:** boundary is already inline on the reveal response (no fetch, no
  lazy-load — see spec "Delivery & performance"). *Optional* snappiness: if a
  heavy country (Canada) janks the paint, defer the boundary `<path>` one
  `requestAnimationFrame` so pin/label/base render instantly. Add only if it
  visibly stutters.
- **Done-when:** boundary renders + auto-zoom frames it; existing MapAid tests
  pass; reduced-motion still snaps. Green — feature visible end to end.

## Step 5 — Vocabulary + docs + close-out  `[ ]`

- **Files:** `CONTEXT.md` — add glossary entry **Boundary** (the country outline;
  distinct from `regionExtent`'s coastline window); update `MapAid.tsx` /
  `regional-geometry.ts` module docs to mention the boundary layer; note the
  feature done in `spec.md`; close issue #203 with a link to the folder.
- **Done-when:** docs consistent, issue closed. Green.

---

## Verification (end to end)

- `pnpm -w typecheck && pnpm -w test` (engine, server, contract, web) — the
  `checks` gate.
- After Step 3: inspect the review report; grep a country in `entities.jsonl`
  for `boundaryGeoJSON`.
- After Step 4: `/run` the web app (or the launch config), answer a country
  question (e.g. Canada, Maldives, France) and confirm the outline draws + zooms;
  confirm a seam-crosser (Russia) and a fallback (Netherlands) degrade to
  pin+coastline with no error; toggle `prefers-reduced-motion`.

## Notes / risks

- Seam-crossers (5) and QID misses (2) intentionally get no boundary in v1 —
  they must degrade to today's behavior, not error (covered by Step 4 done-when).
- `packs.generated.ts` MUST be regenerated (`pnpm bundle-packs`) after Step 3 or
  the server ships stale data — easy to forget.
- Visvalingam bytes differ slightly from the DP proxy in the spike; Step 0/3
  confirm against real output.
