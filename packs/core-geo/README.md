# core-geo

The published, entities-only tranche that owns every shared geographic entity:
continents (first-class, with Q-IDs), sovereign countries, capital cities, and
core cities. Ships `entities.jsonl` only — no statements, no generators — so it
yields no questions on its own. Topic tranches (`core-cities`, and later
`capital-cities`, `continental-countries`) ship statements over these entities
and no entities of their own.

Why it exists and why it is the *sole* entity owner:
`specs/knowledge-graph/identity.md` and `specs/tooling/mvp-bootstrap.md`.

## Files

- `curated-qids.tsv` — the frozen, author-curated input: one `qid<TAB>type` row
  per entity. The **set** of entities and each entity's **type** are chosen
  here; editing this file is how the pack's contents change.
- `fetch-entities.mjs` — resolves each Q-ID's English label + `en` aliases from
  the Wikidata Query Service and emits `entities.jsonl` in the curated order.
- `entities.jsonl` — the generated pack data, committed. This *is* the pack.

## Re-publishing

```
node fetch-entities.mjs      # from this directory; needs network
```

Deterministic by construction: same `curated-qids.tsv` in, byte-identical
`entities.jsonl` out (stable ordering, sorted+deduped aliases). To add or remove
entities, edit `curated-qids.tsv` and re-run.

**Regenerating is not routine.** A fresh fetch can move labels, and answer
history joins on the Q-ID — so a re-publish is a deliberate, reviewed change,
not a build step. See the statement-ID discussion in
`specs/tooling/mvp-bootstrap.md`.
