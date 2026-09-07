# Spec: country boundary outlines on the reveal map  (from intent)

Status: accepted (2026-09-07) — open questions resolved (below); two tuning constants + match coverage pending the plan's first-step data spike.

Copied from GitHub issue #203 (https://github.com/colinhauch/quiz-tool/issues/203),
then the Open Questions were reviewed and resolved (see that section).
Intent: sdlc/features/country-boundary-outlines/intent.md

---

> **⚠️ Was captured mid-grilling.** The frontier (byte budget, antimeridian, WIKIDATAID coverage, pixel tolerances, field naming) has since been reviewed — see the resolved **Open Questions** section at the end. Only Q1/Q2/Q4's *numeric values* remain, and they close in the plan's first step (a throwaway import spike on real Natural Earth data). Method is settled.

Extends the reveal-map lineage: #152 (dual-scale animated reveal map), #154 (author-time regional geometry precompute), #155 (static regional reveal map), #156 (animated 1-D zoom). This adds a **true country boundary** to the map, replacing the "coastline clipped to a type-based box" as the thing that communicates *which country*.

## Problem Statement

When a country is the answer, the reveal map shows a pin plus a rectangular window of clipped coastline (`localGeoJSON`). That window is sized by a coarse per-type constant (country = 10° half-span), so it neither traces the country nor frames it correctly: Russia and Vatican City get the same box, and the learner sees "some land near a dot," not the recognizable *shape* of the country. Recognizing a country by its outline is a core geography skill the map currently can't teach.

## Solution

For country entities, precompute and store the country's actual administrative **boundary** (a simplified GeoJSON MultiPolygon) and draw it on the reveal map as a translucent fill with a solid stroke, on top of the existing coarse world base. Auto-zoom frames to the boundary's own extent, so every country fills the frame at the right scale. The pin, label, and existing coastline layer stay. Geometry is data-smart: each country is simplified adaptively so it looks equally crisp at its own zoom regardless of size, and sub-pixel islands are dropped.

## User Stories

1. As a learner, when the answer is a country, I want to see the country's real outline, so that I learn to recognize it by shape.
2. As a learner, I want the outline filled with a subtle highlight, so that I can tell the country apart from its neighbours at a glance.
3. As a learner, I want the map to auto-zoom to frame the whole country, so that I see it at a legible size whether it's Russia or Luxembourg.
4. As a learner viewing a small island nation (e.g. Maldives), I want its islands rendered finely, so that the shape is faithful and not a blob.
5. As a learner viewing a huge country (e.g. Canada), I want a rougher outline that still reads correctly, so that the payload stays small without hurting recognition at that zoom.
6. As a learner, I want the pin and label to remain, so that the exact labelled point and name are still anchored on the map.
7. As a learner, I want the existing coastline context layer to remain, so that the country sits in a recognizable surrounding geography.
8. As a learner on a slow connection, I want the added geometry to be modest in size, so that reveals stay fast.
9. As a learner with `prefers-reduced-motion`, I want the map to snap to the framed country without animation, so that motion settings are respected (unchanged from #152).
10. As an author, I want each country entity's boundary precomputed offline into the pack, so that answering a question does no clipping or network work at runtime (unchanged architecture from #154).
11. As an author, I want the boundary import to be deterministic and re-runnable, so that swapping source resolution or tolerances is a cheap rebuild.
12. As an author, I want a review report of any country whose boundary couldn't be matched confidently, so that I can eyeball a short list rather than trust silent wrong outlines.
13. As an author, I want a country with no confident boundary match to gracefully fall back to today's pin + coastline behavior, so that a match gap never breaks a reveal.
14. As a maintainer, I want the boundary geometry produced by a pure, unit-tested module, so that simplification and framing are verifiable without rendering.
15. As a maintainer, I want the new geometry validated by the visual-aid contract, so that a malformed boundary is rejected at the seam.
16. As a maintainer, I want antimeridian-crossing countries (Russia, Fiji, USA) handled deliberately, so that framing and rendering don't wrap the wrong way across the ±180° seam.

## Implementation Decisions

**Scope.** Country entities only (`types` includes `"country"` — 193 of the 400 core-geo entities). Cities and continents are untouched this pass.

**Data source.** Natural Earth **10m admin-0 (countries)** as the pre-simplification source. Start from the finest source and reduce; never start coarse. This is a distinct, finer source from the 50m land the coastline clip uses today — the two coexist.

**Entity → boundary match.** Join on Wikidata QID: Natural Earth 10m admin-0 carries a `WIKIDATAID` property; match `entity.id === feature.WIKIDATAID`. **Point-in-polygon was rejected as the primary key** — it wrongly assumes countries are contiguous and that the labelled `coordinate` falls inside the polygon, which fails for multipart and awkwardly-shaped countries. Matching is author-time; unmatched or ambiguous countries go into a review report (story 12) and fall back to today's behavior (story 13).

**Adaptive simplification — the key decision.** Because auto-zoom frames each country to its own extent, on-screen every country roughly fills the same frame. So simplification tolerance and island-drop are measured in **pixels at the entity's own regional (most-zoomed-in) framing**, not in degrees and not by country area. One rule yields the desired outcome automatically: Canada's per-pixel tolerance works out to a large number of degrees (coarse outline), the Maldives' to a tiny fraction of a degree (fine outline). Same rule drops any ring whose bounding box is sub-pixel *at that framing* — removing Canada's Arctic specks while keeping every Maldivian atoll. Exact tolerance/threshold values are an Open Question (need the card's rendered pixel size + a size report).

**Rendering.** Add one SVG path for the boundary: **translucent fill + solid stroke**, composited above the coarse world base and the coastline `localGeoJSON`, below the pin/label. Uses the same equirectangular projection (`x = lon+180, y = 90−lat`) and the existing `geoToPath`. Pin, label, and coordinate readout unchanged.

**Auto-zoom framing.** Frame countries to **bbox(boundary) + ~8% padding**, replacing the coarse type-based window as the zoom target. Reuses the client's existing `extentToView` / `fitAspect` / `interpolateView` (the frame is still fitted to the world aspect so on-screen height stays constant). **Computed client-side** from the boundary (Q5) — a trivial `bboxOf(geo)` added to `mapZoom`; nothing new persisted. Antimeridian seam-crossers do not reach this path — they take the fallback (Q3).

**Storage / schema.** Store the boundary on the country entity as a **new field `boundaryGeoJSON`** (Q7) beside the existing `coordinate`, `localGeoJSON`, `regionExtent`. **`localGeoJSON` and `regionExtent` are kept** for countries (not dropped): they are a pair — the coastline clip and the window it was clipped to — and they still drive the context layer, pin, and label. The boundary is additive. The `map` visual-aid contract (`packages/contract`) gains the optional `boundaryGeoJSON` (reuse `geoMultiPolygonSchema`). No stored framing field — the client derives it (Q5). `boundaryGeoJSON` needs a `CONTEXT.md` glossary entry ("Boundary") to keep it distinct from `regionExtent`'s window.

**Import path.** A new author-time pass (mirroring `packages/server/scripts/import-regional-geometry.ts`): load NE 10m admin-0, match each country by `WIKIDATAID`, compute the framing bbox (to get px/deg), simplify + drop islands adaptively via **Visvalingam / topojson** (Q6), write `boundaryGeoJSON` onto the entity in `packs/core-geo/entities.jsonl`. Seam-crossers and unmatched countries are skipped (Q3/Q4 fallback) and listed in the review report. Not in CI or the runtime path; deterministic and re-runnable.

**Simplification (Q6).** Topology-preserving Visvalingam via `topojson-server` (`topology()`) + `topojson-simplify` (`presimplify` / `simplify`) → back to GeoJSON with `topojson-client` (`feature()`, already a dep). Area-based, so it preserves recognizable shape better than Douglas–Peucker and keeps shared edges if neighbours are ever drawn. The per-country weight/area threshold is derived from the Q1 px formula.

**Payload (Q2).** The pack is baked into the server bundle (`packs.generated.ts`) and only the answered entity's visual aid is sent per reveal — so story 8's "modest size" is *one* country's boundary per reveal (single-digit KB once simplified), not the whole file. The 6.2 MB `entities.jsonl` / bundle total is a build-size concern, capped per-entity (~10 KB soft) and reported by the import.

## Testing Decisions

Good tests here assert **external behavior of pure functions against tiny synthetic geometry**, never rendering internals — exactly the style of `regional-geometry.test.ts` and `mapZoom.test.ts` today.

**Primary seam (ideal: the only new one): a new pure module** (working name `country-boundary.ts`, sibling of `regional-geometry.ts`), taking a country's raw boundary + its framing and returning the simplified/island-dropped MultiPolygon and the framing extent. Pure, total, no IO/network — the heavy NE source is loaded by the import script and passed in, as `regionalGeometryFor` already does. Unit tests, with synthetic polygons, cover: adaptive tolerance produces coarser output for a wide extent than a narrow one; sub-pixel rings are dropped while supra-pixel ones survive; a multipart country keeps all parts; bbox+padding framing is correct; antimeridian input is handled per whatever rule we choose.

**Contract seam:** extend `packages/contract` tests to accept a valid `regionGeoJSON` and reject a malformed one (prior art: the existing `localGeoJSON` / wrong-geometry-tag cases in `index.test.ts`).

**Client:** framing reuses the already-tested `mapZoom` functions, so no new pure logic there. The `MapAid` fill path is a thin rendering addition — covered by the existing component's render test if present; no new seam.

Import script and NE matching are not unit-tested (consistent with the existing import scripts); correctness there is caught by the review report + author spot-check.

## Out of Scope

- Non-country entities (cities, continents) — pins/coastline as today.
- Sub-national boundaries (admin-1 states/provinces).
- Runtime or on-device clipping/simplification — everything stays author-time precompute.
- Any change to the coastline `localGeoJSON` / `regionExtent` pipeline (#154) — additive only.
- Disputed-boundary editorial policy beyond whatever Natural Earth ships.
- Interaction/motion redesign — reuses #152/#156 zoom behavior unchanged.

## Open Questions — RESOLVED (reviewed 2026-09-07)

Grounded against the code during review: card is `.map-aid-viewport` `max-width: 26rem` (~416 px), 2:1; at regional framing **px/deg ≈ 416 / view.w**. The import already computes each country's framing bbox (needed to zoom), so tolerance can be expressed in screen pixels. Pack is server-bundled; only the answered entity's aid ships per reveal.

1. **Adaptive tolerance + island-drop threshold** — *Method settled, two constants pending a spike.* `tolerance_deg = TARGET_PX × view.w / 416`; drop rings whose bbox < `DROP_PX` in both dims at that framing. One rule → Canada-coarse, Maldives-fine automatically. `TARGET_PX` (~0.5) and `DROP_PX` (~1), and whether the reference width should be retina-doubled, are locked by the plan's first step: a throwaway import spike on real NE data.
2. **Byte budget** — *Reframed + settled.* Per-reveal payload is one simplified country (single-digit KB) — story 8 is a non-issue once tolerance is set. Bundle total capped per-entity (~10 KB soft), reused `COORD_DECIMALS = 3` rounding, totals reported by the import and confirmed in the spike.
3. **Antimeridian** — *Resolved: fall back in v1.* Seam-crossers (Russia, Fiji, USA/Aleutians, Kiribati, NZ) get **no** boundary; they reuse the existing pin + coastline fallback (story 13) and appear in the review report. No seam logic in v1 (the baked base + coastline layers live in [0,360], so unwrapping/splitting is out of scope). Revisit if the omitted list is unacceptable.
4. **WIKIDATAID coverage** — *Empirical, closes in the spike.* Join `entity.id === feature.WIKIDATAID` over the 193 countries; measure clean matches. Misses → fallback (story 13). Review-report row format: `{ entityId, label, reason: no-match | multi-match | empty-wikidataid | antimeridian }`.
5. **Framing extent: stored vs computed** — *Resolved: computed client-side.* Add a pure `bboxOf(geo)` to `mapZoom`, feed `extentToView`/`fitAspect`; prefer the boundary bbox over `regionExtent` as the zoom target when a boundary is present. Nothing new persisted; no contract field for framing.
6. **Simplification algorithm** — *Resolved: topology-preserving Visvalingam via topojson.* Area-based, best for shape recognition, preserves shared edges for future neighbour drawing. Adds `topojson-server` + `topojson-simplify` (`topojson-client` already a dep). Douglas–Peucker rejected (nibbles recognizable corners).
7. **New field name** — *Resolved: `boundaryGeoJSON`.* Parallel to `localGeoJSON`; keeps "region" meaning only the coastline window. Requires a `CONTEXT.md` glossary entry "Boundary".

### Spike findings (measured 2026-09-07, NE 10m admin-0 via nvkelso/natural-earth-vector)

Real data, so the "deferred" items are mostly closed already:

- **Q4 coverage — CLOSED: 191/193 match** on `entity.id === WIKIDATAID`. All 258 NE features carry a Q-style `WIKIDATAID`; no multi-matches. The **2 misses are Netherlands (`Q29999`) and Denmark (`Q756617`)** — the entity uses the *Kingdom* QID while NE uses the constituent-country QID (`Q55`, `Q35`). Fix is a curated QID override (the same alias-override pattern `core-geo` already uses for flags), *not* a data gap. Report row format confirmed.
- **Q3 seam-crossers — CONFIRMED: exactly 5** (United States, Russia, New Zealand, Kiribati, Fiji) by raw-bbox-width > 180°. These take the fallback.
- **Q2 byte budget — effectively CLOSED, comfortable.** Raw geometry is 11.1 MB total (Canada alone 1.5 MB), but adaptive simplify at `TARGET_PX = 0.5`, drop < 1 px, 3-decimal rounding gives **total ≈ 876 KB, median 3.4 KB, max ≈ 60 KB (Canada)** — a 92% cut, pre-gzip (~3–4× smaller over the wire). Per-reveal payload (one country) is a non-issue. The ~10 KB figure is demoted to a **review flag** (~25 KB is a saner eyeball threshold; 17 countries exceed 10 KB, all acceptable).
- **Q1 constants — method VALIDATED; remaining work is visual, not bytes.** The px-at-framing formula produces the intended coarse-Canada / fine-Maldives spread and lands well under budget. What the execution spike still tunes is purely *visual crispness* — the final `TARGET_PX`/`DROP_PX` chosen by eyeballing rendered output — and whether Canada's ~60 KB is worth coarsening. Note the proxy above used Douglas–Peucker; production uses Visvalingam (Q6), so exact bytes shift slightly.

_Spike was a throwaway measurement in scratch (no repo changes). Reproduce: download `ne_10m_admin_0_countries.geojson`, join our 193 country QIDs, apply the Q1 formula._

### Execution-spike constants — LOCKED (2026-09-07, Visvalingam preview at real framing)

- **`TARGET_PX = 0.75`** — chosen against a rendered grid (Canada/Maldives/Chile/France/Iceland/Japan/Italy) at each country's real auto-zoom framing. Crisp enough on complex coasts, leaner tail than 0.5.
- **`DROP_PX = 1`** — drop any ring whose projected bbox is < 1 px in both dims at that framing.
- **`CARD_PX = 416`** (26 rem), **not retina-doubled** — SVG is vector, so crispness at a CSS px is resolution-independent; doubling only bloats.
- **Byte-cap safety valve:** if a country's simplified `boundaryGeoJSON` exceeds **~40 KB** (pre-gzip), raise its tolerance (e.g. ×1.25 steps, `TARGET_PX` cap ~2.0) until under. At 0.75 only Canada (48 KB) trips it → settles ~38 KB (~px 1.0). Everyone else is already under.
- **Simplification weight:** Visvalingam min-area ≈ `(TARGET_PX × view.w / CARD_PX)²` deg², where `view.w` is the aspect-fitted (2:1) framing width. (Spike used this; production calibrates against `topojson-simplify` weights, which may differ by a constant factor — Step 2 confirms.)
- **QID overrides confirmed:** add `Q29999→Q55` (Netherlands) and `Q756617→Q35` (Denmark); the rest of the 191 join cleanly. Seam-crossers (US/Russia/NZ/Kiribati/Fiji) fall back.

Observed sizes at 0.75 (pre-gzip): Canada 48→~38 KB (capped), Chile 13.6, Iceland 14.7, Japan 8.7, Italy 7.8, France 1.2, Maldives 0.3.

---
_Drafted by agent from a grilling session; Open Questions reviewed and resolved with the originator on 2026-09-07._
