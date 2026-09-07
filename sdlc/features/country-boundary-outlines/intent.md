# Intent: country boundary outlines on the reveal map

Status: accepted

## Problem

When a country is the answer, the reveal map shows a pin plus a rectangular
window of clipped coastline (`localGeoJSON`), sized by a coarse per-type
constant (country = 10° half-span). That window neither traces the country nor
frames it correctly: Russia and Vatican City get the same box, and the learner
sees "some land near a dot," not the recognizable *shape* of the country.
Recognizing a country by its outline is a core geography skill the map can't
currently teach.

## Why it matters

Country-shape recognition is one of the things a geography learner most wants
and the map is closest to being able to teach — the geometry pipeline (#152,
#154, #155, #156) already precomputes and reveals regional geometry offline. We
are leaving that capability on the table: every country reveal is a generic dot
in a generic box, so the map under-teaches on exactly the entities it has the
most data for (193 of 400 core-geo entities).

## Proposed outcome

For a country answer, the reveal map draws the country's real administrative
boundary — a translucent fill with a solid stroke — and auto-zooms to frame that
boundary, so every country fills the frame at a legible scale whether it's
Russia or Luxembourg. The pin, label, and existing coastline context layer stay.
Outlines look equally crisp at each country's own zoom, and a country with no
confident boundary match falls back cleanly to today's pin + coastline.

## Affected users & systems

- **Learners** — the visible change: real outlines, subtle fill, auto-zoom.
- **Authors** — a new deterministic, re-runnable author-time import pass, plus a
  review report of unmatched countries.
- **Maintainers** — a new pure, unit-tested geometry module; the `map`
  visual-aid contract in `packages/contract`.
- **`packs/core-geo/entities.jsonl`** — gains a new per-country boundary field
  (working name `regionGeoJSON`); already 5.9 MB, so byte budget matters.
- **Natural Earth 10m admin-0** — new, finer source alongside the 50m land the
  coastline clip uses today; the two coexist.

## Constraints

- **Country entities only** (`types` includes `"country"`). Cities/continents
  untouched.
- **Everything stays author-time precompute** — no runtime or on-device
  clipping/simplification/network work at reveal.
- **Additive only** — `localGeoJSON` and `regionExtent` are kept for countries
  (they still drive the context layer, pin, label); the boundary is a new field.
- **Match on Wikidata QID** (`entity.id === feature.WIKIDATAID`); point-in-
  polygon rejected as primary key. Unmatched → review report + graceful
  fallback, never a broken reveal.
- **Reduced-motion** behavior unchanged from #152 (snap, no animation).
- New geometry validated by the visual-aid contract at the seam.

## Out of scope

- Non-country entities (cities, continents).
- Sub-national boundaries (admin-1).
- Runtime/on-device clipping or simplification.
- Any change to the coastline `localGeoJSON` / `regionExtent` pipeline (#154).
- Disputed-boundary editorial policy beyond what Natural Earth ships.
- Interaction/motion redesign — reuses #152/#156 zoom unchanged.

## Open questions

**All reviewed and resolved 2026-09-07** — see `spec.md` "Open Questions —
RESOLVED" for the reasoning. Summary:

1. Tolerance/island-drop — *method settled* (px-at-framing formula); two
   constants deferred to the plan's data spike.
2. Byte budget — reframed: per-reveal payload is one country; ~10 KB per-entity
   soft cap, confirmed in spike.
3. Antimeridian — **fall back in v1** (seam-crossers get pin+coastline only).
4. WIKIDATAID coverage — empirical, measured in the spike; misses → fallback.
5. Framing extent — **computed client-side**, nothing persisted.
6. Simplification — **Visvalingam via topojson**.
7. Field name — **`boundaryGeoJSON`** (needs a CONTEXT.md "Boundary" entry).

Source: GitHub issue #203 (`spec`, `ready-for-agent`).
