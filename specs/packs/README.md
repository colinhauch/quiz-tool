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

A "pack" is an **authoring and versioning unit, not a *load-time*-selectable one**: everything authored is loaded into a single graph, always on. There is no active-set, no `GEO_PACKS`, no dependency resolution, no install/uninstall lifecycle. Filtering *what gets quizzed* is a query over the one assembled graph, not a boundary this loader enforces. This reframe is recorded in [[pack-as-authoring-tranche]].

That is a statement about the *loader*, not about the learner. A pack **is** learner-selectable, as a filter applied when drawing a question — see "The learner selects packs" below. The distinction the reframe actually buys is load-time versus draw-time: deselecting a pack never unloads it, it only makes its statements ineligible to be asked.

Assembly is cheap because a loaded tranche is three fields — entities, statements, generators. Statements concatenate; each tranche's per-relation generators combine into one table keyed by relation; selection then draws uniformly across every quizzable statement, so tranches **interweave** — the payoff the whole design is for.

**A statement's origin is stamped by the loader, not parsed out of its ID.** An earlier draft of this file claimed provenance survived in the statement-ID prefix (`cc:`, `cap:`) that the cardId carries. That was never true in practice: `core-cities` and `continental-countries` both prefix `cc:`, so the web UI's prefix-parsing eyebrow label renders every continent question as "Cities & Countries". Prefixes are an authoring convention with nothing enforcing uniqueness, and renaming them would rewrite statement IDs the answer log references. So the loader — which already knows which tranche it is reading — tags each statement with its pack id as it loads, and that stamp is the single source of provenance.

**Entities are the exception: they are not unioned.** Exactly one tranche owns each entity, so a Q-ID appearing in two tranches is an authoring error and the assembler throws rather than reconciling — the single-ownership rule in [../knowledge-graph/identity.md](../knowledge-graph/identity.md). This is what killed the old cross-pack merge: because one tranche owns identity, there is nothing to merge.

That single owner is `core-geo` — a frozen, entities-only tranche shipping every shared geographic entity (continents, countries, capitals, core cities) and no statements. Every other tranche (`core-cities`, and later `capital-cities`, `continental-countries`) ships **no entity file at all** and asserts statements over `core-geo`'s entities. This is the composability story above, now built: content layers over shared identity instead of duplicating it, so no country is ever re-authored by a second tranche. How `core-geo` is produced — a re-runnable, deterministic fetch over a curated Q-ID list — is in [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md).

## A pack is an authoring unit, and it is loaded unconditionally

> **[UNREVIEWED]** — reframe landed with #26; check it against the composability and update-lifecycle sections below, which still describe packs as installable/depended-upon units.

A pack is an **authoring + versioning tranche**: how we chunk and version the content while writing it. It is *not* a unit the runtime installs, activates, or resolves dependencies for. Everything authored is loaded into **one graph, always** — the loader concatenates every tranche's statements and merges every tranche's generators into a single relation→generator table, with entities coming from the one tranche that owns them (others may ship statements only). See the loader at `packages/server/src/pack-loader.ts`.

This reverses an earlier draft (`82fa5fc`) that modelled packs as a *selectable runtime set* — `GEO_PACKS`, an active-set, a cross-pack entity union. That machinery was stripped: there is no active-set selection and no dependency resolution at load time.

**Per-topic filtering of what gets quizzed is a query over the assembled graph, not a loader-level pack boundary.** When we want "only capitals right now," that is a filter applied when selecting a statement to ask — not a decision about which tranches to load.

## The learner selects packs

> **[UNREVIEWED]** — decided in a design session against ticket #20, ahead of implementation. Nothing below is built yet. The one deliberately unresolved piece (where the filter is applied) is called out at the end.

The learner picks a set of packs, and **every question they are asked comes from that set**. Selection is a *hard eligibility constraint*, not a weighting hint — a deselected pack is never drawn from, however clever the scheduler later becomes. This is what #20 asks for, and it is compatible with the reframe above precisely because it is a draw-time filter: the deselected pack stays loaded in the graph, resolvable, just ineligible.

Only packs that ship statements are selectable. `core-geo` is entities-only and yields no questions, so it can never appear in a picker — "the selectable set" is *packs that yield questions*, not *packs*.

**The selection is server-side persisted state.** A singleton preference (there is no user concept in this system, and inventing one to hold a checkbox would be backwards), stored beside the answer log, with contract endpoints to enumerate the selectable packs and read/write the selection. The alternative — a client-owned selection sent as a query parameter on each draw — keeps the server stateless and was the cheaper build, but loses the selection whenever the learner changes browser, and the preference is exactly the kind of thing a learner expects to persist.

**First run selects everything; the empty set is refused.** Defaulting to all preserves today's behaviour, so introducing the picker regresses nothing. Empty is rejected at both the picker and the contract boundary, which is what keeps `selectQuestion`'s "no quizzable statements in pack" throw unreachable — the alternative, treating empty as "unfiltered", would have made the UI tell the learner a lie.

**Selection never touches the answer log.** It filters what will be asked, and nothing else: history is never hidden, filtered, or rewritten when a pack is deselected, and `/answers` keeps resolving recorded cards against the *full* graph. This is why deselection must not unload anything — a card recorded from a now-deselected pack still has to resolve. Whether the log should additionally store the pack per answer is deferred; it is derivable from the stamped statement today.

**Where the filter is applied is open**, and it is the reason #20 is blocked. The candidates — widening the engine's `selectQuestion` signature, pre-filtering a narrowed `Pack` in the server, or pushing it into card enumeration — differ mainly in how they survive the scheduler, which does not exist yet. Choosing now would be choosing on the wrong criteria. Two constraints hold whatever wins: card *resolution* must keep seeing the full graph even when *selection* does not, and pack filtering does not address question mix. As of this writing `continental-countries` ships 193 statements against `core-cities`' 6, so a uniform draw is ~97% continent questions *within any selection that includes both*. That is a scheduler-weighting problem, and filtering by pack will not fix it.

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

## Which pack a question came from

> **[UNREVIEWED]** — design decided against ticket #20; the implementation is filed as a bug and not yet built.

Once packs interweave (the whole point — "lots of packs with their questions interwoven"), a learner looking at a question should be able to tell **which pack it came from**. The UI wants a human label for this, shown as the quiz card's eyebrow.

Today `QuestionResponse` is `{ cardId, prompt, input }` — no pack identity. The web UI therefore parses the `cardId` prefix to a display name as a stopgap (`packLabel` in `packages/web/src/Quiz.tsx`), which is fragile in principle and **wrong in fact**: two packs share the `cc:` prefix, so every continent question is currently labelled "Cities & Countries".

The fix runs the length of the pipeline, and each step is also a prerequisite for selection: the loader stamps each statement with its pack id; `QuestionResponse` carries the pack id and human label; the UI drops its hard-coded map and renders what it is given. Provenance is resolved by the server, which knows, rather than inferred by the UI from a string, which guesses.

**The label comes from `pack.json`**, which this makes a live artifact for the first time. A pack's `index.ts` imports its own manifest and re-exports it alongside `packDir` and `generators` — the manifest stays the single source of truth and becomes statically typed, with no runtime parse and so no malformed-manifest failure path for the loader to invent a policy for. The rest of the manifest (`depends`, `engine_min_version`, `license`) stays decorative until a validator exists to enforce it: per the section above, the honest ordering is registry-then-enforcement, and pretending otherwise would make `pack.json` read as wired when it is not.

Still open: whether the answer-log entry should also record the pack. It is derivable from the stamped statement today, mirroring how `question` is derived from `cardId` at read time — see [../storage/](../storage/).

## Deeper

- [format.md](format.md) — *reference.* The manifest, file layout, validation checklist, and lifecycle mechanics. More durable than most reference material here, because the format is a contract with external pack authors and ETL rather than something app code will fully express.
- [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) — how the MVP's one `core-cities` pack is actually produced, and why that isn't the import tooling the roadmap defers.
