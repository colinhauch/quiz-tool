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

## Authored tranches assemble into one graph

> **[UNREVIEWED]** — rewritten from the old "active packs merge / union by Q-ID" model to single-ownership assembly (ticket #28), to match the merged loader (`assembleGraph` throws on a doubly-owned Q-ID) and the [[pack-as-authoring-tranche]] reframe. Confirm this framing — and that dropping the active-set/`GEO_PACKS` selection story loses nothing worth keeping.

A "pack" is an **authoring and versioning unit, not a runtime-selectable one**: everything authored is loaded into a single graph, always on. There is no active-set, no `GEO_PACKS`, no dependency resolution, no install/uninstall lifecycle. Filtering *what gets quizzed* by topic is a future query over the one assembled graph — a UI nicety — not a boundary this loader enforces. This reframe is recorded in [[pack-as-authoring-tranche]].

Assembly is cheap because a loaded tranche is three fields — entities, statements, generators. Statements concatenate; each tranche's per-relation generators combine into one table keyed by relation; selection then draws uniformly across every quizzable statement, so tranches **interweave** — the payoff the whole design is for. A question's origin survives in its statement-ID prefix (`cc:`, `cap:`), which the cardId already carries; nothing else has to track provenance.

**Entities are the exception: they are not unioned.** Exactly one tranche owns each entity, so a Q-ID appearing in two tranches is an authoring error and the assembler throws rather than reconciling — the single-ownership rule in [../knowledge-graph/identity.md](../knowledge-graph/identity.md). This is what killed the old cross-pack merge: because one tranche owns identity, there is nothing to merge.

That single owner is `core-geo` — a frozen, entities-only tranche shipping every shared geographic entity (continents, countries, capitals, core cities) and no statements. Every other tranche (`core-cities`, and later `capital-cities`, `continental-countries`) ships **no entity file at all** and asserts statements over `core-geo`'s entities. This is the composability story above, now built: content layers over shared identity instead of duplicating it, so no country is ever re-authored by a second tranche. How `core-geo` is produced — a re-runnable, deterministic fetch over a curated Q-ID list — is in [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md).

## A pack is an authoring unit, not a runtime-selectable one

> **[UNREVIEWED]** — reframe landed with #26; check it against the composability and update-lifecycle sections below, which still describe packs as installable/depended-upon units.

A pack is an **authoring + versioning tranche**: how we chunk and version the content while writing it. It is *not* a unit the runtime installs, activates, or resolves dependencies for. Everything authored is loaded into **one graph, always** — the loader concatenates every tranche's statements and merges every tranche's generators into a single relation→generator table, with entities coming from the one tranche that owns them (others may ship statements only). See the loader at `packages/server/src/pack-loader.ts`.

This reverses an earlier draft (`82fa5fc`) that modelled packs as a *selectable runtime set* — `GEO_PACKS`, an active-set, a cross-pack entity union. That machinery was stripped: there is no active-set selection and no dependency resolution at load time.

**Per-topic filtering of what gets quizzed is a future query over the assembled graph, not a loader-level pack boundary.** When we want "only capitals right now," that is a filter applied when selecting a statement to ask — not a decision about which tranches to load.

## Validate at build time, trust at runtime

Packs are validated when built and again when installed, and **the runtime engine never defensively parses** — no optional chaining through pack data, no "what if the relation isn't registered" branches downstream.

This is a deliberate trade: the paranoia is concentrated at one boundary so the runtime can be written as if the data is correct. It's a correctness discipline, not a security perimeter — packs are first-party, so validation is there to catch our own mistakes early, where they're cheap, rather than deep in a quiz session. If you find yourself adding a defensive check in the engine, the check usually belongs in the validator instead.

Validation covers the things that would otherwise fail deep in the runtime: relations are registered, subject and object types satisfy the relation's domain and range, literals match the declared datatype, qualifiers validate against the relation's schema, entity references resolve, assets exist, and relation-type IDs don't collide with installed packs.

**None of this validator exists yet, and neither does the relation registry it checks against.** A relation is "real" today only because a generator is registered for it in the pack's code — there is no `relation_types.json` reader, no `domain`/`range`/`cardinality`/`qualifier_schema` enforcement. Both shipped packs (`core-cities`, `capitals`) therefore omit `relation_types.json` and declare their relations purely through generators; adding a declaration file now would be a document nothing reads, which reads as wired when it isn't. When the registry and validator get built, both packs get their `relation_types.json` together — the honest ordering is registry-then-declaration, not the reverse.

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

## Which pack a question came from isn't in the contract yet

> **[UNREVIEWED]** — captured from a UI need, not yet designed. Check whether pack provenance belongs on `QuestionResponse`, the answer-log entry, or both, and how it relates to per-statement provenance.

Once packs interweave (the whole point — "lots of packs with their questions interwoven"), a user looking at a question should be able to tell **which pack it came from**. The UI wants a human label for this (shown as the quiz card's eyebrow).

Today `QuestionResponse` is `{ cardId, prompt, input }` — no pack identity. The `cardId` prefix (`cc:tokyo-japan:object`) *does* encode the pack code, so the web UI currently parses that prefix to a display name as a **stopgap** (`packLabel` in `packages/web/src/Quiz.tsx`). That's fragile: it couples the UI to the cardId format and hard-codes the code→name mapping in the frontend.

The proper fix is for a question to carry its **pack id + human label** (and likely pack **version**) from the pack manifest, so the engine — not the UI — resolves provenance. Open: whether the answer-log entry should also record the pack (it already keeps per-statement provenance; the pack label may be derivable rather than stored, mirroring how `question` is derived from `cardId` at read time — see [../storage/](../storage/)).

## Deeper

- [format.md](format.md) — *reference.* The manifest, file layout, validation checklist, and lifecycle mechanics. More durable than most reference material here, because the format is a contract with external pack authors and ETL rather than something app code will fully express.
- [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) — how the MVP's one `core-cities` pack is actually produced, and why that isn't the import tooling the roadmap defers.
