# Pack Format

The concrete file layout. The reasoning behind it is in [README.md](README.md).

> **[UNREVIEWED]** — rewritten for the discovery shift ([ADR-0001](../../docs/adr/0001-packs-are-discovered-not-compiled-in.md)): manifest fields that nothing read are gone, `relations` is new, and the install/uninstall lifecycle is cut back to what is actually intended. Confirm the manifest is the shape you want before packs are rewritten against it.

This file used to justify itself as "a contract with things outside the app — external pack authors and ETL." That was never true of the authors, and it is explicitly not the goal now (see [README.md](README.md)). It stays because a pack directory is assembled by hand and by scripts that live outside the type system, so a written layout still earns its keep — but it is a description of our own convention, not an external contract.

## Directory layout

A pack is a directory under `packs/`. The loader finds its files **by convention**, not from the manifest:

```
packs/continental-countries/
  pack.json          required
  entities.jsonl     optional — only the pack that owns entities has one
  statements.jsonl   optional
  index.ts           optional — generators; omit if the pack defines no relations
```

`.jsonl` (one JSON object per line) for the large files so they stay streamable and diff-friendly. A 300-city pack is either a big JSON array or a pleasant line-oriented file; the latter reviews in git.

There is no per-pack `package.json` or `tsconfig.json`. `packs/` is a single workspace package, so generator code is typechecked and `@geo/engine` resolves, without any per-pack build files.

## Manifest (`pack.json`)

```jsonc
{
  "id": "continental-countries",
  "version": "0.0.1",                       // semver; not yet read by anything
  "labels":       { "en": "Continental Countries" },
  "descriptions": { "en": "Country→continent statements over core-geo's entities." },
  "license": "CC0-1.0",
  "credits": [{ "source": "Wikidata", "retrieved": "2026-07-26" }],

  // Every relation this pack defines. Declaring it here is what makes it real:
  // the loader builds a registry from these and throws on a redefined id, or on
  // a statement whose relation nobody declared.
  "relations": {
    "located_in_continent": {
      "labels": { "en": "is in continent" },
      "kind": "text",                       // which question kind grades it
      "hiddenSlots": ["object"]             // defaults to ["object"] if omitted
    }
  }
}
```

A pack that defines no relations of its own — `core-geo`, which ships only entities — omits `relations` entirely.

### Fields that used to be here

`contents`, `depends`, and `engine_min_version` are gone. All three were decorative: nothing ever read `pack.json`, the loader hardcoded the `.jsonl` filenames, and the three shipped packs had already drifted into three different conventions for `depends` without anyone noticing. That drift is the argument — an unread field is not documentation, it is a claim that will be wrong.

- **`contents`** was a second source of truth for filenames the loader already assumed. Convention removes the possibility of disagreement.
- **`depends`** implied a resolution step that does not exist and is not needed: entity single-ownership means load order cannot change the assembled graph. A missing dependency surfaces as a validator error naming the absent pack, which is the only thing resolution would have bought.
- **`engine_min_version`** is meaningless while packs ship inside the app — they version together.

## Load-time validation

Run by the loader at boot, and by `pnpm packs:validate` on demand. The runtime never re-checks — see [README.md](README.md). Any failure stops the load with the offending pack named.

1. Manifest well-formed; `id` matches the directory name and is unique.
2. Every relation declared here is declared by no other pack.
3. Every statement's relation is declared by some pack.
4. Every relation declared with a generator has one, and every generator has a declaration.
5. Every entity reference in a statement resolves to an entity some pack owns.
6. No Q-ID is owned by more than one pack.
7. Statement IDs are unique across all packs — statements never merge, so a clash is always an error.

Checks the original design imagined and we have not built: subject and object types satisfying a relation's `domain`/`range`, qualifier bags validating against a `qualifier_schema`, literal objects matching a declared datatype, asset references resolving. Each needs a relation type system that does not exist yet. Declaring those fields before anything reads them is exactly how `contents` and `depends` rotted — registry first, then declaration.

## Update lifecycle

**Not built.** Recorded because the constraint is real and shapes the data.

An update diffs by stable statement ID: new statements insert; removed statements become `deprecated` rather than deleted, preserving answer history; changed statements update in place. There is no install or uninstall step — a pack is present in `packs/` or it is not — but a pack that disappears leaves answer events pointing at its statements, which is the same log-integrity concern that drives `deprecated`.

All of this depends on statement IDs being stable across rebuilds. They are, in principle: IDs are authored pack data, frozen at authoring time, so a rebuild re-emits them unchanged — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).
