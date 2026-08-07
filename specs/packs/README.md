# Data Packs

How content gets into the app, and the concept that makes "generic engine" mean something.

## The engine runs the learning loop; packs supply the domain

The split is by *responsibility*, not by data-vs-nothing. The **engine** owns everything about *learning* and knows nothing about geography: it schedules what to ask next, invokes a pack to produce a question, displays it, scores and logs the answer, and tracks what the user knows. The **pack** owns everything about a *domain*: not just the data, but the code to make sense of it.

Concretely, a pack ships:

- **The relations it defines**, declared in its manifest — their labels, which slots they can be quizzed on, and which question kind they use.
- **The data itself** — the entity and statement rows.
- **Question generators** — functions that turn this pack's statements into question content. See [../questions/](../questions/); this is the big move away from an engine-owned template registry.

Two things the engine keeps, because they are about learning rather than about geography. **Literals** — the datatypes (`string`, `quantity`, `date`, `dateRange`, `boolean`) its generic machinery has to reason about. And **question kinds** — the forms a question can take and therefore how its answer is judged. See [../knowledge-graph/statements.md](../knowledge-graph/statements.md) for why the literal line falls exactly there, and the next section for the question-kind line.

**Why this reversed an earlier design.** An earlier draft made the engine own structure (entities, relations, qualifiers, *templates*) and packs own only semantics and data — templates were declarative data, question generation lived in the engine. That breaks the moment a relation needs question logic the engine can't express generically, and it forces a fixed qualifier vocabulary the engine has to anticipate. Since we own all packs anyway (below), there's no reason to keep domain logic out of them. Pushing generators into the pack means the engine never has to predict what a future domain needs — the pack brings its own understanding.

## A pack owns phrasing; the engine owns judging

> **[UNREVIEWED]** — new section recording the decision in [ADR-0002](../../docs/adr/0002-the-engine-owns-question-kinds.md). Confirm the domain/kind distinction is the line you want, and that pack-owned grading is genuinely rejected rather than deferred.

The engine defines a **closed set of question kinds** — typed text today, multiple choice next, numeric and date later — and owns the grading for each. A pack declares which kind a relation is quizzed with and supplies the content; it does not decide whether an answer is right.

This corrects a claim this spec used to make. It said adding currencies, borders, or rivers meant writing a pack and never changing the engine. That conflated **a new domain** with **a new question kind**, and it was already false for the second: rendered content was hard-wired to typed text, and grading resolved the hidden slot to an entity and string-matched its labels — so any relation with a literal object was unquizzable no matter how good its pack was. Multiple choice sat in `TODO.md` as "really easy for the continents pack" when no pack could express it at all.

The honest version of the claim: **a new domain is a pack and nothing else; a new question kind is one engine change that every pack then benefits from.**

Grading stays central for two reasons. Answer normalisation — diacritic folding, punctuation, whitespace — is a shared concern that would be reimplemented per pack and drift apart. And pack-owned grading would make the answer log's meaning depend on pack version, since a pack update could silently change how past answers would have been judged. History has to stay interpretable; see [../storage/](../storage/).

## Packs are first-party, and topic-scoped

**We author and own every pack; they live in this repo.** A pack is not a third-party plugin — it is a way of chunking an effectively infinite graph of entities and relationships into something manageable, organized by topic. "The 100 most populated cities, their countries, and their populations" is a pack. It is small, simple data plus the modest code to quiz it.

This changes the trust story completely. Because pack code is *our* code, shipping executable generators in a pack is not a security boundary to defend — it is just code organization. Validation still earns its keep (below), but as a correctness aid, not a sandbox.

**Outside contributors are not the goal, and understanding why matters.** Packs were shaped partly by an aspiration that other people might contribute them, which pulled toward a plugin architecture — sandboxing, a registry, declarative-only content. That aspiration was examined and set aside: the real driver is *our own* authoring cost. Every decision here follows from that. If third-party packs ever become a goal, the trust boundary is the thing that changes, and most of the rest survives.

## A pack is any subset of content, plus its code

Manifest, plus any combination of entities, statements, assets — and the generator code for whatever relations it introduces. The content pieces are all optional.

This composability matters more than it sounds. A `borders` pack that adds only statements over countries a `core-geo` pack already defined ships **no entity file at all** — it asserts new facts about another pack's entities. Content layers over shared identity instead of duplicating it, which is what makes packs feel like a graph extension rather than a bundle. Wikidata Q-IDs are what make it possible — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md).

## Packs are discovered, not compiled in

> **[UNREVIEWED]** — rewritten for the discovery shift ([ADR-0001](../../docs/adr/0001-packs-are-discovered-not-compiled-in.md)), replacing the earlier account of hand-wired packs. Confirm the framing, and that keeping packs in-repo (rather than loadable from anywhere) is the intended stopping point.

The server **scans `packs/*` at boot** and loads whatever it finds. A pack is a directory: a manifest, some `.jsonl`, and an optional `index.ts`. There is no per-pack workspace package, no dependency the server declares, and no list of packs anywhere in the source.

This replaced an arrangement where each pack was a workspace package that the server depended on and named in a hard-coded array — five build-file edits before a single fact was read. `packs/` is now one workspace package rather than one per pack, which keeps generator code inside `tsc -b` and keeps `@geo/engine` resolvable, while costing nothing per pack.

**Packs still live in this repo and ship with the app.** Loading them from a configurable directory outside the tree was considered and deliberately not taken; it settles the open question in [../deployment/](../deployment/) in favour of bundled packs.

**Loading is asynchronous, and that is inherent.** A discovered pack is not known at compile time, so its generator module has to be imported dynamically — there is nothing to `import` statically. `loadAllPacks()` therefore returns a promise, and the server awaits it at boot. This is the one thing discovery cost that the hand-wired arrangement did not: static imports were synchronous. It buys back far more than it costs, but it does mean any future consumer of the loader is async too.

**Discovery made the missing registry more urgent, not less — and proved it in the same commit.** Generators are still merged last-write-wins, and load order is now alphabetical rather than hand-written. That silently *inverted* the #38 collision: under the old hard-coded array `continental-countries` loaded last and every city question read "What continent is Tokyo in?"; under directory-name order `core-cities` loads last and every continent question reads "What country is Afghanistan in?". Same defect, opposite direction, no code change — which is precisely the argument that ordering must never be load-bearing, and that the relation registry ([#23](https://github.com/colinhauch/quiz-tool/issues/23)) is the fix rather than a careful choice of order.

**A pack is an authoring and versioning unit, not a runtime-selectable one.** Everything discovered is loaded, always. There is no active-set, no `GEO_PACKS`, no install/uninstall lifecycle, and no dependency resolution — entity single-ownership means load order cannot change the result. Filtering *what gets quizzed* by topic is a query over the assembled graph, not a boundary the loader enforces. An earlier draft (`82fa5fc`) modelled packs as a selectable runtime set with a cross-pack entity union; that machinery was stripped.

## Discovered packs assemble into one graph

Assembly is cheap because a loaded pack is a small thing — entities, statements, relations, generators. Statements concatenate; each pack's relations combine into one registry; selection then draws uniformly across every quizzable card, so packs **interweave** — the payoff the whole design is for. A question's origin travels with it as a pack id and label taken from the manifest.

**Entities are the exception: they are not unioned.** Exactly one pack owns each entity, so a Q-ID appearing in two packs is an authoring error and assembly fails rather than reconciling — the single-ownership rule in [../knowledge-graph/identity.md](../knowledge-graph/identity.md). This is what killed the old cross-pack merge: because one pack owns identity, there is nothing to merge.

That single owner is `core-geo` — a frozen, entities-only pack shipping every shared geographic entity (continents, countries, capitals, core cities) and no statements. Every other pack ships **no entity file at all** and asserts statements over `core-geo`'s entities, so no country is ever re-authored by a second pack. How `core-geo` is produced — a re-runnable, deterministic fetch over a curated Q-ID list — is in [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md).

The merged whole is the **graph**; a **pack** is always one authored unit. These were both called "pack" in the code for a while, and the engine's API took the merged sense while every sentence in this spec meant the other — which is a fair part of why the runtime role of a pack was hard to pin down. See [CONTEXT.md](../../CONTEXT.md).

## Relation IDs are global, and redefinition is an error

A pack may define new relations or assert statements using relations another pack defined. What it may not do is redefine an existing ID.

If two packs could each define `borders` with different meanings, a statement's meaning would depend on which pack you asked — and the registry's entire purpose is that a relation means one thing everywhere. A pack extends the graph by defining *new* relations, never by redefining someone else's.

**This rule was documented long before anything enforced it, and it cost us.** Generators were merged with `Object.assign`: last write won, silently. `continental-countries` and `core-cities` both defined `located_in`, and every city question rendered as a continent question until it was tracked down. The fix at the time was to rename one relation; the fix now is that **a pack declares its relations in its manifest and the loader throws** on a redefined or an undeclared one.

Discovery is what made enforcement non-negotiable. Hand-wiring at least meant a new pack arrived in a diff someone read; a scanned directory has no such review step, so an unenforced rule would have been strictly more dangerous than the wiring it replaced.

## Validate at load, trust thereafter

Packs are validated when they are loaded, and **the runtime engine never defensively parses** — no optional chaining through pack data, no "what if the relation isn't registered" branches downstream.

This is a deliberate trade: the paranoia is concentrated at one boundary so the runtime can be written as if the data is correct. It's a correctness discipline, not a security perimeter — packs are first-party, so validation catches our own mistakes early, where they're cheap, rather than deep in a quiz session. If you find yourself adding a defensive check in the engine, the check usually belongs in the validator instead.

**This used to say "validate at build time."** That stopped being possible when packs became discovered directories: there is no build step for a pack any more, so load is the only moment anything can be checked. The same validator runs from `pnpm packs:validate`, so a pack can be checked while authoring and in CI without starting the server.

**Loading fails hard.** A malformed manifest, a redefined relation, a statement whose relation is undeclared, or a reference to a missing entity stops the server with the pack named. Skipping the bad pack and warning was rejected: a warning in a scrollback is precisely how a pack quietly stops being quizzed and nobody notices.

What the validator covers today is deliberately narrow — manifest shape, relation declaration and collision, entity references resolving, entity single-ownership. The richer checks the original design imagined (subject and object types satisfying a relation's domain and range, qualifier schemas, literal datatypes) need a type system for relations that does not exist yet, and adding the declaration before the checker reads it is how `contents` and `depends` became fiction. Registry first, then declaration.

## Which pack a question came from

A question carries its **pack id and human label**, resolved from the manifest at load. The web UI shows the label as the quiz card's eyebrow.

This replaced a stopgap where the frontend parsed the `cardId` prefix (`cc:tokyo-japan:object`) against a hard-coded code→name map — fragile, and it coupled the UI to the cardId format.

The answer log stores no pack id. It already records the statement, and a statement belongs to exactly one pack, so provenance stays derivable at read time — the same way the question text is derived rather than stored. See [../storage/](../storage/).

## Updates preserve history

A pack update diffs by statement ID: new statements insert, changed statements update in place, and **removed statements become deprecated rather than deleted** — because answer events reference them and history must stay resolvable.

This is the same constraint that shapes rank in the graph — see [../knowledge-graph/rank-and-time.md](../knowledge-graph/rank-and-time.md). It shows up here as a lifecycle rule, and it is why per-statement provenance exists at all.

**None of this is built.** The manifest keeps a `version` field that nothing reads. The whole update story also rests on statement IDs being stable across rebuilds — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).

## Assets and capability matching

Packs may bundle assets; the engine treats them opaquely. A generator that needs an asset — an image-based question requiring the subject to have an image — simply produces nothing when the statement lacks it, so a pack without pictures never yields image questions.

This is the general answer to "what if most packs don't have pictures," and it generalizes past images to any future asset kind: the generator checks for what it needs and declines gracefully, never special-casing. A missing capability is not an error; that question just isn't generated.

## Deeper

- [format.md](format.md) — *reference.* The manifest and file layout.
- [../tooling/mvp-bootstrap.md](../tooling/mvp-bootstrap.md) — how `core-geo` is actually produced, and why that isn't the import tooling the roadmap defers.
- [ADR-0001](../../docs/adr/0001-packs-are-discovered-not-compiled-in.md) — packs are discovered by scanning, not compiled in.
- [ADR-0002](../../docs/adr/0002-the-engine-owns-question-kinds.md) — the engine owns question kinds.
