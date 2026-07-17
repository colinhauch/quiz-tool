# Knowledge Graph

The fact model everything else stands on. If you are adding a new kind of content to the app, this is the concept you need first.

## The core bet

**Everything quizzable is a Statement**: a subject, a relation, and an object that is either another entity or a typed literal, plus a bag of qualifiers and provenance.

That uniformity is the whole design. One fact shape means one answer log, one scheduler, and one set of question templates — forever, across every pack we ever ship. A future languages pack's answers aggregate against a two-year-old cities pack's answers for free, because they are the same shape. The alternative — a table per fact kind — makes every new content type a schema migration and a scheduler change, and makes cross-pack insight queries a union of hand-written joins.

The cost we accepted: any single fact is more awkward to read than it would be in a purpose-built table, and some facts need reification (below) to fit at all.

## Three object kinds, and why

**Entities are thin identity records.** They carry identity and display — labels, aliases, descriptions, media — and nothing else.

The rule: **a fact belongs in a statement.** The moment a population lives on the entity, it is a fact the scheduler cannot see and the answer log cannot reference — invisible to the whole learning apparatus. This is what keeps entities from accreting into the "real" data model.

The line is **dates, sources, and disputes**, not quizzability. A thing that can be true during a period, cited, or disagreed with is a fact, and belongs in a statement. A display string does not become a fact by being quizzable — an entity's name is both a field and (with dates) a statement, in different roles. See [identity.md](identity.md).

> An earlier version of this rule read *"anything you could ask a question about lives in a statement, never in an entity field."* Too strong, and agent-written: it makes labels illegal, since a name is an answer. Corrected 2026-07-17.

**Relation types are registered definitions, not strings.** A statement's relation must reference a real registered type. This registry is where qualifier vocabularies, type constraints, and question templates live, and it is the only thing keeping two independently authored packs consistent with each other. Without it, pack A writes `from` where pack B writes `since`, and no template can span both.

**Numbers are literals, never entities.** There is no node for "37,400,000". This is a deliberate closure of the union — the object slot is entity-or-literal and nothing else — and it has a direct consequence for question generation: numeric facts get comparison, range, and order-of-magnitude questions rather than exact recall. See [../questions/](../questions/).

## Sets are queries, never things

"Countries bordering Brazil" is not stored. It falls out of a query over pairwise statements. The same for "cities in Japan," "languages of Peru."

This is the rule most likely to be violated by a well-meaning optimization, because storing a set is always locally faster. The reason not to: a stored set is a fact the answer log cannot reference and the scheduler cannot schedule. It is also a second source of truth that goes stale when a statement is added. If set queries are ever too slow, the fix is an index or a different store — see [../storage/](../storage/) — not a stored set.

## Reification: the escape hatch

When a fact has more than two participants, or when the *relationship itself* needs facts attached to it, promote the relationship to an entity and hang statements off it. A border becomes an entity; its parties, the river that forms it, and its length are all statements about that entity.

The rule of thumb: a binary fact with metadata is a statement with qualifiers — do **not** reify Brazil–Argentina. Three or more participants, or facts about the relationship, reify. Events, memberships-with-roles, and ordered routes are all reifications.

**This is the property that makes the "no schema changes ever" claim credible.** Because the engine treats all entities identically, reification needs zero engine support beyond what already exists. Any fact that doesn't fit the binary model has a home, which is why we can promise future packs won't force a refactor. If you find a fact that fits neither a statement nor a reification, that is a genuine architectural surprise and worth stopping over.

## Geometry stays out of the runtime

Spatial computation happens at import time, in tooling — see [../tooling/](../tooling/). Compute "the Santa Catalinas are northeast of Tucson" once from coordinates, emit it as a plain statement with a direction qualifier, and the app never sees a coordinate or a polygon.

The app deals only in conceptual facts and literal attributes. This keeps a GIS dependency out of the runtime permanently, and it means spatial facts are quizzable and schedulable like any other — which they would not be if they were computed on the fly.

## Deeper

- [statements.md](statements.md) — the atomic unit, the object union, and the reasons behind the field-level choices.
- [identity.md](identity.md) — why Wikidata Q-IDs, and how packs merge when two define the same entity.
- [rank-and-time.md](rank-and-time.md) — how the graph represents change without deleting history.
- [shapes.md](shapes.md) — *reference.* The proposed record shapes and worked examples. Read the above first; this is the sketch, not the argument.
- [open-questions.md](open-questions.md) — statement ID stability, which blocks the import pipeline.
