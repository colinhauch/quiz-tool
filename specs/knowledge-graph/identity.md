# Entity Identity

## Wikidata Q-IDs as canonical IDs

Entities use Wikidata Q-IDs wherever the entity exists in Wikidata — `Q155` is Brazil, `Q1490` is Tokyo. Entities with no Wikidata counterpart (app-specific reifications, mostly) get a namespaced ID like `gq:us_mx_border`.

This looks like an arbitrary convention. It is doing four jobs:

**Cross-pack deduplication becomes automatic.** Every pack independently agrees on what Brazil *is*, without coordination, without a mapping table, without a naming authority. Two packs authored years apart by different people converge on `Q155`. Any locally-invented ID scheme would need a registry, and the registry would need an owner.

**IDs are permanent and globally unique** — that is Wikidata's whole contract, and it is a stronger guarantee than we could offer ourselves.

**Every entity carries a free backlink** to the richest source of data about it, which matters when a future pack wants to extend an entity we already have.

**Import tooling maps 1:1.** Wikidata's model is close enough to ours that ETL is nearly mechanical: Q-IDs become entity IDs, properties become relation types, qualifiers become qualifiers. This is not a coincidence — the fact model was shaped with this correspondence in mind, because the alternative is hand-authoring hundreds of thousands of facts. See [../tooling/](../tooling/).

The dependency this creates: we have inherited an external ID space we do not control. If Wikidata merges or deletes an item, our IDs are stale. This is judged acceptable — the items we care about are stable, well-curated ones, and a stale ID is a data problem, not a structural one.

## Merging entities across packs

When two installed packs both define `Q155`, the records merge rather than collide: labels, aliases, and types union; per-field conflicts resolve in pack-installation order, later pack winning.

**Statements never conflict this way,** because each statement is its own record with its own ID. Two packs asserting different capitals of Brazil produce two statements, not a conflict — and that is correct, because they might both be true at different times. Disagreement between packs is represented as data (via rank and temporal qualifiers, see [rank-and-time.md](rank-and-time.md)) rather than resolved at install time. The merge rule only has to handle display fields, which is why it can be this simple.

## Display aliases vs. historical names

`aliases` on an entity are display synonyms — for text-input answer matching and search. "Tokio" is an alias of Tokyo.

A historical name with dates is **not** an alias. "Constantinople" is a statement (`aka`, with `start` and `end` qualifiers), because it is a fact we want to *ask questions about*. The same distinction as everywhere in this model: if it belongs to identity and display, it is an entity field; if you could quiz it, it is a statement.

The test when you are unsure: would you ever ask a question whose answer is this string? If yes, it is a statement.
