# Statements

The atomic unit of knowledge. Every quizzable fact is one, and every answer ever logged references one by ID.

## The object slot is a closed union

An object is **either** a reference to another entity **or** a typed literal. Two arms, closed deliberately.

The closure matters more than either arm. It is what lets every consumer — the scheduler, the answer log, the template engine, the distractor generator — exhaustively handle objects with no default case. Adding a third arm is not a feature addition; it is a change that touches every consumer, so it's worth understanding how much that closure buys before reaching for a third case.

Literal datatypes (string, quantity, date, dateRange, boolean) are **engine-level, not pack-level**. This is the load-bearing split in the whole model: **the engine defines the literals — the kinds of data — and packs define the qualifiers that couch that data.** Literals have to be engine-level because validation and question generation reason about them directly: `literal_spread` distractors know what a quantity is, and couldn't know what an arbitrary pack-defined type is. Qualifiers, by contrast, aren't predictable enough to plan the engine around, so packs own them (see below). Adding a datatype is therefore an engine change with a version bump — a real cost, and the reason the literal set stays small and general enough to hold any *kind* of data.

## Why statements carry provenance

Every statement records which pack introduced it and where it originally came from. Two reasons:

The primary one is **verifiability** — knowing where a fact came from means we can go back to the source and check it when something looks wrong. A quiz that teaches wrong facts is worse than useless, and the origin link is how a bad fact gets traced and fixed. Credit and licensing ride along here too: packs carry licenses and sources deserve attribution.

The second, and it's a real convenience: **a statement's origin makes pack update and uninstall tractable.** When a pack updates, we diff by statement ID and mark removed statements deprecated rather than deleting them; when it uninstalls, its statements deactivate. Both operations need to know which statements belong to whom, and answer events pointing at deleted statements would otherwise dangle. See [../packs/](../packs/).

## Qualifiers are pack-defined

Qualifiers are per-statement metadata that couches a fact — a border's length, a capital's start date, a name's period of use. Where literals are engine-level, **qualifiers are the pack's to define.** A pack declares the full set of qualifiers it uses and ships the tooling and explanation for working with them; the engine doesn't need a fixed qualifier vocabulary to function. This is deliberate: qualifier vocabularies vary too much between kinds of content to plan the engine around, so the engine provides the basic structure and each pack fills in the details it needs. See [../packs/](../packs/).

The engine may still *reserve* a few names by convention (`start`, `end`, `as_of`, `note`) so that packs which want temporal semantics spell them the same way — but for MVP it implements nothing special for them; a pack that uses `start` is just using one of its own declared qualifiers. Cross-pack coordination on a shared temporal vocabulary is a later concern, not an MVP one.

## Qualifiers are quizzable, and this was free

> Post-MVP: we don't quiz qualifiers yet. This section is here for the structural point it makes about the log, which *is* an MVP decision.

Because answer events reference a statement rather than a bare triple, asking "when did Constantinople become Istanbul?" would be just quizzing a qualifier of an existing statement. No new fact kind, no new log shape — the answer event hides the `end` qualifier of that statement and everything else works unchanged.

This is a good illustration of why the log references statements. Had it referenced subject/relation/object triples, qualifier questions would have needed a parallel logging path.

## Identity and stability

Statement IDs must be stable across pack rebuilds, because **answer events reference them and history must survive a pack update.** An ETL re-run that churns IDs orphans a user's entire learning record for that pack — this is the single most destructive failure mode in the data model, and it is silent.

How to achieve that stability is unresolved. See [open-questions.md](open-questions.md).

## Related

- [rank-and-time.md](rank-and-time.md) — how a statement stops being true without being deleted.
- [identity.md](identity.md) — the same problem for entities, where it has a clean answer.
