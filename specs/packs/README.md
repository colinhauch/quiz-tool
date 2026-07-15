# Data Packs

How content gets into the app, and the concept that makes "generic engine" mean something.

## The engine knows structure, packs know semantics

The engine understands entities, relation types, statements, qualifiers, and templates. **It has no idea what a "city" is.** It cannot, and this is enforced by construction rather than convention: entity types, relation types, and statements all arrive from packs, so there is nowhere for the engine to hard-code a domain concept even if someone wanted to.

The payoff is the project's central claim. Adding languages, currencies, borders, rivers, or religions later means shipping a pack — not changing a schema, not breaking historical answer logs, not rearchitecting. The MVP ships one pack of world cities; everything after is content.

The cost is that domain knowledge is data, so domain mistakes are data errors rather than compile errors. Validation at pack build/install time is the compensating control.

## A pack is any subset

Manifest, plus any combination of entity types, relation types, entities, statements, and assets. All optional.

This matters more than it sounds. A `borders` pack that adds only statements over countries that a `core-countries` pack already defined ships **no entity file at all** — it depends on the other pack and asserts new facts about its entities. That composability is what makes packs feel like a graph extension rather than a bundle: content layers over shared identity instead of duplicating it. Wikidata Q-IDs are what make it possible — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md).

## Validate at build time, trust at runtime

Packs are validated when built and again when installed. **The runtime engine never defensively parses.** No optional chaining through pack data, no "what if the relation isn't registered" branches in the question generator.

This is a deliberate trade: all the paranoia is concentrated at one boundary so the entire runtime downstream can be written as if the data is correct. The rule to preserve is that runtime code assumes valid data; if you find yourself adding a defensive check in the engine, the check belongs in the validator instead.

Validation covers the things that would otherwise fail deep in the runtime: relations are registered, subject and object types satisfy the relation's domain and range, literals match the declared datatype, qualifiers validate against the relation's schema, entity references resolve, assets exist, and relation-type IDs don't collide with installed packs.

## Relation-type IDs are global, and redefinition is an error

A pack may define new relation types or reference ones from packs it depends on. What it may not do is redefine an existing ID.

If two packs could each define `borders` with different qualifier schemas, then a statement's meaning would depend on which pack you asked — and the registry's entire purpose is that a relation means one thing everywhere. Extension happens by adding templates, which are additive and safe.

## Updates preserve history

A pack update diffs by statement ID: new statements insert, changed statements update in place, and **removed statements become deprecated rather than deleted** — because answer events reference them and history must stay resolvable. Uninstall deactivates rather than destroys, for the same reason.

This is the same constraint that shapes rank in the graph — see [../knowledge-graph/rank-and-time.md](../knowledge-graph/rank-and-time.md). It shows up here as a lifecycle rule, and it is why per-statement provenance exists at all.

The whole update story rests on statement IDs being stable across rebuilds, which is unresolved — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).

## Assets and capability matching

Packs may bundle assets; the engine treats them opaquely. Templates **declare the capabilities they need** — an image-based template requires the subject to have an image — and packs lacking those capabilities simply never trigger those templates.

This is the general answer to "what if most packs don't have pictures," and it generalizes past images to any future asset kind: capability matching, never special-casing. A template that needs something a pack doesn't have is not an error; it is just not eligible.
