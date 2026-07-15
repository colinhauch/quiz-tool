# Pack Format

> **[UNREVIEWED]** — Proposed, never built. No pack has been authored against this format and no installer has read it.

The concrete file layout, preserved from the original design. The reasoning behind it is in [README.md](README.md).

This one has more durable value than most reference material here, because **the pack format is a contract with things outside the app** — external pack authors and the ETL pipeline. App code won't fully express it the way it expresses an internal type, so a written format is likely to stay useful even after implementation.

## Manifest (`pack.json`)

```jsonc
{
  "id": "borders",
  "version": "1.0.0",                       // semver
  "labels": { "en": "Country Borders" },
  "descriptions": { "en": "Land borders between all countries, with lengths." },
  "engine_min_version": "0.3.0",
  "depends": [ { "id": "core-countries", "version": ">=1.0.0" } ],  // provides the country entities
  "license": "CC0-1.0",
  "credits": [ { "source": "wikidata", "retrieved": "2026-07-01" } ],
  "contents": {
    "entity_types":   "entity_types.json",   // optional
    "relation_types": "relation_types.json", // optional
    "entities":       "entities.jsonl",      // optional
    "statements":     "statements.jsonl",    // optional
    "assets":         "assets/"              // optional
  }
}
```

Every entry in `contents` is optional — that is the composability point from [README.md](README.md). The `borders` pack ships no entity file at all.

**`.jsonl` for the large files** (one JSON object per line) so they stay streamable and diff-friendly. A 300-city pack is a big JSON array or a pleasant line-oriented file; the latter reviews in git.

## Install-time validation

Run when a pack is built and again on install. The runtime never re-checks — see [README.md](README.md).

1. Manifest well-formed; dependencies resolvable at compatible versions.
2. Every statement's `relation` is registered (locally or via a dependency).
3. Subject/object types satisfy the relation's `domain`/`range`; literal objects match `arity` and datatype.
4. Qualifier bags validate against `qualifier_schema` plus the core qualifiers.
5. All entity references resolve (within the pack or its dependencies).
6. No relation-type ID collisions with installed packs.
7. Asset references resolve to bundled files.

## Lifecycle

**Install:** merge entities per the merge rule in [../knowledge-graph/identity.md](../knowledge-graph/identity.md), register relation types, insert statements tagged with `pack_id`.

**Update:** diff by stable statement ID. New statements insert; removed statements become `deprecated`, preserving answer history; changed statements update in place with `modified` bumped.

**Uninstall:** deactivate the pack's statements. The original design floated keeping a `statements_archive` so answer events pointing at removed statements still resolve — that is an unresolved detail, and it is the same log-integrity concern that drives `deprecated`.

All three depend on statement IDs being stable across rebuilds, which is unresolved — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).
