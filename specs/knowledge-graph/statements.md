# Statements

> **[UNREVIEWED]** — Scoped down in the 2026-07-17 review; the provenance claim was demoted and the section rewritten. Still unverified: that adding a third arm to the object union should be treated as a **redesign** rather than an extension. That is the agent's inference, was not in the source document, and is load-bearing if true.

The atomic unit of knowledge. Every quizzable fact is one, and every answer ever logged references one by ID.

## The object slot is a closed union

An object is **either** a reference to another entity **or** a typed literal. Two arms, closed deliberately.

The closure matters more than either arm. It is what lets every consumer — the scheduler, the answer log, the template engine, the distractor generator — exhaustively handle objects with no default case. Adding a third arm is not a feature addition; it is a change that touches every consumer, and it should be treated as a redesign rather than an extension. The pressure to add one will come from something that feels like it is "neither an entity nor a value." That thing is almost certainly a reification.

Literal datatypes (string, quantity, date, boolean) are **engine-level, not pack-level**. A pack cannot invent a datatype. This is the boundary that keeps validation and question generation writable at all — `literal_spread` distractors know what a quantity is, and could not know what an arbitrary pack-defined type is. Adding a datatype is an engine change with a version bump, and that friction is intentional.

## Why statements carry provenance

Every statement records which pack introduced it (`pack_id`) and where that particular fact came from (`source`).

**The reason is that a pack is not homogeneous.** Origin varies *within* a pack — `core-cities` is Wikidata-derived, but any pack may mix generated facts with hand-authored ones, corrections, or a second upstream. Provenance is per-statement because the thing it records is per-statement. A pack-level field could not answer the question at all, and the question is a real one: *where did this particular entity or statement come from?*

This is what makes hand-adding a statement cheap and honest — it goes in next to the generated ones, saying plainly that it is not one of them. That is not hypothetical: [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) *drops* cities its filter cannot state simply, and hand-authoring is the obvious way to patch a hole you dislike.

**The MVP reads it.** The quiz card shows a subtle source line, so provenance is exercised from day one rather than written and trusted. It is also the right thing for a learning app to say: facts have origins, and the app should be willing to name them.

Two reasons this section previously gave, and why they are not the reason:

- **Licensing and attribution** are real, but they are *pack-level*. A licence belongs to a pack; it never explains a field on every row.
- **Pack update and uninstall** are made tractable by provenance — a pack update diffs by statement ID and deprecates rather than deletes; an uninstall deactivates a pack's statements; neither can dangle an answer event. This is a genuine benefit and worth keeping. But it needs only `pack_id`, and it explains nothing about `source`. An earlier version of this file called it "the real reason", displacing the author's; it was an agent's inference, and the MVP has neither update nor uninstall to exercise it. See [../packs/](../packs/).

## Qualifiers, and the shared vocabulary problem

Qualifiers are per-statement metadata, validated against a schema declared by the relation type. Different relations legitimately need different qualifier vocabularies — a border has a length, a capital has a start date.

But a small universal vocabulary is reserved by the engine and allowed on every statement: `start`, `end`, `as_of`, `note`. This exists to solve a coordination problem that would otherwise be unsolvable: **without it, one pack writes `from` and another writes `since`, and no temporal question template can ever span both.** Temporal templates key off `start`/`end` uniformly across all packs, which only works if all packs spell it the same way. The reserved set is small on purpose — it is a coordination floor, not a general-purpose metadata scheme.

## Qualifiers are quizzable, and this was free

Because answer events reference a statement rather than a bare triple, asking "when did Constantinople become Istanbul?" is just quizzing a qualifier of an existing statement. No new fact kind, no new log shape — the answer event records a direction of `qualifier:end` and everything else works unchanged.

This is a good illustration of why the log references statements. Had it referenced subject/relation/object triples, qualifier questions would have needed a parallel logging path.

## The MVP statement carries no rank

`rank` is **not** on the engine's statement type, and **not** in the MVP pack file. Decided in the 2026-07-17 review.

The reason is not that rank is unimportant — [rank-and-time.md](rank-and-time.md) describes real jobs it does. It is that the MVP's pack has resolved every conflict *at generation time*, by filtering to claims that are current and unambiguous and excluding entities that resist — see [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md). Every statement that survives is current, unconflicted, and unretracted. A field with one legal value is not a model; it is a claim about the future that nothing tests. No consumer would filter on it, and the first pack to write `deprecated` would find that nothing respected it.

Nor is it a one-way door. Statement IDs are unstable, so this deserved a hard look — but rank does not need re-extraction from Wikidata. Because filtering already guarantees every statement is current, a later pass can assign rank locally without regenerating the pack, and regeneration is the thing that would orphan answer history. **Filtering removes the need for rank rather than making it precious.**

Rank arrives with the work that needs it: a second pack, a pack update that retracts a claim, or the first temporal facts.

## Identity and stability

Statement IDs must be stable across pack rebuilds, because **answer events reference them and history must survive a pack update.** An ETL re-run that churns IDs orphans a user's entire learning record for that pack — this is the single most destructive failure mode in the data model, and it is silent.

How to achieve that stability is unresolved. See [open-questions.md](open-questions.md).

## Related

- [rank-and-time.md](rank-and-time.md) — how a statement stops being true without being deleted.
- [identity.md](identity.md) — the same problem for entities, where it has a clean answer.
