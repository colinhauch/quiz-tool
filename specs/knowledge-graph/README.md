# Knowledge Graph

The fact model everything else stands on. If you are adding a new kind of content to the app, this is the concept you need first.

## The core bet

Most of what we know comes from **Wikidata**, and the design leans into that: keep each entity small, and push the interesting relationships out into **Statements** — a subject, a relation, and an object that is either another entity or a typed literal, plus a bag of qualifiers and provenance. A datapack is, essentially, a list of statements.

The reason to prefer statements is that **a statement is the thing the quiz engine knows how to consume.** A relationship stored as a statement is quizzable, schedulable, and loggable; the same relationship buried in an entity field is none of those. So the more of the graph that lives in statements, the more of it the learning apparatus can actually reach.

The payoff of one uniform fact shape is that everything downstream is written once: one answer log, one scheduler, one way of turning statements into questions, across every pack. A future languages pack's answers aggregate against a two-year-old cities pack's answers for free, because they are the same shape. The alternative — a table per fact kind — turns every new content type into a schema migration and a scheduler change, and turns cross-pack insight queries into hand-written joins.

The cost: any single fact is more awkward to read than it would be in a purpose-built table.

## Three object kinds, and why

**Entities are kept thin.** Their job is identity and display — labels, aliases, descriptions, media. They *can* hold more, but the strong default is that anything you might ask a question about belongs in a statement rather than an entity field. The reason is worth internalizing: the moment a population lives on the entity, it is a fact the scheduler cannot see and the answer log cannot reference — invisible to the whole learning apparatus. Keeping entities thin is what stops them from quietly becoming the "real" data model while the statements starve.

**Relation types are registered definitions, not strings.** A statement's relation must reference a real registered type. A relation type is a pack artifact: it carries the relation's qualifier vocabulary, its type constraints, and the handler and question-generator code for facts that use it. Registration is what keeps the graph coherent — a relation means one thing everywhere it appears, and its behavior travels with its definition rather than being re-guessed by the engine.

**Numbers are literals, never entities.** There is no node for "37,400,000". This is a deliberate closure of the union — the object slot is entity-or-literal and nothing else — and it has a direct consequence for question generation: numeric facts get comparison, range, and order-of-magnitude questions rather than exact recall. See [../questions/](../questions/).

## Sets fall out of queries

"Countries bordering Brazil" isn't stored as a thing — it falls out of a query over pairwise statements. Same for "cities in Japan," "languages of Peru." Synthesizing questions from statements *is the engine's job*, so **a live query is the baseline**, and it's the right mental model to start from: the statements are the source of truth, and sets are views over them.

Why not just store the set? Because a stored set is a second source of truth. It's a fact the answer log can't reference and the scheduler can't schedule, and it goes stale the moment a statement is added. That's the cost you take on the day you materialize something.

None of which rules materialization *out*. Once a pack has decided what questions it asks, those questions' answers could be computed from the statements and cached — and rebuilt from the statements when they drift. This is a real optimization and an open one: keeping a derived projection honest against a changing graph is conceptually hard, and we haven't committed to a design for it. The line that matters isn't "never cache" — it's **statements stay the source of truth; anything materialized is derived and rebuildable, never a competing authority.**

## Deeper

- [statements.md](statements.md) — the atomic unit, the object union, and the reasons behind the field-level choices.
- [identity.md](identity.md) — why Wikidata Q-IDs, and how packs merge when two define the same entity.
- [rank-and-time.md](rank-and-time.md) — how the graph represents change without deleting history.
- [shapes.md](shapes.md) — *reference.* The proposed record shapes and worked examples. Read the above first; this is the sketch, not the argument.
- [open-questions.md](open-questions.md) — statement ID stability, which blocks the import pipeline.
