# Entity Identity

## Wikidata Q-IDs as canonical IDs

Entities use Wikidata Q-IDs wherever the entity exists in Wikidata — `Q155` is Brazil, `Q1490` is Tokyo. Entities with no Wikidata counterpart (app-specific reifications, mostly) get a namespaced ID like `gq:us_mx_border`.

This looks like an arbitrary convention. It is doing four jobs:

**Cross-pack deduplication becomes automatic.** Every pack independently agrees on what Brazil *is*, without coordination, without a mapping table, without a naming authority. Two packs authored years apart by different people converge on `Q155`. Any locally-invented ID scheme would need a registry, and the registry would need an owner.

**IDs are permanent and globally unique** — that is Wikidata's whole contract, and it is a stronger guarantee than we could offer ourselves.

**Every entity carries a free backlink** to the richest source of data about it, which matters when a future pack wants to extend an entity we already have.

**Import tooling maps 1:1.** Wikidata's model is close enough to ours that ETL is nearly mechanical: Q-IDs become entity IDs, properties become relation types, qualifiers become qualifiers. This is not a coincidence — the fact model was shaped with this correspondence in mind, because the alternative is hand-authoring hundreds of thousands of facts. See [../tooling/](../tooling/).

The dependency this creates: we have inherited an external ID space we do not control. If Wikidata merges or deletes an item, our IDs are stale.

**Accepted, for now** (reviewed 2026-07-17). The items we care about are the stable, well-curated ones, and a stale ID is a data problem rather than a structural one. The "for now" is the honest part: the dependency has deepened since this was first written — the pack is generated from Wikidata, the naming shape is Wikidata's, and the MVP's whole claim to simple data rests on a Wikidata-side filter. We are further in than "we borrowed some IDs".

What would reopen this: a merge or deletion hitting an entity a user has answer history against. That is the case where a stale ID stops being a data problem — the ID is the join key between the pack and the answer log, so a *silently wrong* Q-ID is worse than a missing one. Nothing in the MVP detects it. This is not worth solving before it happens, but it is worth recognising quickly when it does.

## Merging entities across packs

When two installed packs both define `Q155`, the records merge rather than collide: labels, aliases, and types union; per-field conflicts resolve in pack-installation order, later pack winning.

**Statements never conflict this way,** because each statement is its own record with its own ID. Two packs asserting different capitals of Brazil produce two statements, not a conflict — and that is correct, because they might both be true at different times. Disagreement is **represented rather than resolved**: it stays in the data instead of being settled at install time. The merge rule only has to handle display fields, which is why it can be this simple.

**What represents it is an open question, not a solved one.** An earlier version of this file said disagreement is represented "via rank and temporal qualifiers", which overstated things: the MVP has one pack and [no rank at all](statements.md), so cross-pack disagreement has never been exercised, let alone solved. Rank is a sketch of one mechanism.

There is a second mechanism, and it may be the better one: **state the disagreement as facts.** Rather than ranking two capital claims, assert both, and where the disagreement is itself the interesting thing, say so directly — `s(Israel, claims, Jerusalem)` and `s(Palestine, claims, Jerusalem)`. This needs no engine support, no flag, and no editorial layer; it is the uniform fact model doing its job. See [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md), where the MVP defers such entities to a later pack on exactly this basis.

Which mechanism wins — rank, statements-about-disagreement, or both for different cases — is decided when a second pack exists. Until then this section describes a property we have not tested.

## Naming: we take Wikidata's shape

Having taken Wikidata's IDs, we take its naming shape too — `labels`, `aliases`, `descriptions`, each keyed by language. These are not three flavours of "name". They are three jobs:

- **`labels`** — the string to *display*. At most one per language.
- **`aliases`** — the strings to *recall it by*, for search and (later) text-input matching. Any number per language.
- **`descriptions`** — how to tell two entities with the same label apart. Wikidata needs these because labels are not unique; "label + description" is what makes a key.

**The MVP fills `en` only, and reads only `labels`.** Aliases and descriptions ship unread. That is a real cost — an unread field cannot rot loudly — and it is accepted for two reasons: the shape is inherited rather than invented, so it is not ours to get wrong; and entities are keyed by Q-IDs, so a later pass can re-fetch aliases and descriptions for the entities we already have without regenerating the pack. There is no one-way door here. Contrast statement `rank`, where there is.

The language-keyed map is kept even with one key. A bare `name: string` would not save us the fallback policy — that has to be written the moment a second language exists either way — it would only delete the seam the policy lives in, and the retrofit cost lands in every call site that has to start threading a locale.

## Historical names are both

An entity's name can be *both* an alias and a statement, and this is not a contradiction.

"Edo" belongs in Tokyo's `aliases` — someone typing it should find Tokyo. "Edo" is *also* a fact with a date range, and once an `aka` pack ships it is a statement too, quizzable like any other. Wikidata does exactly this: alternative names sit in the term store *and* are asserted as dated, sourced claims.

The line is not "could you quiz it" — it is **dates, sources, and disputes**. A name that can be true during a period, cited, or disagreed with needs statement machinery. A name that is only the string a UI prints or a search box matches does not. One string can be on both sides of that line, in different roles.

> **Open question — what belongs in `aliases`?** An earlier version of this file offered a test: *"would you ever ask a question whose answer is this string? If yes, it is a statement."* That test was an invention, and it fails against the model we are copying — it puts "Edo" out of `aliases`, where Wikidata puts it in. It is withdrawn rather than repaired: there is no crisp rule here. Wikidata's own guidance is a set of exclusions (no misspellings — fuzzy search owns those; no capitalisation variants — normalisation owns those), each justified by another layer doing the job. We have neither layer yet, so we cannot copy the exclusions honestly. **This resolves when text input and an `aka` pack arrive together** — that is the first moment aliases are read, `aka` statements exist, and the overlap between them is forced. See [TODO.md](../../TODO.md).
