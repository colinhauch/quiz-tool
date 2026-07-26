# The MVP Pack Bootstrap

How the one `core-cities` pack gets built, given that the import pipeline it would normally come from is deferred. See [README.md](README.md) for the pipeline itself.

## A one-off script, whose output is committed

The pack is generated once by a throwaway SPARQL query against the Wikidata Query Service. The resulting `.jsonl` is committed to the repository and *is* the pack. The script is not maintained, not tested, not part of the build, and not the pipeline — it is scaffolding that gets kicked away.

**Scope: 100 cities**, plus the countries and continents they need. Cut down from ~300 in the 2026-07-17 review — the pack's job is to exercise the engine, and 100 does that as well as 300 while making the exclusions below reviewable by hand.

> **[UNREVIEWED]** — "Top 100" needs a criterion, and it is not yet chosen. Population is the obvious one (`P1082`), but it is ambiguous in a way that matters: city proper vs. metropolitan area vs. urban agglomeration disagree wildly (city-proper puts Chongqing top and drops Tokyo far down the list). Wikidata carries several, qualified by date and by `determination method`. Whatever is chosen, the query has to pick one and say so.

## Why this isn't the import tooling we said we wouldn't build

[ROADMAP.md](../../ROADMAP.md) lists "the Wikidata import tooling itself" as an MVP non-goal, and separately promises a "hand-built `core-cities` pack." Those two are in tension, and reading them literally produces something nobody would do.

Entities are keyed by Wikidata Q-IDs — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md). So "hand-built" means a human looking up roughly 300 city Q-IDs and 200 country Q-IDs by hand, one at a time, and typing them correctly. That is not a bootstrap; it is data entry with a silent failure mode, because a wrong Q-ID looks exactly like a right one until something downstream can't resolve it. `identity.md` even names the reason the Q-ID correspondence exists in the first place: *"the alternative is hand-authoring hundreds of thousands of facts."* The design chose Q-IDs specifically so that nobody would hand-author facts. Hand-authoring the first pack would be the one case where we ignore that.

The non-goal is doing real work; it is just aimed at something else. What it protects against is **shipping and maintaining a pipeline** — a general, re-runnable ETL with source adapters, incremental updates, and a stability contract. That is a project. Running one query once and committing the answer is not that project, and the distinction is what gets committed: **a data file, not a pipeline.** Nothing in the app knows the script ever existed.

This also lands where [README.md](README.md) already pointed. It says packs are "built by ETL, not hand-authored" and that "the MVP's single hand-built pack is a bootstrap, not the model." The bootstrap is a script. ROADMAP.md's "hand-built" was the outlier, and has been corrected.

## Why the alternatives lost

**Truly hand-authoring** it would at least force us to feel the format's ergonomics the way an external author will, which is a genuine benefit we are giving up. But it tests the format against a use case the design says will never be the real one, and it pays for that test in Q-ID lookups.

**Letting an agent write the pack from memory** is fast and needs no tooling. It also invents Q-IDs. A hallucinated Q-ID is a plausible-looking string that resolves to the wrong city or to nothing, and it surfaces long after the pack is committed. The whole value of Q-IDs is that they are authoritative; generating them from a language model's memory throws that away while keeping the syntax.

**Building the real import tooling now** means never doing this twice, and one day it is the right call. Today it trades the entire MVP timeline for a pipeline we cannot yet specify — see the statement-ID problem below, which is unresolved and blocks doing it properly.

## Simplicity is produced, not found

The MVP treats the world as simple: one country per city, one continent per country, no history, no disputes. **The source data is not simple, so the script has to make it so.** Checked against live Wikidata during the 2026-07-17 review, `P17` (country) on four cities:

| City | `P17` claims | Ranks |
| --- | --- | --- |
| Dijon | 1 — France | `normal` |
| Taipei | 2 — Taiwan; Empire of Japan (ended) | `preferred`, `normal` |
| Beirut | 5 — Lebanon + 4 historical (ended) | `preferred`, 4× `normal` |
| Jerusalem | 17 — including Israel *and* Palestine | **two `preferred`**, rest `normal` |

Two lessons. Historical claims are **ordinary**, not exotic — Beirut is not a disputed city and still carries four ended countries; any unfiltered query returns temporal facts. And **rank does not resolve the hard case**: Jerusalem has two `preferred` claims, separated by a `P518` ("applies to part") qualifier. Wikidata's rank is an editorial layer, and it declines to adjudicate exactly where the world does.

So the script filters, in this order:

1. **Best rank only** — take truthy claims, drop `deprecated`.
2. **Drop anything with an `end` qualifier.** Removes Beirut's four historical countries and Taipei's Empire of Japan. What survives is current by construction.
3. **Drop any entity that still has more than one claim.** Jerusalem falls out here.

**Step 3 is a deliberate omission, and its exclusion list is committed next to the pack.** A dropped city is **backfilled** from the next candidate down the ranking, so the pack is exactly 100 cities rather than "100 minus however many were hard".

The cost that buys: the drops stop being visible in the row count, so **the exclusion list is the only record that they happened.** It is not an artifact of the build — it is the evidence, and it belongs in review alongside the pack. Without it, "100 cities" quietly reads as "the top 100 cities", and the difference is exactly the interesting cities.

It is an omission rather than a dodge because the disputes have a real design waiting for them: a later `disputed-land` pack states them as facts — `s(Q_government_of_israel, claims, Q1218)` and `s(Q_state_of_palestine, claims, Q1218)` — rather than picking a winner. The claimant is a *government*, not a country. The dispute *is* the data. This needs no engine support and no new relation machinery, which is the uniform fact model working as intended; see [../knowledge-graph/README.md](../knowledge-graph/README.md). The alternative — a `disputed` flag, or leaning on rank to pick — would put a political judgement inside the engine.

**The rule this establishes: an entity the MVP cannot state simply is excluded, not simplified.** Choosing a country for Jerusalem to keep the row count up would be the engine telling a lie it has no standing to tell.

## The side effect: statement-ID stability stops blocking us

[../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md) raises a real and unsolved problem: if ETL re-runs and emits new IDs for the same facts, every user's answer history for that pack is silently orphaned. It notes the problem is "not urgent while packs are hand-built."

A pack generated once and committed is never rebuilt, so it has no rebuild problem. The question doesn't get answered here — it gets **postponed on purpose**, and the postponement is sound rather than lucky: there is no re-run to be unstable across.

Two caveats keep this honest. The question still **constrains the pack format**, which is a contract with external authors and future ETL — whether [../packs/format.md](../packs/format.md) leaves a deliberate, documented hole there is decided in the packs review, not here. And the postponement expires the moment a second pack is generated, or this one is regenerated. If someone re-runs the script against fresher Wikidata and commits the result, the problem arrives in full, and any answer history against the old pack is what pays for it. **Regenerating this pack is not a routine act.**

## The second pack (`capitals`) uses the same bootstrap

> **[UNREVIEWED]** — written when `capitals` was designed, before it was built. Confirm the "generate-once, never rebuild" reading actually holds the postponement, and that `cap:`/`cc:` prefix namespacing is the real answer to cross-pack ID collision rather than a convenience.

The section above warned that the postponement "expires the moment a second pack is generated." That moment is here: `capitals` is the second pack, and it is built the **same way** — a throwaway SPARQL query (each current sovereign state, `P31 wd:Q3624078`, and its `P36` capital), run once against WDQS, output committed as `.jsonl` and never rebuilt. The script is scaffolding, not pipeline; nothing in the app knows it ran.

The warning was about the wrong thing to fear here. What orphans history is **ID churn across rebuilds of one pack**, not the *existence* of a second pack. Two packs each generated once and frozen are two independent no-rebuild situations, so each keeps its history intact for the same reason `core-cities` does. What a second pack genuinely introduces is **cross-pack ID collision**, and that is already answered: statement IDs are prefixed by pack (`cc:`, `cap:`), which the collision rule in [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md) names as the structural fix. So the postponement holds — but only as long as neither pack is regenerated, which stays a deliberate, non-routine act.

One data decision belongs to this bootstrap rather than the engine: **`P36` is multi-valued** (South Africa, Bolivia, historical capitals with end-dates). The query keeps the preferred-rank, non-historical value; a country still left ambiguous is **omitted and logged**, never guessed. That trades a handful of genuinely multi-capital countries for the guarantee that every shipped `has_capital` statement has exactly one correct answer — which the single-answer `checkAnswer` requires, and which the qualifier machinery that would model multiple capitals doesn't exist to relax yet (see the qualifier discussion in [../knowledge-graph/statements.md](../knowledge-graph/statements.md)).

## `core-geo`: a published entity tranche, re-runnable but frozen

> **[UNREVIEWED]** — written when `core-geo` was built (ticket #28). Confirm the "re-runnable but not routinely re-run" framing, and that curating types in the list (rather than reading Wikidata `P31`) is the right call.

`core-geo` is the sole owner of every shared geographic entity — continents, sovereign countries, capital cities, and core cities (see [../knowledge-graph/identity.md](../knowledge-graph/identity.md)). It ships `entities.jsonl` only: no statements, no generators, so it yields no questions on its own. It exists so that the topic tranches — `core-cities` and later `capital-cities`, `continental-countries` — can ship statements over shared identity and no entities of their own, which is what the single-ownership assembly requires.

It sharpens the one-off bootstrap above in one way: its script (`packs/core-geo/fetch-entities.mjs`) is **kept and re-runnable**, not thrown away. The input is a committed, curated, fixed Q-ID list (`curated-qids.tsv`) — author-supplied, so the *set* of entities is a deliberate choice, not a query that drifts as the world changes. The script only resolves each Q-ID's English label and `en` aliases from WDQS and emits rows in the list's order, so a "publish" is **deterministic**: same list in, byte-identical file out. Types come from the curated list, not from Wikidata `P31`, so the author controls exactly what each entity *is* (a Q-ID has many `P31` values; picking one deterministically is its own problem we skip).

Re-runnable is not routine, for the same reason [the statement-ID postponement](#the-side-effect-statement-id-stability-stops-blocking-us) gives: regenerating against fresher Wikidata can move labels, and answer history joins on the Q-ID. The file is committed and reviewed precisely so a regeneration is a visible, deliberate act. One immediate payoff of fetching real labels rather than hand-authoring: it caught a wrong Q-ID in the original `core-cities` fixture — `Q1963` was labelled "São Paulo" but is actually Khartoum (Sudan's capital); São Paulo is `Q174`. Hand-authored Q-IDs fail silently exactly this way, which is the whole argument for [../knowledge-graph/identity.md](../knowledge-graph/identity.md)'s Q-ID scheme.
