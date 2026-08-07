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

**Discovery made the missing registry more urgent, not less — and proved it on the way in.** Before the registry landed, generators were merged last-write-wins and load order went from hand-written to alphabetical. That silently *inverted* the #38 collision: under the old hard-coded array `continental-countries` loaded last and every city question read "What continent is Tokyo in?"; under directory-name order `core-cities` won and every continent question read "What country is Afghanistan in?". Same defect, opposite direction, no code change.

That is the argument that **load order must never be load-bearing**. It no longer is: the assembled graph is built from the relation registry, where each relation has exactly one owning pack, so there is no merge step left for order to decide. Ordering is fixed at directory-name order purely so failures and logs read the same way twice.

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

**It reports every problem, not the first.** An author who has just written a pack wants the whole list; failing fast turns one bad file into one error per run.

**It paid for itself on the first run, which is the argument for it.** Pointed at the three packs we already shipped, the validator refused to boot on two defects that had been live and silent:

- The `located_in` collision (#38) — the failure the rule was written for, still unfixed on `main` at the time.
- Six statements (Fiji, Kiribati, Palau, Solomon Islands, Tuvalu, Vanuatu) pointing at `Q538`, Wikidata's Oceania-the-*region*, while `core-geo` owns `Q55643`, Oceania-the-*continent*. Nothing had ever noticed, because a dangling object reference is invisible until someone answers: the prompt renders off the subject, and only grading resolves the object — so those six questions displayed fine and 404'd on submit.

The second is the more instructive one. It is not a rule anybody would have thought to write down, and no amount of reading the pack would have surfaced it; it needed the whole graph checked at once. That is the case for a validator over a convention.

## Which pack a question came from

A question carries its **pack id and human label**, resolved from the manifest at load. The web UI shows the label as the quiz card's eyebrow.

This replaced a stopgap where the frontend parsed the `cardId` prefix (`cc:tokyo-japan:object`) against a hard-coded code→name map — fragile, and it coupled the UI to the cardId format.

The answer log stores no pack id. It already records the statement, and a statement belongs to exactly one pack, so provenance stays derivable at read time — the same way the question text is derived rather than stored. See [../storage/](../storage/).

## The learner selects packs

> **[UNREVIEWED]** — decided in a design session against #20 and built in the same pass. Confirm the three-state vocabulary (focused / checked / included) is the distinction you want the UI to carry, and that a server-side singleton is the right home for the selection.

The learner picks a set of packs, and **every question they are asked comes from that set**. Selection is a *hard eligibility constraint*, not a weighting hint: a deselected pack is never drawn from, however clever the scheduler later becomes. This is compatible with "packs are not load-time-selectable" precisely because it is a **draw-time** filter — the deselected pack stays loaded, resolvable, and merely ineligible.

**Only packs that yield questions are selectable.** `core-geo` is entities-only, so it can never appear in the picker: a checkbox for it would do nothing whichever way it was set.

**The selection is server-side persisted state** — a singleton preference, because this system has no user concept and inventing one to hold a set of checkboxes would be backwards. It lives beside the answer log with `GET /packs` and `PUT /packs` over it. The alternative, a client-owned query parameter on each draw, keeps the server stateless and was the cheaper build, but loses the selection whenever the learner changes browser.

**First run selects everything; the empty set is refused.** Defaulting to all means introducing the picker regresses nothing. Empty is rejected at the picker *and* at the contract boundary — treating it as "unfiltered" would have the UI show every box clear while questions kept arriving, which is the app lying about its own state.

**Selection never touches the answer log.** It governs what will be asked and nothing else: history is never hidden, filtered, or rewritten when a pack is deselected, and `/answer` and `/answers` keep resolving recorded cards against the *full* graph. This is precisely why deselection must not unload anything — a card recorded from a now-deselected pack still has to resolve, or old rows blank out and old submissions 404.

### Three states the UI keeps apart

The picker distinguishes what a naive checkbox list would conflate, and the words matter because two of them are easy to both call "selected":

- **focused** — whose details you are reading. Changes nothing.
- **checked** — your pending edit, held in the browser.
- **included** — what the server actually draws from, changed only on Save.

Reading about a pack is therefore free, and no question you are asked changes until you commit. Save is the seam between *checked* and *included*.

### The queue, and what is deliberately not decided

Filtering is applied when the **question queue** is built, not per draw. The queue is the ordered list of cards ahead of the learner; deselecting removes that pack's cards from it, and selecting folds the new pack's cards in among the ones still queued, so the learner keeps their place. Drawing is therefore *without replacement* — a full pass shows every card once before any repeats — where the old per-request uniform draw could ask the same thing twice running.

**The scheduler itself is deliberately not designed.** The queue exists because the picker needs somewhere for "what you'll be asked next" to live; it is the smallest thing that gives deselection a visible, correct meaning. How a queue is ordered, how a newly included pack folds in, and what happens at the end of a pass are all *scheduling policy* and belong to the scheduler session. `packages/engine/src/queue.ts` says so at the top. Don't build on its ordering guarantees.

Two constraints do survive whatever the scheduler becomes. Card *resolution* must keep seeing the full graph even when *selection* does not. And **pack filtering does not fix question mix**: `continental-countries` ships 193 statements against `core-cities`' 6, so any selection containing both is ~97% continent questions. That is a weighting problem, and no amount of filtering addresses it.

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
