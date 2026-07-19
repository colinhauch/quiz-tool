# Data Packs

How content gets into the app, and the concept that makes "generic engine" mean something.

## The engine runs the learning loop; packs supply the domain

The split is by *responsibility*, not by data-vs-nothing. The **engine** owns everything about *learning* and knows nothing about geography: it schedules what to ask next, invokes a pack to produce a question, displays it, scores and logs the answer, and tracks what the user knows. The **pack** owns everything about a *domain*: not just the data, but the code to make sense of it.

Concretely, a pack ships:

- **Type definitions and handler code** for its entity types, relation types, and qualifiers — the engine doesn't hard-code how `borders` behaves; the pack does.
- **The data itself** — the entity and statement rows.
- **Question generators** — functions that turn this pack's statements into questions. See [../questions/](../questions/); this is the big move away from an engine-owned template registry.

The only domain vocabulary the engine fixes is **literals** — the datatypes (`string`, `quantity`, `date`, `dateRange`, `boolean`) that its own generic machinery has to reason about (comparison logic, numeric distractors). Everything else about a domain lives in the pack. See [../knowledge-graph/statements.md](../knowledge-graph/statements.md) for why that line falls exactly there.

The payoff is the project's central claim. Adding languages, currencies, borders, rivers, or religions later means writing a pack — not changing the engine, not breaking historical answer logs, not rearchitecting. The MVP ships one pack of world cities; everything after is content-plus-code, packaged together.

**Why this reversed an earlier design.** An earlier draft made the engine own structure (entities, relations, qualifiers, *templates*) and packs own only semantics and data — templates were declarative data, question generation lived in the engine. That breaks the moment a relation needs question logic the engine can't express generically, and it forces a fixed qualifier vocabulary the engine has to anticipate. Since we own all packs anyway (below), there's no reason to keep domain logic out of them. Pushing handlers and generators into the pack means the engine never has to predict what a future domain needs — the pack brings its own understanding.

## Packs are first-party, and topic-scoped

**We author and own every pack; they live in this repo.** A pack is not a third-party plugin — it is a way of chunking an effectively infinite graph of entities and relationships into something manageable, organized by topic. "The 100 most populated cities, their countries, and their populations" is a pack. It is small, simple data plus the modest code to quiz it.

This changes the trust story completely. Because pack code is *our* code, shipping executable handlers and generators in a pack is not a security boundary to defend — it is just code organization. Validation still earns its keep (below), but as a correctness aid, not a sandbox.

The MVP pack is deliberately simple data; the *capability* for richer per-pack handling exists for topics that need it later, but nothing about MVP requires it.

## A pack is any subset of content, plus its code

Manifest, plus any combination of entity types, relation types, entities, statements, assets — and the handler/generator code for whatever domain concepts it introduces. The content pieces are all optional.

This composability matters more than it sounds. A `borders` pack that adds only statements over countries a `core-countries` pack already defined ships **no entity file at all** — it depends on the other pack and asserts new facts about its entities. Content layers over shared identity instead of duplicating it, which is what makes packs feel like a graph extension rather than a bundle. Wikidata Q-IDs are what make it possible — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md).

## Validate at build time, trust at runtime

Packs are validated when built and again when installed, and **the runtime engine never defensively parses** — no optional chaining through pack data, no "what if the relation isn't registered" branches downstream.

This is a deliberate trade: the paranoia is concentrated at one boundary so the runtime can be written as if the data is correct. It's a correctness discipline, not a security perimeter — packs are first-party, so validation is there to catch our own mistakes early, where they're cheap, rather than deep in a quiz session. If you find yourself adding a defensive check in the engine, the check usually belongs in the validator instead.

Validation covers the things that would otherwise fail deep in the runtime: relations are registered, subject and object types satisfy the relation's domain and range, literals match the declared datatype, qualifiers validate against the relation's schema, entity references resolve, assets exist, and relation-type IDs don't collide with installed packs.

## Relation-type IDs are global, and redefinition is an error

A pack may define new relation types or reference ones from packs it depends on. What it may not do is redefine an existing ID.

If two packs could each define `borders` with different qualifier schemas, then a statement's meaning would depend on which pack you asked — and the registry's entire purpose is that a relation means one thing everywhere. A pack extends the graph by defining *new* relations (with their own generators), never by redefining someone else's.

## Updates preserve history

A pack update diffs by statement ID: new statements insert, changed statements update in place, and **removed statements become deprecated rather than deleted** — because answer events reference them and history must stay resolvable. Uninstall deactivates rather than destroys, for the same reason.

This is the same constraint that shapes rank in the graph — see [../knowledge-graph/rank-and-time.md](../knowledge-graph/rank-and-time.md). It shows up here as a lifecycle rule, and it is why per-statement provenance exists at all.

The whole update story rests on statement IDs being stable across rebuilds, which is unresolved — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).

## Assets and capability matching

Packs may bundle assets; the engine treats them opaquely. A generator that needs an asset — an image-based question requiring the subject to have an image — simply produces nothing when the statement lacks it, so a pack without pictures never yields image questions.

This is the general answer to "what if most packs don't have pictures," and it generalizes past images to any future asset kind: the generator checks for what it needs and declines gracefully, never special-casing. A missing capability is not an error; that question just isn't generated.

## Deeper

- [format.md](format.md) — *reference.* The manifest, file layout, validation checklist, and lifecycle mechanics. More durable than most reference material here, because the format is a contract with external pack authors and ETL rather than something app code will fully express.
- [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) — how the MVP's one `core-cities` pack is actually produced, and why that isn't the import tooling the roadmap defers.
