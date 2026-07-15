# Statements

The atomic unit of knowledge. Every quizzable fact is one, and every answer ever logged references one by ID.

## The object slot is a closed union

An object is **either** a reference to another entity **or** a typed literal. Two arms, closed deliberately.

The closure matters more than either arm. It is what lets every consumer — the scheduler, the answer log, the template engine, the distractor generator — exhaustively handle objects with no default case. Adding a third arm is not a feature addition; it is a change that touches every consumer, and it should be treated as a redesign rather than an extension. The pressure to add one will come from something that feels like it is "neither an entity nor a value." That thing is almost certainly a reification.

Literal datatypes (string, quantity, date, boolean) are **engine-level, not pack-level**. A pack cannot invent a datatype. This is the boundary that keeps validation and question generation writable at all — `literal_spread` distractors know what a quantity is, and could not know what an arbitrary pack-defined type is. Adding a datatype is an engine change with a version bump, and that friction is intentional.

## Why statements carry provenance

Every statement records which pack introduced it and where it originally came from. Two reasons, and the second is the one that matters:

Credit and licensing are the obvious one — packs carry licenses and sources deserve attribution.

The real reason is that **a statement's origin is what makes pack update and uninstall tractable**. When a pack updates, we diff by statement ID and mark removed statements deprecated rather than deleting them; when it uninstalls, its statements deactivate. Both operations need to know which statements belong to whom. Without per-statement provenance, an uninstall would have to re-derive ownership, and answer events pointing at deleted statements would dangle. See [../packs/](../packs/).

## Qualifiers, and the shared vocabulary problem

Qualifiers are per-statement metadata, validated against a schema declared by the relation type. Different relations legitimately need different qualifier vocabularies — a border has a length, a capital has a start date.

But a small universal vocabulary is reserved by the engine and allowed on every statement: `start`, `end`, `as_of`, `note`. This exists to solve a coordination problem that would otherwise be unsolvable: **without it, one pack writes `from` and another writes `since`, and no temporal question template can ever span both.** Temporal templates key off `start`/`end` uniformly across all packs, which only works if all packs spell it the same way. The reserved set is small on purpose — it is a coordination floor, not a general-purpose metadata scheme.

## Qualifiers are quizzable, and this was free

Because answer events reference a statement rather than a bare triple, asking "when did Constantinople become Istanbul?" is just quizzing a qualifier of an existing statement. No new fact kind, no new log shape — the answer event records a direction of `qualifier:end` and everything else works unchanged.

This is a good illustration of why the log references statements. Had it referenced subject/relation/object triples, qualifier questions would have needed a parallel logging path.

## Identity and stability

Statement IDs must be stable across pack rebuilds, because **answer events reference them and history must survive a pack update.** An ETL re-run that churns IDs orphans a user's entire learning record for that pack — this is the single most destructive failure mode in the data model, and it is silent.

How to achieve that stability is unresolved. See [open-questions.md](open-questions.md).

## Related

- [rank-and-time.md](rank-and-time.md) — how a statement stops being true without being deleted.
- [identity.md](identity.md) — the same problem for entities, where it has a clean answer.
